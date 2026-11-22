// 操作マニュアル「輸血一覧」(docs/manual/transfusion-worklist.md)
// 医師 四郎が入院の「見本 太郎」に撮影日 14 時投与の照射赤血球液を依頼し、検査 春子(臨床検査技師)が輸血一覧で受け付けて
// 出庫し、看護 次郎が投与の実施を記録する。見本 太郎は血液型が検査で確定していないので、依頼と出庫で警告が出る。
// 製剤番号はバーコードを読まずに手で入れる。撮影の前後に、撮影日の輸血の依頼を出庫・実施の記録ごと消す。
import { addDays, blur, labeled, logout, menuItem, openKarte, settle } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const PRODUCT = "照射赤血球液-LR「日赤」2単位";
const BAG_NUMBER = "131234567890";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["transfusion"]);
  await openKarte(page, PATIENT);
  await registerTransfusion(page);
  await logout(page);

  // 輸血一覧
  await login("labTech");
  await openDepartmentMenu(page, "輸血部門", "輸血一覧");
  const rows = page.locator("tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("撮影日の輸血一覧に撮影用でない行があります");
  const filters = page.locator(".patient-search-form");
  await mark(page.getByText("投与予定日", { exact: true }).first(), { label: 1, place: "corner" });
  await mark(page.getByText("採血予定日", { exact: true }).first(), { label: 2, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "輸血検査区分" }), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(4), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(6), { label: 5, place: "corner" });
  await mark(row.getByRole("button", { name: "受付" }), { label: 6, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), row], padding: 24 });
  await clearMarks();

  // 受付と出庫
  await row.getByRole("button", { name: "受付" }).click();
  await row.getByRole("button", { name: "出庫" }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T13:30:00+09:00`));
  await row.getByRole("button", { name: "出庫" }).click();
  const issue = page.locator(".modal").filter({ hasText: "輸血の出庫" }).first();
  await issue.getByRole("button", { name: "出庫", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(issue, "製剤番号").locator("input").fill(BAG_NUMBER);
  await labeled(issue, "有効期限").locator("input").fill(addDays(SHOOTING_DATE, 19));
  await labeled(issue, "交差適合試験").locator("select").selectOption({ label: "適合" });
  await issue.locator("label").filter({ hasText: /^照射済$/ }).locator("input").check();
  await blur(page);
  await settle(issue);
  await mark(issue.locator("ul").first(), { label: 1 });
  await mark(labeled(issue, "出庫日時"), { label: 2, place: "corner" });
  await mark(labeled(issue, "バーコード"), { label: 3, place: "corner" });
  await mark(labeled(issue, "製剤番号"), { label: 4, place: "corner" });
  await mark(labeled(issue, "有効期限"), { label: 5, place: "corner" });
  await mark(labeled(issue, "交差適合試験"), { label: 6, place: "corner" });
  await mark(issue.getByRole("button", { name: "出庫", exact: true }), { label: 7 });
  await shot("02-issue", { target: issue, padding: 24 });
  await clearMarks();
  await issue.getByRole("button", { name: "出庫", exact: true }).click();
  const confirm = page.locator(".modal").filter({ hasText: "警告の確認" }).last();
  await confirm.waitFor();
  const reasons = confirm.getByRole("combobox", { name: "理由" });
  for (let i = 0; i < (await reasons.count()); i += 1) await reasons.nth(i).selectOption({ index: 1 });
  await blur(page);
  await settle(confirm);
  await mark(confirm.locator(".advisory-confirm-modal__head").first(), { label: 1 });
  await mark(confirm.locator(".advisory-confirm-modal__reason").first(), { label: 2 });
  await shot("03-issue-confirm", { target: confirm, padding: 24 });
  await clearMarks();
  await confirm.getByRole("button", { name: /^(登録|出庫)$/ }).last().click();
  await issue.waitFor({ state: "detached" });
  await row.getByText("出庫済", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "この輸血の操作" }).click().catch(() => row.locator("button").last().click());
  await page.locator(".row-menu__items").last().waitFor();
  await mark(row.getByText("出庫済", { exact: true }), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "実施" }), { label: 2, place: "corner" });
  await mark(menuItem(page, "出庫取消"), { label: 3 });
  await shot("04-issued", { target: [row, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await page.keyboard.press("Escape");
  await logout(page);

  // 病棟で投与して実施を記録する
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T15:10:00+09:00`));
  await login("nurse");
  await openDepartmentMenu(page, "輸血部門", "輸血一覧");
  await row.getByRole("button", { name: "実施" }).click();
  // 実施入力の前に、患者・実施者・確認者・バッグを照合する
  const collation = page.locator(".modal").filter({ hasText: "照合" }).last();
  await collation.getByRole("button", { name: "照合完了" }).waitFor();
  await labeled(collation, "確認者").locator("select").selectOption({ label: "看護 夏子" });
  const reader = labeled(collation, "読み取り").locator("input");
  for (const code of ["80", BAG_NUMBER]) {
    await reader.fill(code);
    await reader.press("Enter");
  }
  await collation.getByText(`バッグ ${BAG_NUMBER} 一致`).waitFor();
  await blur(page);
  await settle(collation);
  await mark(labeled(collation, "確認者"), { label: 1, place: "corner" });
  await mark(labeled(collation, "読み取り"), { label: 2, place: "corner" });
  await mark(collation.locator("table, tbody").first(), { label: 3 });
  await mark(collation.getByRole("button", { name: "照合完了" }), { label: 4, place: "corner" });
  await shot("05-collation", { target: collation, padding: 24 });
  await clearMarks();
  await collation.getByRole("button", { name: "照合完了" }).click();

  const perform = page.locator(".modal").filter({ hasText: "輸血の実施入力" }).last();
  const submit = perform.getByRole("button", { name: "実施登録" });
  await submit.waitFor();
  await page.waitForLoadState("networkidle");
  const observation = (point) => perform.getByRole("row").filter({ hasText: point }).locator("input");
  for (const [point, values] of [
    ["投与前", ["112", "68", "76", "36.8", "98", "16"]],
    ["5分後", ["114", "70", "78", "36.8", "98", "16"]],
    ["15分後", ["116", "70", "76", "36.9", "98", "16"]],
  ]) {
    for (const [k, value] of values.entries()) await observation(point).nth(k + 1).fill(value);
  }
  await perform.getByRole("button", { name: "なし", exact: true }).click();
  await blur(page);
  await settle(perform);
  await mark(labeled(perform, "開始時刻"), { label: 1, place: "corner" });
  await mark(labeled(perform, "確認者"), { label: 2, place: "corner" });
  await mark(perform.locator("select").filter({ has: page.locator("option", { hasText: "返却" }) }), { label: 3, place: "corner" });
  await mark(perform.getByRole("table").first(), { label: 4 });
  await mark(perform.getByRole("button", { name: "なし", exact: true }).locator(".."), { label: 5 });
  await mark(submit, { label: 6, place: "corner" });
  await shot("06-perform", { target: perform, padding: 24 });
  await clearMarks();
  await submit.click();
  await perform.waitFor({ state: "detached" });
  await row.getByText("実施済", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.getByText("実施済", { exact: true }), { label: 1, place: "corner" });
  await shot("07-performed", { target: row });
  await clearMarks();

  await logout(page);
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["transfusion"]);
}

/** 開いているカルテから、撮影日 14 時に投与する照射赤血球液を依頼する(血液型が確定していない警告は理由を選んで進める)。 */
async function registerTransfusion(page) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "輸血", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const common = fieldset("依頼共通");
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ index: 1 });
  await labeled(common, "投与予定日時").locator("input").fill(`${SHOOTING_DATE}T14:00`);
  await labeled(common, "使用目的").locator("input").fill("術中出血による貧血");
  const product = fieldset("製剤").locator(".transfusion-order__product").first();
  await product.locator(".transfusion-order__product-name select").selectOption({ label: PRODUCT });
  await labeled(product, "単位数").locator("input").fill("2");
  await form.locator(".transfusion-order__consent input").check();
  await blur(page);
  await form.locator(".prescription-form__actions").getByRole("button", { name: "登録", exact: true }).click();
  const confirm = page.locator(".modal").filter({ hasText: "警告の確認" });
  await confirm.waitFor();
  const reasons = confirm.getByRole("combobox", { name: "理由" });
  for (let i = 0; i < (await reasons.count()); i += 1) await reasons.nth(i).selectOption({ index: 1 });
  await confirm.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
