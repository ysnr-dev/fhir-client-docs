// 操作マニュアル「退院時サマリー」(docs/manual/discharge-summary.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者。早期胃癌)の退院時サマリーを、退院前に下書きで書いて撮る。
// 撮影の前後に、この患者の退院時サマリーのカードをカルテから削除して、毎回同じ画面から始める。
import { blur, labeled, menuItem, openKarte } from "../lib/karte.mjs";

/** 退院時サマリーの削除は理由の画面ではなく確認のダイアログなので、ダイアログを受けて消す。 */
async function deleteSummaries(page, cards) {
  await page.waitForLoadState("networkidle");
  for (let remaining = await cards.count(); remaining > 0; remaining = await cards.count()) {
    page.once("dialog", (dialog) => dialog.accept());
    await cards.first().getByRole("button", { name: /の操作$/ }).click();
    await menuItem(page, "削除").click();
    await cards.nth(remaining - 1).waitFor({ state: "detached" });
  }
}

const PATIENT = "見本 太郎";
const TEXTS = [
  "胃前庭部の早期胃癌に対し、内視鏡的粘膜下層剥離術を予定して入院した。",
  "術前の血液検査で貧血・凝固異常なし。",
  "腹痛・発熱なく、全粥食を摂取できている。",
  "退院 2 週後に外来で病理結果を説明する。",
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const summaryCards = page.locator(".karte-card").filter({ hasText: "退院時サマリー" });
  await deleteSummaries(page, summaryCards);

  // 退院時サマリー登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "退院時サマリー", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form, form").first();
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const info = fieldset("入院情報");
  await info.waitFor();
  await page.waitForLoadState("networkidle");

  // 対象の入院と入院情報
  await labeled(info, "転帰").locator("select").selectOption({ label: "自宅" });
  await blur(page);
  await mark(labeled(pane, "対象の入院"), { label: 1 });
  await mark(info.locator("dl"), { label: 2 });
  await mark(labeled(info, "転帰"), { label: 3, place: "corner" });
  await mark(labeled(info, "記録日時"), { label: 4, place: "corner" });
  await mark(labeled(info, "ステータス"), { label: 5, place: "corner" });
  await shot("02-encounter", { target: [labeled(pane, "対象の入院"), info], padding: 40 });
  await clearMarks();

  // 内容: 本文を書く
  const content = fieldset("内容");
  const editors = content.locator("[contenteditable=true]");
  for (let i = 0; i < TEXTS.length; i += 1) {
    // 自動で入った本文(入院経過の入院の記録など)の後ろに書き足す。
    const filled = await editors.nth(i).evaluate((el) => {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return el.textContent.trim().length > 0;
    });
    if (filled) await page.keyboard.press("Enter");
    await page.keyboard.insertText(TEXTS[i]);
  }
  await blur(page);
  await content.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const recollect = content.getByRole("button", { name: "再収集" });
  await mark(content.locator(".discharge-summary__title").filter({ hasText: "退院時診断" }), { label: 1 });
  await mark(recollect, { label: 2, place: "corner" });
  await mark(content.locator(".discharge-summary__title").filter({ hasText: "入院経過" }), { label: 3 });
  await mark(editors.first(), { label: 4 });
  await mark(content.getByRole("button", { name: "テンプレート" }).first(), { label: 5, place: "corner" });
  await shot("03-content", { target: [recollect, editors.nth(1)], padding: 40 });
  await clearMarks();

  // 内容の後半と登録
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(content.locator(".discharge-summary__title").filter({ hasText: "退院時処方" }), { label: 1 });
  await mark(content.locator(".discharge-summary__title").filter({ hasText: "退院時の状態" }), { label: 2 });
  await mark(content.locator(".discharge-summary__title").filter({ hasText: "退院後の方針" }), { label: 3 });
  await mark(content.locator(".discharge-summary__title").filter({ hasText: "アレルギー" }), { label: 4 });
  await mark(submit, { label: 5 });
  await shot("04-submit", { target: [content.locator(".discharge-summary__title").filter({ hasText: "退院時処方" }), submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await info.waitFor({ state: "detached" });
  const card = summaryCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  // 登録した退院時サマリーの操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(menuItem(page, "編集"), { label: 1 });
  await mark(menuItem(page, "削除"), { label: 2 });
  await shot("05-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteSummaries(page, summaryCards);
}
