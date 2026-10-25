import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";

test("durable outbox survives failure, retries idempotently and is isolated by account", async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks: { request: async (_, task) => task() } },
  });
  let fail = true;
  const committed = new Map();
  const connection = {
    supabaseUrl: "https://test.supabase.co",
    from: () => ({
      upsert: async (row, opts) => {
        assert.equal(opts.ignoreDuplicates, true);
        committed.set(row.id, row); // Simulate a commit with a lost response.
        return { error: fail ? new Error("offline") : null };
      },
    }),
  };
  const store = new Store({ id: "owner-one" }, connection);
  const row = { id: "same-event", score: 5 };
  await assert.rejects(store.record("attempts", row), /未同期/);
  assert.equal(store.pending.length, 1);
  assert.equal(store.data.attempts.length, 1);
  assert.equal(new Store({ id: "owner-two" }, connection).pending.length, 0);
  fail = false;
  const reopened = new Store({ id: "owner-one" }, connection);
  await reopened.flush();
  assert.equal(reopened.pending.length, 0);
  assert.equal(committed.size, 1);
  assert.equal(committed.get("same-event").user_id, "owner-one");
});

test("storage failure cannot be reported as saved in demo mode", async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("full");
    },
  };
  const store = new Store();
  await assert.rejects(store.record("attempts", { id: "lost" }), /full/);
  assert.equal(store.data.attempts.length, 0);
});
