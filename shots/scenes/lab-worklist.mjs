// 操作マニュアル「検体検査一覧とラベル」(docs/manual/lab-worklist.md)
// 医師 四郎が入院の「見本 太郎」と外来の「見本 花子」(撮影用の架空の患者)に撮影日の検体検査を出し、
// 検査 春子(臨床検査技師)が検体検査一覧で、病棟のラベルを一括で、外来のラベルを行から発行する。
// 見本 花子の管を検体到着確認で読んで実施済にし、一覧から結果を登録する。撮影の前後に、撮影日の検体検査を消す。
import { blur, labeled, logout, menuItem } from "../lib/karte.mjs";
import {
  LAB_INPATIENT,
  LAB_OUTPATIENT,
  issueLabel,
  labelsOf,
  openDepartmentMenu,
  openLabKarte,
  patientIdByName,
  registerLabOrder,
  removeShootingLabRecords,
} from "../lib/lab.mjs";
import { assertOnlyShootingPatients } from "../lib/pharmacy.mjs";

// 見本 花子の結果(結果登録の画面の行の順)。
const RESULTS = ["6.2", "4.35", "13.1", "39.8", "245", "91.5", "30.1", "32.9", "24", "31", "0.68"];

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が検体検査を出す
  await login("doctor");
  await openLabKarte(page, LAB_INPATIENT);
  await registerLabOrder(page, ["血算", "AST", "ALT", "Cre", "CRP"]);
  await openLabKarte(page, LAB_OUTPATIENT);
  await registerLabOrder(page, ["血算", "AST", "ALT", "Cre"]);
  await logout(page);

  // 検体検査一覧
  await login("labTech");
  await openDepartmentMenu(page, "臨床検査部門", "検体検査一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const outpatient = rows.filter({ hasText: LAB_OUTPATIENT });
  const inpatient = rows.filter({ hasText: LAB_INPATIENT });
  await inpatient.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const filters = page.locator(".patient-search-form");
  await mark(filters.locator("label").filter({ hasText: "検査日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "病棟" }), { label: 2, place: "corner" });
  await mark(outpatient.locator(".lab-worklist__content"), { label: 3, place: "corner" });
  await mark(outpatient.locator(".lab-worklist__status"), { label: 4, place: "corner" });
  await mark(outpatient.getByRole("link", { name: "ラベル発行" }), { label: 5, place: "corner" });
  await mark(outpatient.getByRole("button", { name: "表示" }), { label: 6, place: "corner" });
  await mark(page.getByRole("button", { name: "ラベル一括発行" }), { label: 7 });
  await shot("01-list", { target: [page.locator(".page__header"), page.locator(".lab-worklist__count")], padding: 24 });
  await clearMarks();

  // 病棟のラベルを一括で発行する
  await page.getByRole("button", { name: "ラベル一括発行" }).click();
  const modal = page.locator(".modal");
  const ward = modal.getByRole("row").filter({ hasText: "見本病棟" });
  await ward.waitFor();
  await ward.locator("input[type=checkbox]").check();
  await blur(page);
  await mark(modal.getByText(/^検査日/), { label: 1 });
  await mark(ward, { label: 2 });
  await mark(modal.getByRole("button", { name: "発行", exact: true }), { label: 3, place: "corner" });
  await mark(modal.getByRole("button", { name: "再発行" }), { label: 4, place: "corner" });
  await shot("02-bulk", { target: modal, padding: 40 });
  await clearMarks();
  const [pdf] = await Promise.all([
    page.context().waitForEvent("page"),
    modal.getByRole("button", { name: "発行", exact: true }).click(),
  ]);
  await pdf.waitForLoadState();
  await pdf.close();
  await modal.waitFor({ state: "detached" });
  await inpatient.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();

  // 外来のラベルを行から発行する。発行の直後は管の状態が読み直されていないことがあるので、開き直す。
  await issueLabel(page, outpatient);
  await page.reload();
  await outpatient.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(outpatient.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(inpatient.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(outpatient.getByRole("link", { name: "ラベル発行" }), { label: 2, place: "corner" });
  await shot("03-accepted", { target: [outpatient, inpatient] });
  await clearMarks();

  // 検査の内容と管の状態
  await outpatient.getByRole("button", { name: "表示" }).click();
  const view = page.locator(".modal");
  await view.getByText(/採取番号/).nth(1).waitFor();
  const groups = view.getByText(/^GP\d/);
  await mark(view.getByText("受付済", { exact: true }), { label: 1, place: "corner" });
  await mark(groups.first(), { label: 2 });
  await mark(view.getByText(/採取番号/).first(), { label: 3, place: "corner" });
  await shot("04-view", { target: view, padding: 40 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await view.waitFor({ state: "detached" });

  // 行のメニュー
  await inpatient.getByRole("button", { name: "この検査の操作" }).click();
  const menu = page.locator(".row-menu__items").last();
  await menu.waitFor();
  await mark(menuItem(page, "実施"), { label: 1 });
  await mark(menuItem(page, "取消"), { label: 2 });
  await mark(menuItem(page, "中止"), { label: 3 });
  await shot("05-menu", { target: [inpatient, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 見本 花子の管を検体到着確認で読む(写真は「検体到着確認」のページで撮る)
  const { numbers } = await labelsOf(page, LAB_OUTPATIENT);
  await openDepartmentMenu(page, "臨床検査部門", "検体到着確認");
  const input = page.getByPlaceholder("バーコードをスキャン(11桁)");
  for (const number of numbers) {
    await input.fill(number);
    await input.press("Enter");
    await page.locator(".lab-arrival__feed li").filter({ hasText: number }).waitFor();
  }
  await page.locator(".lab-arrival__result--completed").waitFor();

  // 実施済の行から結果を登録する
  await openDepartmentMenu(page, "臨床検査部門", "検体検査一覧");
  await outpatient.locator(".lab-worklist__status", { hasText: "実施済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(outpatient.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(outpatient.getByRole("button", { name: "結果登録" }), { label: 2, place: "corner" });
  await shot("06-completed", { target: outpatient });
  await clearMarks();

  await outpatient.getByRole("button", { name: "結果登録" }).click();
  const entry = page.locator(".modal");
  const lines = entry.locator(".lab-result-form__value-cell");
  await lines.nth(RESULTS.length - 1).waitFor();
  for (const [i, value] of RESULTS.entries()) await lines.nth(i).locator("input").first().fill(value);
  await blur(page);
  const common = entry.locator("fieldset").first();
  const altRow = entry.getByRole("row").filter({ hasText: "ALT" }).first();
  await mark(labeled(common, "検体採取日"), { label: 1, place: "corner" });
  await mark(labeled(common, "報告区分"), { label: 2, place: "corner" });
  await mark(lines.first().locator("input").first(), { label: 3 });
  await mark(altRow.getByLabel("H/L判定"), { label: 4, place: "corner" });
  await mark(altRow.getByRole("button", { name: "コメント" }), { label: 5, place: "corner" });
  await mark(entry.getByRole("button", { name: /検査項目追加/ }), { label: 6 });
  await mark(entry.getByRole("button", { name: "登録", exact: true }), { label: 7 });
  await shot("07-result", { target: entry, padding: 24 });
  await clearMarks();
  await entry.getByRole("button", { name: "登録", exact: true }).click();
  await entry.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  for (const name of [LAB_INPATIENT, LAB_OUTPATIENT]) await removeShootingLabRecords(page, await patientIdByName(page, name));
}
