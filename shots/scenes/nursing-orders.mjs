// 操作マニュアル「指示簿」(docs/manual/nursing-orders.md)
// 医師 四郎が入院中の「見本 秋子」(撮影用の架空の患者。誤嚥性肺炎)に看護指示を 2 行出し、看護 次郎が病棟の指示簿で
// 指示受けする。撮影の前後に、撮影日に出した看護指示を直接消す(看護指示は画面から削除できない)。
import { blur, labeled, logout, openKarte, patientIdOf, pickRow } from "../lib/karte.mjs";
import { NURSING_PATIENT, openNursingMenu, removeShootingDayNursing, wardField } from "../lib/nursing.mjs";

const ACT = "清拭";
const OBSERVATION = "呼吸数";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, NURSING_PATIENT);
  const patientId = patientIdOf(page);
  await removeShootingDayNursing(page, patientId);
  await page.reload();
  const pane = page.locator(".karte-right");
  await pane.waitFor();

  // 看護指示登録を開く
  const group = pane.locator(".karte-right__group-toggle", { hasText: "看護" });
  await group.click();
  const paneButton = pane.getByRole("button", { name: "看護指示", exact: true });
  await paneButton.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await mark(group, { label: 1 });
  await mark(paneButton, { label: 2 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();
  const form = pane.locator("form").first();
  await form.waitFor();

  // 1 行目: 看護行為を用語から選ぶ
  await form.getByRole("button", { name: "用語選択" }).first().click();
  let modal = page.locator(".modal").last();
  await modal.getByLabel("名称").fill(ACT);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  const actRow = modal.getByRole("row").filter({ has: page.getByRole("cell", { name: ACT, exact: true }) });
  await actRow.waitFor();
  await blur(page);
  await mark(modal.getByRole("tab", { name: "看護行為" }), { label: 1, place: "corner" });
  await mark(modal.getByLabel("名称"), { label: 2, place: "corner" });
  await mark(actRow, { label: 3 });
  await shot("02-term", { target: modal });
  await clearMarks();
  await pickRow(actRow);
  await modal.waitFor({ state: "detached" });
  await form.getByLabel("修飾語").first().selectOption({ label: "全身" });
  await form.getByLabel("頻度").first().selectOption({ label: "1日1回" });

  // 2 行目: 看護観察を用語から選ぶ
  await form.getByRole("button", { name: "行追加" }).click();
  await form.getByRole("button", { name: "用語選択" }).last().click();
  modal = page.locator(".modal").last();
  await modal.getByRole("tab", { name: "看護観察" }).click();
  await modal.getByLabel("名称").fill(OBSERVATION);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  const observationRow = modal.getByRole("row").filter({ has: page.getByRole("cell", { name: OBSERVATION, exact: true }) });
  await observationRow.waitFor();
  await pickRow(observationRow);
  await modal.waitFor({ state: "detached" });
  await form.getByLabel("頻度").last().selectOption({ label: "1日3回" });
  await form.getByLabel("条件").last().fill("25回/分以上で報告");
  await form.getByLabel("対象プロブレム").selectOption({ label: "#1 誤嚥性肺炎" });
  await blur(page);

  // 1 行目の入力
  const line = form.locator(".nursing-order-form__line").first();
  await line.scrollIntoViewIfNeeded();
  await mark(line.locator(".nursing-order-form__item"), { label: 1, place: "corner" });
  await mark(line.locator(".nursing-order-form__modifier"), { label: 2, place: "corner" });
  await mark(line.locator(".nursing-order-form__schedule"), { label: 3, place: "corner" });
  await mark(line.getByLabel("条件"), { label: 4, place: "corner" });
  await mark(line.locator(".nursing-order-form__dates"), { label: 5, place: "corner" });
  await shot("03-line", { target: line });
  await clearMarks();

  // 行を足して登録する
  const addLine = form.getByRole("button", { name: "行追加" });
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(addLine, { label: 1 });
  await mark(form.getByLabel("対象プロブレム"), { label: 2 });
  await mark(submit, { label: 3 });
  await shot("04-submit", { target: [form.locator(".nursing-order-form__line").last(), submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  await logout(page);

  // 看護師が病棟の指示簿を開く
  await login("nurse");
  await openNursingMenu(page, "指示簿");
  const table = page.locator("table.lab-worklist").first();
  const patientRow = table.getByRole("row").filter({ hasText: NURSING_PATIENT });
  await patientRow.first().waitFor();
  await mark(wardField(page), { label: 1, place: "corner" });
  await mark(page.getByRole("tab", { name: /未指示受け/ }), { label: 2, place: "corner" });
  await shot("05-worklist", { target: [page.locator(".page__header"), table] });
  await clearMarks();

  // 指示受けする
  await patientRow.first().getByRole("checkbox").check();
  const acceptButton = page.getByRole("button", { name: /件指示受け$/ });
  await mark(patientRow.first().getByRole("checkbox"), { label: 1 });
  await mark(acceptButton, { label: 2, place: "corner" });
  await shot("06-accept", { target: [acceptButton, table] });
  await clearMarks();
  await acceptButton.click();
  await page.waitForLoadState("networkidle");

  // 全指示で確かめる
  await page.getByRole("tab", { name: "全指示" }).click();
  await page.waitForLoadState("networkidle");
  const actRowInTable = table.getByRole("row").filter({ hasText: "清拭 全身" });
  await actRowInTable.waitFor();
  // 指示受けのあと読み直すと行が並べ替わるので、落ち着いてから印を付ける。
  await page.waitForTimeout(1000);
  await page.waitForLoadState("networkidle");
  await mark(actRowInTable.locator("td").nth(6), { label: 1, place: "corner" });
  await mark(actRowInTable.locator("td").nth(7), { label: 2, place: "corner" });
  await mark(actRowInTable.getByRole("button", { name: "表示" }), { label: 3, place: "corner" });
  await mark(actRowInTable.getByRole("button", { name: /の操作$/ }), { label: 4, place: "corner" });
  await shot("07-all", { target: table });
  await clearMarks();

  // 表示
  await actRowInTable.getByRole("button", { name: "表示" }).click();
  const detail = page.locator(".modal").last();
  await detail.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("08-detail", { target: detail });
  await detail.getByRole("button", { name: "閉じる" }).first().click();

  // 行のメニュー
  await actRowInTable.getByRole("button", { name: /の操作$/ }).click();
  const menu = actRowInTable.locator(".row-menu__items");
  await menu.waitFor();
  await shot("09-menu", { target: [actRowInTable.locator("td").nth(7), menu] });
  await page.keyboard.press("Escape");

  // カルテの指示簿タブ
  await openKarte(page, NURSING_PATIENT);
  await page.waitForLoadState("networkidle");
  const tabGroup = page.locator(".karte-tabs__group").filter({ hasText: "看護" });
  await tabGroup.locator(".karte-tabs__tab").hover();
  const tabMenu = page.locator(".karte-tabs__menu");
  const ordersTab = tabMenu.getByText("指示簿", { exact: true });
  await mark(ordersTab, { label: 1 });
  await shot("10-karte-tab", { target: [page.locator(".karte-tabs__list"), tabMenu], padding: 24 });
  await clearMarks();
  await ordersTab.click();
  await page.mouse.move(960, 1000);
  const panel = page.locator(".karte-left .karte-tabpanel");
  await panel.getByText("清拭 全身").first().waitFor();
  await page.waitForLoadState("networkidle");
  await mark(panel.getByRole("button", { name: "履歴", exact: true }), { label: 1, place: "corner" });
  await mark(labeled(panel, "終了・中止も表示"), { label: 2, place: "corner" });
  await mark(panel.getByRole("button", { name: "実施入力", exact: true }), { label: 3, place: "corner" });
  await mark(panel.getByRole("button", { name: "指示追加", exact: true }), { label: 4, place: "corner" });
  await shot("11-karte-orders", { target: [panel.getByText("指示簿", { exact: true }).first(), panel.locator("table").first()], padding: 32 });
  await clearMarks();

  await removeShootingDayNursing(page, patientId);
}
