// 操作マニュアル「透析一覧」(docs/manual/dialysis-worklist.md)
// 医師 四郎が入院の「見本 太郎」に撮影日から月水金・午前の血液透析(HD)を依頼し、工学 十郎(臨床工学技士)が透析一覧で
// 受け付けて 2 週ぶんの予約を展開し、撮影日の回の入室・開始・終了を記録する。
// 撮影の前後に、撮影日に出した透析の依頼を予約・実施記録ごと消す。
import { blur, labeled, logout, openKarte, pickRow, settle } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const DIALYSATE = "カーボスター透析剤・Ｌ ９Ｌ";
const ANTICOAGULANT = "ヘパリン";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["dialysis"]);
  await openKarte(page, PATIENT);
  await registerDialysis(page);
  await logout(page);

  // 透析室の設定で、撮影日の月の枠を作る(既にある日 × シフトは飛ばすので、何度流してもよい)
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T08:30:00+09:00`));
  await login("clinicalEngineer");
  await openDepartmentMenu(page, "透析部門", "透析室の設定");
  const generate = page.getByRole("button", { name: "生成", exact: true });
  await generate.waitFor();
  await page.waitForLoadState("networkidle");
  const slots = generate.locator("xpath=ancestor::*[self::section or self::fieldset or self::div][.//*[contains(text(), '枠の生成')]][1]");
  await mark(labeled(page.locator("main"), "開始日"), { label: 1, place: "corner" });
  await mark(labeled(page.locator("main"), "月数"), { label: 2, place: "corner" });
  await mark(generate, { label: 3, place: "corner" });
  await shot("01-unit-slots", { target: slots, padding: 24 });
  await clearMarks();
  await generate.click();
  await page.waitForLoadState("networkidle");

  // オーダーのタブで受け付けて、予約を展開する
  await openDepartmentMenu(page, "透析部門", "透析一覧");
  const tabs = page.locator(".order-select__tabs");
  await tabs.getByText(/^オーダー/).click();
  // 外来のデモ患者の依頼も並ぶので、入院に絞る
  await labeled(page.locator(".patient-search-form"), "入外区分").locator("select").selectOption({ label: "入院" });
  const orderRows = page.locator("tbody tr");
  const orderRow = orderRows.filter({ hasText: PATIENT });
  await orderRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await orderRows.count()) !== 1) throw new Error("透析のオーダーに撮影用でない入院の行があります");
  await mark(tabs.getByText(/^オーダー/), { label: 1, place: "corner" });
  await mark(labeled(page.locator(".patient-search-form"), "入外区分"), { label: 2, place: "corner" });
  await mark(orderRow.getByRole("button", { name: "受付" }), { label: 3, place: "corner" });
  await shot("02-orders", { target: [page.locator(".page__header"), orderRow], padding: 24 });
  await clearMarks();
  await orderRow.getByRole("button", { name: "受付" }).click();
  const expandButton = orderRow.getByRole("button", { name: /展開/ }).first();
  await expandButton.waitFor();
  await expandButton.click();
  const expand = page.locator(".modal").filter({ hasText: "透析予約の展開" });
  await expand.getByRole("row").filter({ hasText: /^月/ }).first().waitFor();
  await labeled(expand, "週数").locator("input").fill("2");
  for (const weekday of ["月", "水", "金"]) {
    await expand.getByRole("row").filter({ hasText: new RegExp(`^${weekday}\\s*午前`) }).locator("select").selectOption({ label: "1" });
  }
  await blur(page);
  await settle(expand);
  const submitExpand = expand.getByRole("button", { name: /^展開/ });
  await mark(labeled(expand, "開始日"), { label: 1, place: "corner" });
  await mark(labeled(expand, "週数"), { label: 2, place: "corner" });
  await mark(expand.locator("table").first(), { label: 3 });
  await mark(expand.locator("table").nth(1), { label: 4 });
  await mark(submitExpand, { label: 5 });
  await shot("03-expand", { target: expand, padding: 24 });
  await clearMarks();
  await submitExpand.click();
  await expand.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // ボード
  await tabs.getByText("ボード", { exact: true }).click();
  const card = page.locator("td").filter({ hasText: PATIENT }).first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("04-board", { target: [page.locator(".page__header"), page.locator("table").first()], padding: 24 });

  // 入室・開始・終了
  await card.getByRole("button", { name: "入室" }).click();
  await card.getByRole("button", { name: "開始" }).waitFor();
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T09:15:00+09:00`));
  await card.getByRole("button", { name: "開始" }).click();
  const start = page.locator(".modal").filter({ hasText: "透析の開始" });
  const startSubmit = start.getByRole("button", { name: "開始", exact: true });
  await startSubmit.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(start, "透析前体重").locator("input").fill("62.4");
  const preBp = labeled(start, "透析前血圧").locator("input");
  await preBp.nth(0).fill("146");
  await preBp.nth(1).fill("82");
  await blur(page);
  await settle(start);
  await mark(labeled(start, "開始時刻"), { label: 1, place: "corner" });
  await mark(labeled(start, "透析前体重"), { label: 2, place: "corner" });
  await mark(labeled(start, "透析前血圧"), { label: 3, place: "corner" });
  await mark(labeled(start, "ドライウェイト"), { label: 4, place: "corner" });
  await mark(startSubmit, { label: 5 });
  await shot("05-start", { target: start, padding: 24 });
  await clearMarks();
  await startSubmit.click();
  await start.waitFor({ state: "detached" });
  await card.getByRole("button", { name: "終了" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(card, { label: 1 });
  await mark(card.getByRole("button", { name: "終了" }), { label: 2, place: "corner" });
  await shot("06-running", { target: page.locator("table").first(), padding: 24 });
  await clearMarks();

  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T13:20:00+09:00`));
  await card.getByRole("button", { name: "終了" }).click();
  const finish = page.locator(".modal").filter({ hasText: "透析の終了" });
  const finishSubmit = finish.getByRole("button", { name: "終了", exact: true });
  await finishSubmit.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(finish, "透析後体重").locator("input").fill("60.3");
  const postBp = labeled(finish, "透析後血圧").locator("input");
  await postBp.nth(0).fill("128");
  await postBp.nth(1).fill("74");
  const heparin = finish.getByRole("row").filter({ hasText: "ヘパリン" });
  await heparin.locator("input").first().fill("1");
  await blur(page);
  await settle(finish);
  await finish.getByText("透析の終了", { exact: false }).first().scrollIntoViewIfNeeded();
  await mark(labeled(finish, "終了時刻"), { label: 1, place: "corner" });
  await mark(labeled(finish, "透析後体重"), { label: 2, place: "corner" });
  await mark(labeled(finish, "除水量"), { label: 3, place: "corner" });
  await mark(labeled(finish, "透析後血圧"), { label: 4, place: "corner" });
  await mark(labeled(finish, "QB"), { label: 5, place: "corner" });
  await mark(finish.getByRole("button", { name: "浄化器追加" }), { label: 6, place: "corner" });
  await mark(heparin.locator("input[type=checkbox]"), { label: 7, place: "corner" });
  await shot("07-finish", { target: finish, padding: 24 });
  await clearMarks();
  await finishSubmit.scrollIntoViewIfNeeded();
  await mark(finish.getByRole("button", { name: "器材追加" }), { label: 1, place: "corner" });
  await mark(finish.getByRole("button", { name: "診療行為追加" }), { label: 2, place: "corner" });
  await mark(finish.locator("textarea").last(), { label: 3 });
  await mark(finishSubmit, { label: 4 });
  await shot("08-finish-rest", { target: finish, padding: 24 });
  await clearMarks();
  await finishSubmit.click();
  await finish.waitFor({ state: "detached" });
  await card.getByText("実施済").first().waitFor().catch(() => {});
  await page.waitForLoadState("networkidle");
  await shot("09-done", { target: page.locator("table").first(), padding: 24 });

  await logout(page);
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["dialysis"]);
}

/** 開いているカルテから、撮影日から月水金・午前の血液透析を依頼する。 */
export async function registerDialysis(page) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "透析", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const content = fieldset("透析内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(content, "浄化方法").locator("select").selectOption({ label: "血液透析(HD)" });
  await labeled(fieldset("期間"), "開始日").locator("input").fill(SHOOTING_DATE);
  const morning = fieldset("曜日 × シフト").getByRole("row").filter({ hasText: "午前" });
  // 曜日の列は月曜から並ぶ(月水金 = 1・3・5 列目)。
  for (const column of [0, 2, 4]) await morning.locator("input[type=checkbox]").nth(column).check();
  const conditions = fieldset("透析条件");
  await labeled(conditions, "透析時間").locator("input").fill("240");
  await labeled(conditions, "QB").locator("input").fill("200");
  await labeled(conditions, "QD").locator("input").fill("500");
  await fieldset("使用液").getByRole("button", { name: "選択" }).first().click();
  let modal = page.locator(".modal").filter({ hasText: "透析液を選択" });
  await modal.getByRole("textbox").first().fill(DIALYSATE);
  let row = modal.getByRole("row").filter({ hasText: "カーボスター透析剤・Ｌ　９Ｌ" }).first();
  await row.waitFor();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });
  const anticoagulant = fieldset("抗凝固薬");
  await anticoagulant.getByRole("button", { name: "選択" }).click();
  modal = page.locator(".modal").filter({ hasText: "抗凝固薬を選択" });
  await modal.getByRole("textbox").first().fill(ANTICOAGULANT);
  row = modal.getByRole("row").filter({ hasText: "ヘパリン" }).first();
  await row.waitFor();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });
  await labeled(anticoagulant, "初回量").locator("input").fill("1000");
  await labeled(anticoagulant, "持続量").locator("input").fill("500");
  const access = fieldset("バスキュラーアクセス");
  await labeled(access, "種類").locator("select").selectOption({ label: "カテーテル" });
  await labeled(access, "部位").locator("input").fill("右内頸静脈");
  await blur(page);
  await form.getByRole("button", { name: "登録", exact: true }).last().click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
