import { validateTest } from "./school.js";

const fields = [
  "id",
  "exam_title",
  "exam_kind",
  "taken_on",
  "subject",
  "course",
  "score",
  "max_points",
  "average",
  "rank",
  "participants",
  "source_id",
  "analysis_id",
  "memo",
  "supersedes",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (row) => Object.fromEntries(fields.map((key) => [key, row[key]]));

// Validate the complete batch before the first write; owner IDs are never imported.
export function prepareTests(input, existing = []) {
  if (
    input.schema_version !== 1 ||
    !Array.isArray(input.test_results) ||
    input.test_results.length > 1000
  )
    throw new Error(
      "schema_version=1 のテスト記録JSON（1000件以下）を選んでください。",
    );
  const seen = new Set();
  const rows = input.test_results.map((raw) => {
    const row = clean(raw);
    if (!uuid.test(row.id) || seen.has(row.id) || row.supersedes !== null)
      throw new Error(
        "IDの重複・形式・訂正データを確認してください。訂正は画面から行ってください。",
      );
    seen.add(row.id);
    validateTest(row);
    const old = existing.find((item) => item.id === row.id);
    if (old && JSON.stringify(clean(old)) !== JSON.stringify(row))
      throw new Error(
        "同じIDの既存記録と内容が異なります。上書きせず画面から訂正してください。",
      );
    return row;
  });
  return rows.filter((row) => !existing.some((old) => old.id === row.id));
}
