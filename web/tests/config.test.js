import test from "node:test";
import assert from "node:assert/strict";
import config from "../vite.config.js";

test("a build rejects private keys and incomplete Supabase settings", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_secret_not_a_real_key";
    assert.throws(() => config({ mode: "test" }), /must not be bundled/);
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "";
    assert.throws(() => config({ mode: "test" }), /both/);
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_not_a_real_key";
    assert.deepEqual(config({ mode: "test" }), {});
  } finally {
    if (url === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = url;
    if (key === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  }
});
