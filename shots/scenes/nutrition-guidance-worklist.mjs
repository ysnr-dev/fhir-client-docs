// 操作マニュアル「栄養指導一覧」(docs/manual/nutrition-guidance-worklist.md)
// 医師 四郎が外来の「見本 花子」(高血圧症)に減塩の栄養指導を依頼し、栄養 桃子(管理栄養士)が栄養指導一覧で受け付けて、
// 栄養相談室の枠に予約を取り、指導を記録する。撮影の前後に、撮影日に出した栄養指導を予約・実施記録ごと消す。
import { blur, labeled, logout, menuItem, openKarte, settle } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["nutrition-guidance"]);
  await openKarte(page, PATIENT);
  await registerNutritionGuidance(page);
  await logout(page);

  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T10:00:00+09:00`));
  await login("dietitian");
  await openDepartmentMenu(page, "栄養部門", "栄養指導一覧");
  // 期間の続く開発データの入院の依頼も並ぶので、外来に絞る
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "入外区分").locator("select").selectOption({ label: "外来" });
  const rows = page.locator("tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("外来の栄養指導一覧に撮影用でない行があります");
  await blur(page);
  await mark(labeled(filters, "基準日"), { label: 1, place: "corner" });
  await mark(labeled(filters, "入外区分"), { label: 2, place: "corner" });
  await mark(row.locator("td").nth(5), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(6), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(8), { label: 5, place: "corner" });
  await mark(row.locator("td").nth(9), { label: 6, place: "corner" });
  await mark(row.getByRole("button", { name: "受付" }), { label: 7, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), row], padding: 24 });
  await clearMarks();

  // 受付して、その日の指導を記録する
  await row.getByRole("button", { name: "受付" }).click();
  await row.getByRole("button", { name: "実施", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T11:40:00+09:00`));
  await row.getByRole("button", { name: "実施", exact: true }).click();
  const perform = page.locator(".modal").filter({ hasText: "実施入力" }).last();
  const submit = perform.getByRole("button", { name: "実施登録" });
  await submit.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(perform, "実施時刻").locator("input").fill("11:00");
  await labeled(perform, "指導種別").locator("select").selectOption({ label: "初回指導" });
  await labeled(perform, "実施時間").locator("input").fill("30");
  await perform.locator("textarea").first().fill("塩分の多い食品(漬物・汁物・加工品)と、だし・香辛料を使った減塩の工夫を説明。朝の味噌汁を 1 日 1 杯にすることを目標にした");
  await blur(page);
  await settle(perform);
  await mark(labeled(perform, "実施日"), { label: 1, place: "corner" });
  await mark(labeled(perform, "実施時刻"), { label: 2, place: "corner" });
  await mark(labeled(perform, "指導種別"), { label: 3, place: "corner" });
  await mark(labeled(perform, "実施時間"), { label: 4, place: "corner" });
  await mark(labeled(perform, "担当管理栄養士"), { label: 5, place: "corner" });
  await mark(perform.locator("textarea").first(), { label: 6 });
  await mark(perform.getByRole("button", { name: "テンプレート" }), { label: 7, place: "corner" });
  await mark(submit, { label: 8 });
  await shot("02-perform", { target: perform, padding: 24 });
  await clearMarks();
  await submit.click();
  await perform.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 次回の予約(2 週後)
  await row.getByRole("button", { name: "次回予約" }).click();
  const booking = page.locator(".modal").filter({ hasText: "次回予約" }).last();
  const scheduleSelect = labeled(booking, "予約枠").locator("select");
  await scheduleSelect.locator("option").nth(1).waitFor({ state: "attached" });
  if (!(await scheduleSelect.inputValue())) await scheduleSelect.selectOption({ index: 1 });
  const picker = booking.locator(".appointment-picker");
  const day = picker.locator(".appointment-month button").filter({ hasText: /^15空き/ }).first();
  await day.click();
  const slot = picker.locator(".appointment-times__list button").first();
  await slot.click();
  await blur(page);
  await settle(booking);
  await mark(labeled(booking, "予約枠"), { label: 1 });
  await mark(day, { label: 2, place: "corner" });
  await mark(slot, { label: 3, place: "corner" });
  await mark(booking.getByRole("button", { name: "この枠で予約" }), { label: 4 });
  await shot("03-booking", { target: booking, padding: 24 });
  await clearMarks();
  await booking.getByRole("button", { name: "この枠で予約" }).click();
  await booking.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  await row.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "終了").waitFor();
  await mark(row.locator("td").nth(8), { label: 1, place: "corner" });
  await mark(row.locator("td").nth(9), { label: 2, place: "corner" });
  await mark(menuItem(page, "終了"), { label: 3 });
  await shot("04-performed", { target: [row, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await logout(page);
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["nutrition-guidance"]);
}

/** 開いているカルテから、減塩の栄養指導(指示食種は減塩食)を依頼する。 */
async function registerNutritionGuidance(page) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "栄養指導", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const content = fieldset("指導内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");
  const target = fieldset("対象");
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
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
