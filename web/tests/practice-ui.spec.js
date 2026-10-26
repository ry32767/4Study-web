import { test, expect } from "@playwright/test";
import { samples } from "../src/sample.js";

for (const width of [1440, 390]) {
  test(`dedicated practice, four choices and repeatable per-blank recall at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await page
      .getByRole("button", { name: "教科別の演習", exact: true })
      .click();
    await page.locator("#subject").selectOption("数II");
    await page
      .getByRole("button", { name: "解く", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "問題を解く", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("自分の回答・途中式").fill("平方完成して求める");
    await expect(page.locator("#grading")).toBeHidden();
    await page.getByRole("button", { name: "解答・解説を確認する" }).click();
    await expect(
      page.getByText(samples[0].explanation, { exact: true }),
    ).toBeVisible();
    await page.getByLabel("獲得点").fill("10");
    await page.screenshot({
      path: testInfo.outputPath(`practice-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "結果を記録する" }).click();
    await expect(
      page.getByRole("heading", { name: "結果を記録しました" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "次の問題へ" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "教科別の演習", exact: true })
      .click();
    await page.locator("#subject").selectOption("論理表現");
    await page.getByRole("button", { name: "解く", exact: true }).click();
    await expect(page.getByRole("radio")).toHaveCount(4);
    await page.getByRole("button", { name: "解答・解説を確認する" }).click();
    await expect(page.locator("#notice")).toHaveText(
      "答えを1つ選んでください。",
    );
    await expect(page.locator("#grading")).toBeHidden();
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "解答・解説を確認する" }).click();
    await expect(page.getByLabel("獲得点")).toHaveValue("0");
    await page.getByRole("button", { name: "結果を記録する" }).click();
    await page.getByRole("button", { name: "この問題を覚える" }).click();
    const card = page.locator(".memory-card").first();
    const flip = card.locator(".sticky-answer").first();
    await expect(card.locator(".revealed-answer").first()).toBeHidden();
    await expect(
      card.getByRole("button", { name: "間違えた ＋1" }).first(),
    ).toBeDisabled();
    await flip.focus();
    await page.keyboard.press("Enter");
    await expect(card.locator(".revealed-answer").first()).toBeVisible();
    await card.getByRole("button", { name: "間違えた ＋1" }).first().click();
    await expect(card.locator(".recall-count").first()).toHaveText(
      "間違えた回数：1回",
    );
    await expect(
      card.getByRole("button", { name: "間違えた ＋1" }).first(),
    ).toBeDisabled();
    await flip.click();
    await flip.click();
    await card.getByRole("button", { name: "覚えていた" }).first().click();
    await expect(card.locator(".recall-count").first()).toHaveText(
      "間違えた回数：1回",
    );
    await flip.click();
    await flip.click();
    await card.getByRole("button", { name: "間違えた ＋1" }).first().click();
    await expect(card.locator(".recall-count").first()).toHaveText(
      "間違えた回数：2回",
    );
    await flip.click();
    await page.screenshot({
      path: testInfo.outputPath(`memory-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.reload();
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await page
      .getByRole("button", { name: "覚える", exact: true })
      .first()
      .click();
    await page.getByLabel("暗記で間違えた印がある問題だけ").check();
    await expect(page.locator(".recall-count").first()).toHaveText(
      "間違えた回数：2回",
    );
    await expect(page.locator(".recall-count").nth(1)).toHaveText(
      "間違えた回数：0回",
    );
    const data = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          Object.keys(localStorage).find((k) => k.endsWith(":demo")),
        ),
      ),
    );
    expect(data.recall_events).toHaveLength(3);
    expect(data.attempts).toHaveLength(2);
    expect(data.attempts[1].response).toBe(samples[4].choices[1]);
    expect(errors).toEqual([]);
  });
}

for (const width of [1440, 390]) {
  test(`question navigation retains drafts and worksheet switches at ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    await page
      .getByRole("button", { name: "教科別の演習", exact: true })
      .click();
    await page
      .getByRole("button", { name: "このセットを解く", exact: true })
      .click();
    const nav = page.getByRole("navigation", { name: "問題番号" });
    await page.getByLabel("自分の回答・途中式").fill("途中式を保持");
    await nav.getByRole("button").nth(1).click();
    await nav.getByRole("button").nth(0).click();
    await expect(page.getByLabel("自分の回答・途中式")).toHaveValue(
      "途中式を保持",
    );
    await page.getByRole("button", { name: "解答・解説を確認する" }).click();
    await page.getByLabel("獲得点").fill("2");
    await nav.getByRole("button").nth(1).click();
    await nav.getByRole("button").nth(0).click();
    await expect(page.getByLabel("獲得点")).toHaveValue("2");
    await expect(page.locator("#grading")).toBeVisible();
    await page.getByRole("button", { name: "結果を記録する" }).click();
    await page.getByRole("button", { name: "この問題をもう一度" }).click();
    await expect(page.getByLabel("自分の回答・途中式")).toHaveValue("");
    await page
      .getByRole("button", { name: "覚える", exact: true })
      .first()
      .click();
    await page.locator("#subject").selectOption("論理表現");
    await expect(page.locator(".recall-line")).toHaveCount(2);
    await page.locator(".sticky-answer").first().click();
    await expect(
      page.locator(".sticky-answer .revealed-answer").first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "すべて隠す" }).click();
    await expect(page.locator(".revealed-answer").first()).toBeHidden();
    await expect(
      page.getByRole("button", { name: "間違えた ＋1" }).first(),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath(`worksheet-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
