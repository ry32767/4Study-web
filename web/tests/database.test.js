import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { samples } from "../src/sample.js";
import { validateQuestions, selectDaily, jstDay } from "../src/core.js";

test("migration, RLS, immutable versions, corrections, idempotency and daily RPC", async () => {
  const db = new PGlite();
  const first = "11111111-1111-4111-8111-111111111111",
    second = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      insert into auth.users values ('${first}'), ('${second}');`);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610230001_study.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610230002_test_results.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610250001_unknown_test_date.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610250002_practice_memory.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    // Supabase's project defaults may initially grant more than select/insert.
    await db.exec("grant all on public.recall_events to authenticated, anon");
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610250003_recall_permissions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610260001_source_fidelity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from public.recall_events"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from public.questions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.get_daily_set(20)"),
      /permission denied/,
    );
    await db.exec(
      `reset role; set role authenticated; set request.jwt.claim.sub = '${first}'`,
    );
    const normalized = validateQuestions(samples);
    // Old JSON without the additional fields can still be imported after this migration.
    await db.query("select public.import_questions($1::jsonb)", [
      JSON.stringify([samples[0]]),
    ]);
    await db.query("select public.import_questions($1::jsonb)", [
      JSON.stringify(normalized),
    ]);
    await db.query("select public.import_questions($1::jsonb)", [
      JSON.stringify(normalized),
    ]);
    assert.equal(
      (await db.query("select * from public.questions")).rows.length,
      samples.length,
    );
    const recallInsert = `insert into public.recall_events(user_id,id,question_id,question_version,blank_id,occurred_at,result) values($1,$2,$3,1,$4,now(),$5) on conflict(user_id,id) do nothing`;
    const recallId = "12345678-1234-4234-8234-123456789abc";
    await db.query(recallInsert, [
      first,
      recallId,
      samples[4].id,
      "relative",
      "wrong",
    ]);
    await db.query(recallInsert, [
      first,
      recallId,
      samples[4].id,
      "relative",
      "wrong",
    ]);
    assert.equal(
      (await db.query("select * from public.recall_events")).rows.length,
      1,
    );
    await assert.rejects(
      db.query(recallInsert, [
        first,
        "12345678-1234-4234-8234-123456789abd",
        samples[4].id,
        "missing",
        "wrong",
      ]),
      /Unknown blank/,
    );
    await assert.rejects(
      db.query("update public.recall_events set result='known'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.recall_events"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.import_questions($1::jsonb)", [
        JSON.stringify([
          {
            ...normalized[0],
            id: "invalid-choices",
            choices: ["a", "a", "b", "c"],
          },
        ]),
      ]),
      /unique/,
    );
    await assert.rejects(
      db.query("select public.import_questions($1::jsonb)", [
        JSON.stringify([{ ...normalized[0], answer: "changed" }]),
      ]),
      /different content/,
    );
    await assert.rejects(
      db.query("update public.questions set answer = 'changed'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.questions"),
      /permission denied/,
    );
    const plan = (await db.query("select public.get_daily_set(20) as plan"))
      .rows[0].plan;
    assert.deepEqual(plan.items, selectDaily(samples, [], jstDay()).items);
    assert.deepEqual(
      (await db.query("select public.get_daily_set(5) as plan")).rows[0].plan,
      plan,
    );
    const insert = `insert into public.attempts(user_id,id,question_id,question_version,attempted_at,response,score,max_points,grading,confidence,hint,seconds,supersedes)
      values($1,$2,$3,1,'2026-10-22T01:00:00Z','', $4,10,$5,'unknown',false,10,$6) on conflict(user_id,id) do nothing`;
    const event = "33333333-3333-4333-8333-333333333333";
    await db.query(insert, [first, event, samples[0].id, 5, "self", null]);
    await db.query(insert, [first, event, samples[0].id, 5, "self", null]);
    assert.equal(
      (await db.query("select * from public.attempts")).rows.length,
      1,
    );
    await db.query(
      `insert into public.activities(user_id,id,occurred_at,subject,unit,kind,minutes,source_id)
      values($1,'77777777-7777-4777-8777-777777777777',now(),'数学','二次関数','reading',15,'SYNTHETIC')`,
      [first],
    );
    await assert.rejects(
      db.query("delete from public.attempts"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.attempts set score=0"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(insert, [
        second,
        "44444444-4444-4444-8444-444444444444",
        samples[0].id,
        5,
        "self",
        null,
      ]),
    );
    await assert.rejects(
      db.query(insert, [
        first,
        "44444444-4444-4444-8444-444444444444",
        samples[0].id,
        11,
        "self",
        null,
      ]),
    );
    await db.query(insert, [
      first,
      "44444444-4444-4444-8444-444444444444",
      samples[0].id,
      8,
      "self",
      event,
    ]);
    await assert.rejects(
      db.query(insert, [
        first,
        "55555555-5555-4555-8555-555555555555",
        samples[0].id,
        6,
        "self",
        event,
      ]),
    );
    await db.exec(`set request.jwt.claim.sub = '${second}'`);
    assert.equal(
      (await db.query("select * from public.recall_events")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(recallInsert, [
        first,
        "12345678-1234-4234-8234-123456789abe",
        samples[4].id,
        "relative",
        "wrong",
      ]),
    );
    assert.equal(
      (await db.query("select * from public.questions")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.attempts")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.daily_sets")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.activities")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        `insert into public.activities(user_id,id,occurred_at,subject,unit,kind,minutes,source_id)
      values($1,'88888888-8888-4888-8888-888888888888',now(),'数学','','reading',15,'')`,
        [first],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(insert, [
        second,
        "66666666-6666-4666-8666-666666666666",
        samples[0].id,
        5,
        "self",
        null,
      ]),
    );
    await db.query("select public.import_questions($1::jsonb)", [
      JSON.stringify(normalized),
    ]);
    const otherPlan = (await db.query("select public.get_daily_set(5) as plan"))
      .rows[0].plan;
    assert.equal(otherPlan.user_id, second);
    assert.notDeepEqual(otherPlan.items, plan.items);
    await assert.rejects(
      db.query(
        "insert into public.daily_sets(user_id,day,budget,items) values($1,current_date,20,'[]')",
        [second],
      ),
      /permission denied/,
    );
    const testInsert = `insert into public.test_results(user_id,id,exam_title,exam_kind,taken_on,subject,course,score,max_points,supersedes) values($1,$2,'合成中間考査','midterm',current_date,'数学','数CIII',$3,100,$4) on conflict(user_id,id) do nothing`;
    const tid = "99999999-9999-4999-8999-999999999999";
    await db.query(testInsert, [second, tid, 60, null]);
    await db.query(testInsert, [second, tid, 60, null]);
    assert.equal(
      (await db.query("select * from public.test_results")).rows.length,
      1,
    );
    await assert.rejects(
      db.query(testInsert, [
        first,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        50,
        null,
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query(testInsert, [
        second,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        101,
        null,
      ]),
    );
    await db.query(testInsert, [
      second,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      70,
      tid,
    ]);
    await assert.rejects(
      db.query("update public.test_results set score=0"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.test_results"),
      /permission denied/,
    );
    await db.exec(`set request.jwt.claim.sub = '${first}'`);
    assert.equal(
      (await db.query("select * from public.test_results")).rows.length,
      0,
    );
    await db.query(
      `insert into public.test_results(user_id,id,exam_title,exam_kind,taken_on,subject,course,score,max_points)
      values ($1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Unknown date','quiz',null,'英語','EC II',10,20)`,
      [first],
    );
    assert.equal(
      (await db.query("select taken_on from public.test_results")).rows[0]
        .taken_on,
      null,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select * from public.test_results"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
