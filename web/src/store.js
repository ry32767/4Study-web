import { createClient } from "@supabase/supabase-js";
import { samples } from "./sample.js";
import { SCHEMA_VERSION, selectDaily, validateQuestions } from "./core.js";

const DEMO_USER = "00000000-0000-4000-8000-000000000000";
const env = import.meta.env || {};
export const client =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
    : null;
function read(key, fallback) {
  const text = localStorage.getItem(key);
  if (text === null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "端末内の記録を読めません。保存領域を消去せず、データを確認してください。",
    );
  }
}
export class Store {
  constructor(user = null, connection = client) {
    this.user = user;
    this.connection = connection;
    this.owner = user?.id || DEMO_USER;
    this.prefix = `four-study:v1:${connection ? new URL(connection.supabaseUrl).hostname : "local"}:${this.owner}`;
    this.data = {
      questions: [],
      attempts: [],
      activities: [],
      daily_sets: [],
      test_results: [],
    };
  }
  get demo() {
    return !this.user;
  }
  get pending() {
    return this.demo ? [] : read(`${this.prefix}:queue`, []);
  }
  write(key, value) {
    localStorage.setItem(`${this.prefix}:${key}`, JSON.stringify(value));
  }
  async lock(task) {
    // Web Locks serialize tabs on this origin; required for preserving the local outbox.
    if (!globalThis.navigator?.locks)
      throw new Error(
        "このブラウザでは安全な記録保存を利用できません。HTTPSまたはlocalhostで開いてください。",
      );
    return navigator.locks.request(this.prefix, task);
  }
  async load() {
    if (this.demo) {
      this.data = read(`${this.prefix}:demo`, {
        questions: samples,
        attempts: [],
        activities: [],
        daily_sets: [],
        test_results: [],
      });
      this.data.test_results ??= [];
      return;
    }
    // No cloud data cache: a signed-out/shared browser must not display previous user's data.
    const tables = [
      "questions",
      "attempts",
      "activities",
      "daily_sets",
      "test_results",
    ];
    const rows = await Promise.all(
      tables.map(async (table) => {
        let all = [],
          from = 0;
        for (;;) {
          let query = this.connection
            .from(table)
            .select("*")
            .eq("user_id", this.owner)
            .order(
              table === "questions"
                ? "id"
                : table === "daily_sets"
                  ? "day"
                  : "id",
            );
          if (table === "questions") query = query.order("version");
          const { data, error } = await query.range(from, from + 999);
          if (error)
            throw new Error(
              "記録を取得できません。接続とDB設定を確認してください。",
            );
          all.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
        return all;
      }),
    );
    tables.forEach((t, i) => {
      this.data[t] = rows[i];
    });
    for (const item of this.pending) this.merge(item.table, item.row);
  }
  merge(table, row) {
    if (!this.data[table].some((r) => r.id === row.id))
      this.data[table].push(row);
  }
  persistDemo() {
    this.write("demo", this.data);
  }
  async record(table, row) {
    const owned = { ...row, user_id: this.owner };
    if (this.demo) {
      const next = { ...this.data, [table]: [...this.data[table], owned] };
      this.write("demo", next);
      this.data = next;
      return;
    }
    if (!this.demo) {
      await this.lock(() => {
        const queue = this.pending;
        queue.push({ table, row: owned });
        this.write("queue", queue); // Persist before showing success; storage failure leaves UI unsaved.
      });
    }
    this.merge(table, owned);
    await this.flush();
  }
  async flush() {
    if (this.demo) return;
    await this.lock(async () => {
      for (const item of this.pending) {
        const { error } = await this.connection
          .from(item.table)
          .upsert(item.row, {
            onConflict: "user_id,id",
            ignoreDuplicates: true,
          });
        if (error)
          throw new Error(
            "端末には記録済みです。未同期のため、接続後に「同期」を押してください。",
          );
        this.write(
          "queue",
          this.pending.filter((p) => p.row.id !== item.row.id),
        );
      }
    });
  }
  async plan(day, budget) {
    let plan = this.data.daily_sets.find((p) => p.day === day);
    if (plan) return plan;
    if (this.demo) {
      plan = {
        ...selectDaily(this.data.questions, this.data.attempts, day, budget),
        user_id: this.owner,
      };
      this.data.daily_sets.push(plan);
      this.persistDemo();
    } else {
      const { data, error } = await this.connection.rpc("get_daily_set", {
        p_budget: budget,
      });
      if (error)
        throw new Error(
          "今日の問題を作成できません。Supabaseの関数設定と接続を確認してください。",
        );
      plan = data;
      this.data.daily_sets.push(plan);
    }
    return plan;
  }
  async importQuestions(input) {
    const rows = validateQuestions(input);
    if (this.demo) {
      const keys = new Map(
        this.data.questions.map((q) => [`${q.id}@${q.version}`, q]),
      );
      for (const q of rows) {
        const k = `${q.id}@${q.version}`;
        if (
          keys.has(k) &&
          JSON.stringify(validateQuestions([keys.get(k)])[0]) !==
            JSON.stringify(q)
        )
          throw new Error(
            "既存の問題と同じID・版の内容が異なります。版を増やしてください。",
          );
      }
      for (const q of rows) keys.set(`${q.id}@${q.version}`, q);
      this.data.questions = [...keys.values()];
      this.persistDemo();
    } else {
      // RPC verifies identical duplicates and rejects changed versions atomically.
      const { error } = await this.connection.rpc("import_questions", {
        p_questions: rows,
      });
      if (error)
        throw new Error(
          "取り込みに失敗しました。既存版の変更や入力形式を確認してください。",
        );
      await this.load();
    }
    return rows.length;
  }
  export() {
    return {
      schema_version: SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      user_id: this.owner,
      ...this.data,
      pending_count: this.pending.length,
    };
  }
}
