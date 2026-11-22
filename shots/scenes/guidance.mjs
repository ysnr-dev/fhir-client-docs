// 操作マニュアル「栄養指導・服薬指導」(docs/manual/guidance.md)
// 外来の患者「見本 花子」(高血圧症)に減塩の栄養指導を、入院中の患者「見本 太郎」に服薬指導を依頼して撮る。
// 撮影の前後に、それぞれの患者の指導のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";

const fieldsetOf = (page, form, legend) =>
  form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");

  // ---- 栄養指導 ----
  await openKarte(page, "見本 花子");
  const nutritionCards = page.locator(".karte-card").filter({ hasText: "栄養指導" });
  await deleteAllCards(page, nutritionCards);
  const pane = page.locator(".karte-right");
  const nutritionButton = pane.getByRole("button", { name: "栄養指導", exact: true });
  const medicationButton = pane.getByRole("button", { name: "服薬指導", exact: true });
  await mark(nutritionButton, { label: 1 });
  await mark(medicationButton, { label: 2 });
  await shot("01-open");
  await clearMarks();
  await nutritionButton.click();

  let form = pane.locator(".prescription-form");
  const content = fieldsetOf(page, form, "指導内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");
  const target = fieldsetOf(page, form, "対象");
  await labeled(content, "指導目的").locator("textarea").fill("家庭での減塩(1 日 6 g 未満)の進め方");
  await target.getByRole("button", { name: "病名" }).click();
  const conditionPicker = page.locator(".modal").last();
  await conditionPicker.getByText("高血圧症").first().click();
  await conditionPicker.waitFor({ state: "detached" });
  await target.getByRole("button", { name: "食種選択" }).click();
  const dietPicker = page.locator(".modal").filter({ hasText: "食種選択" }).last();
  const dietRow = dietPicker.getByRole("row").filter({ hasText: "減塩食1600kcal" });
  await dietRow.waitFor();
  await dietRow.locator("td").nth(1).click();
  await dietPicker.waitFor({ state: "detached" });
  await labeled(target, "対象プロブレム").locator("select").selectOption({ label: "#1 高血圧症" });
  await blur(page);
  const period = fieldsetOf(page, form, "期間");
  await mark(labeled(content, "指導形態"), { label: 1 });
  await mark(labeled(content, "指導目的"), { label: 2 });
  await mark(content.getByRole("button", { name: "テンプレート" }), { label: 3, place: "corner" });
  await mark(labeled(period, "開始日"), { label: 4 });
  await mark(labeled(period, "終了日"), { label: 5, place: "corner" });
  await mark(target.locator(".rad-gp__reason"), { label: 6 });
  await mark(target.getByRole("button", { name: "変更" }).locator("xpath=.."), { label: 7 });
  await mark(labeled(target, "対象プロブレム"), { label: 8 });
  await shot("02-nutrition", { target: [content, target], padding: 40 });
  await clearMarks();

  let submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await form.waitFor({ state: "detached" });
  let card = nutritionCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("03-nutrition-card", { target: card });
  await deleteAllCards(page, nutritionCards);

  // ---- 服薬指導 ----
  await openKarte(page, "見本 太郎");
  const medicationCards = page.locator(".karte-card").filter({ hasText: "服薬指導" });
  await deleteAllCards(page, medicationCards);
  await pane.getByRole("button", { name: "服薬指導", exact: true }).click();
  form = pane.locator(".prescription-form");
  const guidance = fieldsetOf(page, form, "指導内容");
  await guidance.waitFor();
  await page.waitForLoadState("networkidle");
  for (const condition of ["多剤併用", "服薬状況の確認"]) {
    await guidance.locator("label").filter({ hasText: condition }).locator("input").check();
  }
  await labeled(guidance, "対象薬剤").locator("input, textarea").first().fill("入院時の持参薬 7 剤");
  await labeled(guidance, "指導してほしいこと").locator("textarea, input").first().fill("退院後の飲み方の整理と、残薬の確認");
  await blur(page);
  const medPeriod = fieldsetOf(page, form, "期間");
  await mark(labeled(guidance, "指導区分"), { label: 1 });
  await mark(guidance.locator("label").filter({ hasText: "ハイリスク薬" }).locator("xpath=.."), { label: 2 });
  await mark(labeled(guidance, "対象薬剤"), { label: 3 });
  await mark(labeled(guidance, "指導してほしいこと"), { label: 4 });
  await mark(labeled(medPeriod, "開始日"), { label: 5 });
  await shot("04-medication", { target: [guidance, medPeriod], padding: 40 });
  await clearMarks();

  submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await form.waitFor({ state: "detached" });
  card = medicationCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("05-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, medicationCards);
}
