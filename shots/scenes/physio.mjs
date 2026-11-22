// 操作マニュアル「生理検査」(docs/manual/physio.md)
// 患者「見本 花子」(撮影用の架空の患者)に、12 誘導心電図(予約不要)と腹部超音波検査(予約必須)を登録して撮る。
// 予約は生理検査室の枠表の撮影日の枠(撮影用データが撮影日から 4 週ぶん作る)から取る。
// 撮影の前後に、撮影日のカードをカルテから削除して、毎回同じ画面から始める(削除で予約の枠も空きに戻る)。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(".karte-card");
  await deleteAllCards(page, todaysCards);

  // 生理検査登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "生理検査", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 検査共通と撮影項目
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ label: "#1 高血圧症" });
  const tabs = form.locator(".order-select__tabs");
  const ecg = form.locator(".order-select__cell label").filter({ hasText: /^心電図12誘導$/ });
  await ecg.locator("input").check();
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(tabs, { label: 3 });
  await mark(ecg, { label: 4, place: "corner" });
  await shot("02-items", { target: [common, form.locator(".order-select__grid-wrap")], padding: 40 });
  await clearMarks();

  // 選んだ撮影項目(オーダーの枠)
  const frames = form.locator(".rad-order-frame");
  const ecgFrame = frames.first();
  await ecgFrame.locator('input[aria-label="依頼病名"]').fill("高血圧症");
  await labeled(ecgFrame, "検査目的").locator("textarea").fill("左室肥大の評価");
  await blur(page);
  await ecgFrame.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(ecgFrame, "至急区分"), { label: 1, place: "corner" });
  await mark(labeled(ecgFrame, "実施日"), { label: 2, place: "corner" });
  await mark(labeled(ecgFrame, "実施時刻"), { label: 3, place: "corner" });
  await mark(ecgFrame.locator(".rad-order-frame__undated"), { label: 4, place: "corner" });
  await mark(ecgFrame.locator(".rad-gp__head"), { label: 5 });
  await mark(labeled(ecgFrame, "依頼病名"), { label: 6 });
  await mark(labeled(ecgFrame, "検査目的"), { label: 7 });
  await mark(labeled(ecgFrame, "特別指示"), { label: 8 });
  await mark(ecgFrame.locator(".rad-order-frame__perform"), { label: 9 });
  await shot("03-frame", { target: ecgFrame, padding: 40 });
  await clearMarks();

  // 腹部超音波検査を足す: 予約必須の項目は別の枠になる
  await form.locator(".order-select__cell label").filter({ hasText: /^腹部超音波検査$/ }).locator("input").check();
  const echoFrame = frames.nth(1);
  await echoFrame.waitFor();
  await echoFrame.locator('input[aria-label="依頼病名"]').fill("脂肪肝の疑い");
  await labeled(echoFrame, "検査目的").locator("textarea").fill("肝機能障害の精査");
  await blur(page);
  await echoFrame.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(echoFrame.locator(".rad-order-frame__booking").getByRole("button", { name: "予約" }), { label: 1 });
  await mark(echoFrame.locator(".dose-conversion__badge", { hasText: "単独" }), { label: 2, place: "corner" });
  await shot("04-reserve", { target: echoFrame, padding: 40 });
  await clearMarks();

  // 検査予約
  await echoFrame.locator(".rad-order-frame__booking").getByRole("button", { name: "予約" }).click();
  const booking = page.locator(".modal").filter({ has: page.locator(".rad-booking") });
  const picker = booking.locator(".appointment-picker");
  await picker.locator(".appointment-month").waitFor();
  const day = picker.locator(".appointment-month button").filter({ hasText: /^1空き/ }).first();
  await day.click();
  const slot = picker.locator(".appointment-times__list button").filter({ hasText: /^10:00/ }).first();
  await slot.click();
  await blur(page);
  await mark(picker.locator(".appointment-picker__schedule"), { label: 1 });
  await mark(day, { label: 2, place: "corner" });
  await mark(slot, { label: 3, place: "corner" });
  await mark(booking.getByRole("button", { name: "この枠で予約" }), { label: 4 });
  await shot("05-booking", { target: booking });
  await clearMarks();
  await booking.getByRole("button", { name: "この枠で予約" }).click();
  await booking.waitFor({ state: "detached" });
  await blur(page);
  await mark(echoFrame.locator(".rad-order-frame__booking"), { label: 1, place: "corner" });
  await shot("06-booked", { target: echoFrame.locator(".rad-order-frame__head"), padding: 40 });
  await clearMarks();

  // 登録
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await shot("07-submit", { target: [echoFrame.locator(".rad-order-frame__foot"), submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const cards = todaysCards.filter({ hasText: "生理検査" });
  await cards.nth(1).waitFor();
  await shot("08-cards", { target: [cards.first(), cards.nth(1)] });

  // 登録した生理検査の操作
  const card = cards.filter({ hasText: "超音波" }).first();
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("09-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}
