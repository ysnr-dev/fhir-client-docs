// 操作マニュアル「バイタル」(docs/manual/vital.md)
// 外来の「見本 花子」(高血圧症で通院中)の撮影日の測定を入れて登録する。
// 撮影の前後に、撮影日のバイタルをカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const VITAL_CARD = ".karte-card--vital";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(VITAL_CARD);
  await deleteAllCards(page, todaysCards);

  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "バイタル", exact: true }).click();
  const form = right.locator("form.vital-form");
  await form.waitFor();

  // 測定値を入れる
  await form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select").selectOption({ label: "#1 高血圧症" });
  await form.getByLabel("収縮期血圧").fill("132");
  await form.getByLabel("拡張期血圧").fill("82");
  await form.getByLabel("意識(JCS)").selectOption({ index: 1 });
  for (const [label, value] of [["体温", "36.4"], ["脈拍", "70"], ["SpO2", "98"], ["酸素流量", "0"], ["呼吸数", "16"], ["身長", "156"], ["体重", "58.6"]]) {
    await form.getByLabel(label, { exact: true }).fill(value);
  }
  await blur(page);
  const rows = form.locator(".vital-form__row");
  const measuredAt = form.locator(".qp-field").filter({ hasText: "測定日時" }).locator("input");
  await mark(measuredAt, { label: 1 });
  await mark(form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select"), { label: 2 });
  await mark(form.getByLabel("収縮期血圧"), { label: 3, place: "corner" });
  await mark(form.getByLabel("体温", { exact: true }), { label: 4, place: "corner" });
  await mark(rows.filter({ hasText: "BMI" }).locator(".vital-form__derived-value"), { label: 5, place: "corner" });
  const news2 = rows.filter({ hasText: "NEWS2" });
  if (await news2.count()) await mark(news2.locator(".vital-form__derived-value"), { label: 6, place: "corner" });
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await mark(submit, { label: 7 });
  await shot("01-form", { target: [measuredAt, submit], padding: 48 });
  await clearMarks();
  await submit.click();

  // 登録したバイタル
  const card = todaysCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("02-card", { target: card });

  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(menuItem(page, "変更履歴"), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("03-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}
