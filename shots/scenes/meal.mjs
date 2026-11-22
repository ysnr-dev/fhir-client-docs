// 操作マニュアル「食事」(docs/manual/meal.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者。入院時の身長・体重あり)に、撮影日の昼食から胃潰瘍食・全粥を登録して撮る。
// 撮影の前後に、この患者の食事のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const DIET = "胃潰瘍食1600kcal";
const STAPLE = "全粥";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const mealCards = page.locator(".karte-card").filter({ hasText: "食事" });
  await deleteAllCards(page, mealCards);

  // 食事登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "食事", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const content = fieldset("食事内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");

  // 食種を選ぶ
  await content.getByRole("button", { name: "食種選択" }).click();
  const picker = page.locator(".modal").filter({ hasText: "食種選択" }).last();
  await labeled(picker, "種別").locator("select").selectOption({ label: "特別食" });
  const dietRow = picker.getByRole("row").filter({ hasText: DIET });
  await dietRow.waitFor();
  await blur(page);
  await mark(picker.getByRole("tab", { name: "パターン食" }).or(picker.getByText("パターン食", { exact: true })).first(), { label: 1, place: "corner" });
  await mark(labeled(picker, "名称・カナ"), { label: 2 });
  await mark(labeled(picker, "種別"), { label: 3, place: "corner" });
  await mark(picker.locator(".meal-nutrition-target"), { label: 4 });
  await mark(dietRow, { label: 5 });
  await shot("02-picker", { target: [picker.locator(".modal__header"), dietRow], padding: 40 });
  await clearMarks();
  await dietRow.locator("td").nth(1).click();
  await picker.waitFor({ state: "detached" });

  // 食事内容と主食・期間
  const staple = fieldset("主食");
  const period = fieldset("期間");
  for (const meal of ["朝", "昼", "夕"]) await labeled(staple, meal).locator("select").selectOption({ label: STAPLE });
  // 「開始」「終了」の朝・昼・夕は、期間の欄の 1 つ目・2 つ目の選択欄。
  const startMeal = period.locator("label").filter({ has: page.locator("select") }).nth(0);
  const endMeal = period.locator("label").filter({ has: page.locator("select") }).nth(1);
  await startMeal.locator("select").selectOption({ label: "昼食から" });
  await blur(page);
  await mark(content.locator(".meal-order__diet, .meal-diet-summary").first().or(content.getByRole("button", { name: /食種/ })).first(), { label: 1 });
  await mark(labeled(content, "副食形態"), { label: 2 });
  await mark(labeled(content, "塩分制限"), { label: 3, place: "corner" });
  await mark(labeled(content, "対象プロブレム"), { label: 4, place: "corner" });
  await mark(staple, { label: 5 });
  await mark(labeled(period, "開始日"), { label: 6, place: "corner" });
  await mark(startMeal, { label: 7, place: "corner" });
  await mark(labeled(period, "終了日"), { label: 8, place: "corner" });
  await mark(endMeal, { label: 9, place: "corner" });
  await shot("03-content", { target: [content, period], padding: 40 });
  await clearMarks();

  // 食物アレルギーとコメント・登録
  const allergy = fieldset("食物アレルギー");
  const comment = fieldset("コメント");
  await comment.locator("textarea").fill("刻み不要。温かいものを");
  await blur(page);
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(allergy, { label: 1 });
  await mark(comment.locator("textarea"), { label: 2 });
  await mark(submit, { label: 3 });
  await shot("04-submit", { target: [allergy, submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = mealCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  // 登録した食事の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(menuItem(page, "編集"), { label: 1 });
  await mark(menuItem(page, "削除"), { label: 2 });
  await shot("05-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 食事タブの暦
  const group = page.locator(".karte-tabs__group").filter({ hasText: "診療情報" });
  await group.locator(".karte-tabs__tab").hover();
  await page.locator(".karte-tabs__menu").getByText("食事", { exact: true }).click();
  const tab = page.locator(".karte-left .karte-tabpanel");
  await tab.locator(".meal-calendar").first().waitFor();
  await page.waitForLoadState("networkidle");
  const entries = tab.locator(".meal-calendar__entry");
  await mark(tab.locator(".meal-calendar__toolbar"), { label: 1 });
  await mark(entries.first(), { label: 2, place: "corner" });
  await mark(entries.nth(5), { label: 3, place: "corner" });
  await shot("06-calendar", { target: [tab.locator(".karte-tabpanel__header, .meal-calendar__toolbar").first(), tab.locator(".meal-calendar").first()], padding: 40 });
  await clearMarks();

  await page.locator(".karte-tabs__list").getByText("カルテ", { exact: true }).click();
  await mealCards.first().waitFor();
  await deleteAllCards(page, mealCards);
}
