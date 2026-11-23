// 操作マニュアル「外注検査」(docs/manual/lab-outsource.md)
// 医師 四郎が外来の「見本 花子」(撮影用の架空の患者)に、院内で測る項目(TSH・FT4)と外注の項目(Tg・PTH)を
// 撮影日に出す。検査 春子(臨床検査技師)が検体検査一覧でラベルを発行し、外注検査の画面で外注の管を提出して
// 外注伝票を刷る。管を検体到着確認で読んで実施済にし、一覧から結果を登録すると、外注の管が結果済になる。
// 外注先は撮影用データの「見本検査センター」(施設の既定の外注先)。撮影の前後に、撮影日の検体検査を消す。
import { blur, logout } from "../lib/karte.mjs";
import {
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

const SLIP = "内分泌・腫瘍マーカー伝票";
const ITEMS = ["TSH", "FT4", "Tg", "PTH"];
const OUTSOURCE = "見本検査センター";
// 結果登録の画面の行の順に入れる値。
const RESULTS = ["2.1", "1.2", "15.0", "45"];

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が院内と外注の項目を出す
  await login("doctor");
  await openLabKarte(page, LAB_OUTPATIENT);
  await registerLabOrder(page, ITEMS, { tab: SLIP });
  await logout(page);

  // 検体検査一覧での見え方
  await login("labTech");
  await openDepartmentMenu(page, "臨床検査部門", "検体検査一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: LAB_OUTPATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const filters = page.locator(".patient-search-form");
  await mark(filters.locator("label").filter({ hasText: "実施区分" }), { label: 1, place: "corner" });
  await mark(row.locator(".lab-worklist__content .dose-conversion__badge"), { label: 2, place: "corner" });
  await shot("01-worklist", { target: [page.locator(".page__header"), row], padding: 24 });
  await clearMarks();

  await issueLabel(page, row);
  await page.reload();
  await row.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "表示" }).click();
  const view = page.locator(".modal");
  await view.getByText(/採取番号/).nth(1).waitFor();
  const outsourced = view.locator(".karte-rp").filter({ hasText: "外注:" });
  await mark(outsourced.locator(".karte-order__group-name"), { label: 1, place: "corner" });
  await mark(outsourced.locator(".dose-conversion__badge").last(), { label: 2, place: "corner" });
  await shot("02-view", { target: view, padding: 40 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await view.waitFor({ state: "detached" });

  // 外注検査の画面で提出する
  await openDepartmentMenu(page, "臨床検査部門", "外注検査");
  const tubes = page.locator(".lab-worklist tbody tr");
  const tube = tubes.filter({ hasText: LAB_OUTPATIENT });
  await tube.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(tubes);
  const form = page.locator(".patient-search-form");
  const header = page.locator(".page__header");
  await tube.locator("input[type=checkbox]").check();
  await blur(page);
  await mark(form, { label: 1, place: "corner" });
  await mark(tube.locator("input[type=checkbox]"), { label: 2 });
  await mark(tube.locator(".lab-worklist__status"), { label: 3, place: "corner" });
  await mark(header.getByRole("button", { name: /^提出/ }), { label: 4, place: "corner" });
  await shot("03-list", { target: [header, page.locator(".lab-worklist__count")], padding: 24 });
  await clearMarks();

  await header.getByRole("button", { name: /^提出/ }).click();
  await page.getByText("絞り込みに該当する検査がありません").waitFor();
  await form.locator("label").filter({ hasText: "状況" }).locator("select").selectOption({ label: "結果未着" });
  await tube.locator(".lab-worklist__status", { hasText: "結果未着" }).waitFor();
  await mark(tube.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(tube.locator("td").nth(9), { label: 2, place: "corner" });
  await mark(tube.getByRole("button", { name: "取消" }), { label: 3, place: "corner" });
  await shot("04-submitted", { target: [page.locator(".lab-worklist thead"), tube] });
  await clearMarks();

  // 外注伝票(別のタブで開く。撮るときは同じタブで開き直す)
  await form.locator("label").filter({ hasText: "外注先" }).locator("select").selectOption({ label: OUTSOURCE });
  await page.waitForLoadState("networkidle");
  const slipLink = header.getByRole("link", { name: "外注伝票" });
  await mark(header.locator("label").filter({ hasText: "提出日" }), { label: 1, place: "corner" });
  await mark(slipLink, { label: 2, place: "corner" });
  await shot("05-slip-open", { target: header, padding: 24 });
  await clearMarks();
  const [slip] = await Promise.all([page.context().waitForEvent("page"), slipLink.click()]);
  const slipUrl = slip.url();
  await slip.close();
  await page.goto(slipUrl);
  await page.locator(".lab-outsource-slip__table tbody tr").filter({ hasText: LAB_OUTPATIENT }).waitFor();
  await page.waitForLoadState("networkidle");
  await shot("06-slip", { target: page.locator(".lab-outsource-slip__page"), padding: 8 });

  // 管を読んで実施済にし、一覧から結果を登録する
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const { numbers } = await labelsOf(page, LAB_OUTPATIENT);
  await openDepartmentMenu(page, "臨床検査部門", "検体到着確認");
  const input = page.getByPlaceholder("バーコードをスキャン(11桁)");
  for (const number of numbers) {
    await input.fill(number);
    await input.press("Enter");
    await page.locator(".lab-arrival__feed li").filter({ hasText: number }).waitFor();
  }
  await page.locator(".lab-arrival__result--completed").waitFor();

  await openDepartmentMenu(page, "臨床検査部門", "検体検査一覧");
  await row.locator(".lab-worklist__status", { hasText: "実施済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "結果登録" }).click();
  const entry = page.locator(".modal");
  const lines = entry.locator(".lab-result-form__value-cell");
  await lines.nth(RESULTS.length - 1).waitFor();
  for (const [i, value] of RESULTS.entries()) await lines.nth(i).locator("input").first().fill(value);
  await blur(page);
  const outsourcedLine = entry.getByRole("row").filter({ has: page.locator(".dose-conversion__badge") }).first();
  await mark(outsourcedLine.locator(".dose-conversion__badge"), { label: 1, place: "corner" });
  await shot("07-result", { target: entry, padding: 24 });
  await clearMarks();
  await entry.getByRole("button", { name: "登録", exact: true }).click();
  await entry.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 結果が届いた管
  await openDepartmentMenu(page, "臨床検査部門", "外注検査");
  await form.locator("label").filter({ hasText: "状況" }).locator("select").selectOption({ label: "結果済" });
  await tube.locator(".lab-worklist__status", { hasText: "結果済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(tube.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await shot("08-reported", { target: [page.locator(".lab-worklist thead"), tube] });
  await clearMarks();

  await removeShootingLabRecords(page, await patientIdByName(page, LAB_OUTPATIENT));
}
