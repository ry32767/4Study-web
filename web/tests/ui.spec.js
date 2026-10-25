import { test, expect } from "@playwright/test";
import { samples } from "../src/sample.js";

for (const width of [1440, 390]) {
  test(`daily practice, partial credit, correction, analytics, export and imports at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await expect(
      page.getByRole("heading", { name: "今日の学習", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`today-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "続きからはじめる" }).click();
    await page
      .getByRole("textbox", { name: "自分の回答・途中式" })
      .fill("自分の解答");
    await expect(page.locator("#grading")).toBeHidden();
    await page.getByRole("button", { name: "解答・解説を確認する" }).click();
    await page.getByRole("spinbutton", { name: "獲得点" }).fill("5");
    await page.getByRole("button", { name: "結果を記録する" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "学習の記録", exact: true }).click();
    await expect(page.locator(".score")).toHaveText("5 / 10");
    await page.getByRole("button", { name: "採点を訂正" }).click();
    await page.getByRole("spinbutton", { name: "獲得点" }).fill("8");
    await page.getByRole("button", { name: "訂正を記録する" }).click();
    await expect(page.getByText("訂正前", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "読んだ・覚えたを記録" }).click();
    await page.locator("dialog select[name=subject]").selectOption("数II");
    await page.getByRole("spinbutton", { name: "学習時間" }).fill("15");
    await page
      .getByRole("button", { name: "学習を記録する", exact: true })
      .click();
    await expect(page.getByText(/解説読了 ・ 15分/)).toBeVisible();
    await page
      .getByRole("button", { name: "学習の見取り図", exact: true })
      .click();
    await expect(page.getByText("80.0% / 1問")).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /未評価/ }).first(),
    ).toBeVisible();
    await expect(page.locator("#notice")).toBeEmpty({ timeout: 12000 });
    await page.screenshot({
      path: testInfo.outputPath(`analysis-${width}.png`),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    await page
      .getByRole("button", { name: "設定とデータ", exact: true })
      .click();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "全記録を書き出す" }).click();
    const download = await downloadEvent;
    await download.saveAs(testInfo.outputPath("study-export.json"));
    await page.locator("#question-file").setInputFiles({
      name: "questions.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          questions: [
            {
              ...samples[0],
              id: "ui-import",
              prompt: "<img src=x onerror=alert(1)> 合成問題",
            },
          ],
        }),
      ),
    });
    await expect(page.locator("#import-preview img")).toHaveCount(0);
    await page.getByLabel("内容と端末内保存を確認しました").check();
    await page.getByRole("button", { name: "取り込みを実行する" }).click();
    await page
      .getByRole("button", { name: "教科別の演習", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "<img src=x onerror=alert(1)> 合成問題",
      }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await page.getByRole("button", { name: "学習の記録", exact: true }).click();
    await expect(page.locator(".score")).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}
