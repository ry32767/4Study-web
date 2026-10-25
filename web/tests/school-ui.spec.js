import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`school profile, nested charts and test records at ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await expect(page.getByRole("img").first()).toHaveAttribute(
      "aria-label",
      /論理国語.*古典探究.*数II.*数CIII.*EC.*論理表現.*物理.*化学.*地理.*歴史.*情報/,
    );
    await page
      .getByRole("button", { name: "学習の見取り図", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "全教科のレーダーチャート" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "教科内のレーダーチャート" }),
    ).toBeVisible();
    await page.locator("#school-group").selectOption("論理表現");
    await expect(
      page.getByRole("cell", { name: "関係詞", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#school-group option[value=国語]")).toHaveCount(
      0,
    );
    await expect(
      page.locator("#school-group option[value=保健体育]"),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "テストの記録", exact: true })
      .click();
    await page.getByRole("button", { name: "テスト結果を記録する" }).click();
    await page.getByLabel("テスト名", { exact: true }).fill("合成・2学期中間");
    await page.locator("dialog select[name=subject]").selectOption("数CIII");
    await page.getByLabel("学校の科目名").fill("数CIII");
    await page.getByLabel("得点（空欄は未採点）").fill("101");
    await page.getByRole("button", { name: "テスト結果を保存" }).click();
    await expect(page.getByRole("alert")).toContainText("満点");
    await page.getByLabel("得点（空欄は未採点）").fill("60");
    await page.getByLabel("平均点（任意）").fill("50");
    await page.getByLabel("順位（任意）").fill("12");
    await page.getByLabel("受験者数（任意）").fill("40");
    await page.getByRole("button", { name: "テスト結果を保存" }).click();
    await expect(page.getByText("60 / 100", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "テスト記録を訂正" }).click();
    await page.getByLabel("得点（空欄は未採点）").fill("70");
    await page.getByRole("button", { name: "訂正したテストを保存" }).click();
    await expect(page.getByText("訂正前", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "学習の見取り図", exact: true })
      .click();
    await page.locator("#analysis-source").selectOption("tests");
    await page.locator("#days").selectOption("0");
    await page.locator("#school-group").selectOption("数CIII");
    await expect(page.getByText("70.0% / 1件")).toHaveCount(2);
    await expect(
      page.locator("#school-group option[value=数CIII]"),
    ).toHaveCount(1);
    await expect(page.locator("#notice")).toBeEmpty({ timeout: 12000 });
    await page.screenshot({
      path: testInfo.outputPath(`school-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "設定とデータ", exact: true })
      .click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "全記録を書き出す" }).click();
    await (await pending).saveAs(testInfo.outputPath("school-export.json"));
    await page.reload();
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await page
      .getByRole("button", { name: "テストの記録", exact: true })
      .click();
    await expect(page.getByText("70 / 100", { exact: true })).toBeVisible();
  });
}
