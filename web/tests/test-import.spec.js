import { test, expect } from "@playwright/test";
test("import unknown-date test, show all-time chart, and reimport without duplication", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  await page.getByRole("button", { name: "設定とデータ", exact: true }).click();
  const file = {
    name: "tests.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schema_version: 1,
        test_results: [
          {
            id: "12345678-1234-4234-8234-123456789012",
            exam_title: "合成の受験日不明テスト",
            exam_kind: "quiz",
            taken_on: null,
            subject: "英語",
            course: "EC II",
            score: 30,
            max_points: 50,
            average: null,
            rank: null,
            participants: null,
            source_id: "SYNTHETIC",
            analysis_id: "SYNTHETIC",
            memo: "",
            supersedes: null,
          },
        ],
      }),
    ),
  };
  await page.locator("#test-record-file").setInputFiles(file);
  await expect(page.locator("#test-import-preview")).toContainText(
    "1件追加 / 日付不明 1件",
  );
  await page.locator("#test-import-consent").check();
  await page
    .getByRole("button", { name: "テスト記録を取り込む", exact: true })
    .click();
  await page.locator("#test-record-file").setInputFiles(file);
  await expect(page.locator("#test-import-preview")).toContainText("0件追加");
  await page.getByRole("button", { name: "テストの記録", exact: true }).click();
  await expect(page.getByText("受験日不明 ・", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "学習の見取り図", exact: true })
    .click();
  await page.locator("#analysis-source").selectOption("tests");
  await page.locator("#days").selectOption("0");
  await expect(page.getByRole("img").first()).toHaveAttribute(
    "aria-label",
    /EC 60パーセント/,
  );
});
