// 操作マニュアル「細菌検査一覧」(docs/manual/micro-worklist.md)
// 医師 四郎が入院の「見本 太郎」に喀出痰の塗抹・培養・感受性を、外来の「見本 花子」(どちらも撮影用の架空の患者)に
// 血液培養を出し、検査 春子(臨床検査技師)が細菌検査一覧で受ける。血液培養はボトルのラベルを発行して
// 検体到着確認で読み、喀出痰はラベルを使わずに「受付」で受けて結果を登録する。撮影の前後に、撮影日の検査を消す。
import { blur, labeled, logout, menuItem } from "../lib/karte.mjs";
import {
  LAB_INPATIENT,
  LAB_OUTPATIENT,
  labelsOf,
  openDepartmentMenu,
  openLabKarte,
  patientIdByName,
  registerMicroOrder,
  removeShootingLabRecords,
} from "../lib/lab.mjs";
import { assertOnlyShootingPatients } from "../lib/pharmacy.mjs";

const ORGANISM = "Streptococcus pneumoniae";
// 感受性の行(頻用抗菌薬の一括追加の先頭から)の MIC と判定。
const SUSCEPTIBILITY = [
  ["0.06", "S"],
  ["0.12", "S"],
  ["0.25", "S"],
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が細菌検査を出す
  await login("doctor");
  await openLabKarte(page, LAB_INPATIENT);
  await registerMicroOrder(page, { specimen: "喀出痰", site: "気管内", items: ["塗抹・鏡検", "培養・同定", "薬剤感受性"] });
  await openLabKarte(page, LAB_OUTPATIENT);
  await registerMicroOrder(page, {
    specimen: "静脈血",
    site: "肘正中皮静脈",
    items: ["血液培養（好気ボトル）", "血液培養（嫌気ボトル）"],
  });
  await logout(page);

  // 細菌検査一覧
  await login("labTech");
  await openDepartmentMenu(page, "臨床検査部門", "細菌検査一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const sputum = rows.filter({ hasText: LAB_INPATIENT });
  const blood = rows.filter({ hasText: LAB_OUTPATIENT });
  await sputum.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const filters = page.locator(".patient-search-form");
  const cell = (row, header) => row.locator("td").nth(headerIndex[header]);
  const headerIndex = Object.fromEntries(
    (await page.locator(".lab-worklist thead th").allInnerTexts()).map((text, i) => [text.trim(), i]),
  );
  await mark(filters.locator("label").filter({ hasText: "検査日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "未完了" }), { label: 2, place: "corner" });
  await mark(cell(blood, "日数"), { label: 3, place: "corner" });
  await mark(cell(blood, "検体・検査項目"), { label: 4, place: "corner" });
  await mark(cell(blood, "ステータス"), { label: 5, place: "corner" });
  await mark(cell(blood, "結果"), { label: 6, place: "corner" });
  await mark(blood.getByRole("button", { name: "受付" }), { label: 7, place: "corner" });
  await mark(blood.getByRole("link", { name: "ラベル発行" }), { label: 8, place: "corner" });
  await mark(blood.getByRole("button", { name: "表示" }), { label: 9, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), page.locator(".lab-worklist__count")], padding: 24 });
  await clearMarks();

  // 血液培養のボトルのラベルを発行する(PDF を作るときに番号が決まるので、応答を待ってから閉じる)
  const response = page
    .context()
    .waitForEvent("response", (r) => r.url().includes("/reports/micro_labels/") && r.request().method() === "GET");
  const [pdf] = await Promise.all([page.context().waitForEvent("page"), blood.getByRole("link", { name: "ラベル発行" }).click()]);
  await (await response).finished();
  await pdf.close();
  await page.reload();
  await blood.waitFor();
  await page.waitForLoadState("networkidle");

  // 容器ごとのラベル
  await blood.getByRole("button", { name: "表示" }).click();
  const view = page.locator(".modal");
  const containers = view.locator(".lab-order-view");
  await containers.getByText(/採取番号/).nth(1).waitFor();
  const heading = view.getByRole("heading", { name: "容器" });
  await mark(containers.locator(".karte-rp__head").first().locator(".karte-rp__number"), { label: 1 });
  await mark(containers.getByText(/採取番号/).first(), { label: 2, place: "corner" });
  await shot("02-containers", { target: [heading, containers], padding: 40 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await view.waitFor({ state: "detached" });

  // ボトルを検体到着確認で読む(全容器が揃うと受付済になる)
  const { numbers } = await labelsOf(page, LAB_OUTPATIENT);
  await openDepartmentMenu(page, "臨床検査部門", "検体到着確認");
  const input = page.getByPlaceholder("バーコードをスキャン(11桁)");
  for (const number of numbers) {
    await input.fill(number);
    await input.press("Enter");
    await page.locator(".lab-arrival__feed li").filter({ hasText: number }).waitFor();
  }
  await page.locator(".lab-arrival__result--completed").waitFor();

  // ラベルを使わない検体は「受付」で受ける
  await openDepartmentMenu(page, "臨床検査部門", "細菌検査一覧");
  await blood.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await sputum.getByRole("button", { name: "受付" }).click();
  await sputum.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await sputum.getByRole("button", { name: "この検査の操作" }).click();
  const menu = page.locator(".row-menu__items").last();
  await menu.waitFor();
  await mark(cell(blood, "ステータス"), { label: 1, place: "corner" });
  await mark(cell(sputum, "ステータス"), { label: 1, place: "corner" });
  await mark(sputum.getByRole("button", { name: "結果登録" }), { label: 2, place: "corner" });
  await mark(menuItem(page, "ラベル発行"), { label: 3 });
  await mark(menuItem(page, "取消"), { label: 4 });
  await mark(menuItem(page, "中止"), { label: 5 });
  await shot("03-accepted", { target: [blood, sputum, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 結果を登録する: 検体所見
  await sputum.getByRole("button", { name: "結果登録" }).click();
  const entry = page.locator(".modal");
  const findings = entry.locator("fieldset").filter({ has: page.locator("legend", { hasText: "検体所見" }) });
  await findings.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(findings, "培養結果").locator("select").selectOption({ label: "陽性" });
  await labeled(findings, "塗抹・鏡検所見").locator("textarea").fill("グラム陽性双球菌(3+)、白血球(3+)、貪食像あり");
  await labeled(findings, "Miller&Jones分類").locator("select").selectOption({ label: "P2" });
  await labeled(findings, "Geckler分類").locator("select").selectOption({ label: "グループ5" });
  await blur(page);
  const common = entry.locator("fieldset").first();
  await mark(common.locator("label").filter({ hasText: "検体採取日" }), { label: 1, place: "corner" });
  await mark(common.locator(".micro-result-form__status"), { label: 2, place: "corner" });
  await mark(labeled(findings, "培養結果"), { label: 3, place: "corner" });
  await mark(labeled(findings, "塗抹・鏡検所見"), { label: 4, place: "corner" });
  await mark(findings.locator("details").first(), { label: 5, place: "corner" });
  await shot("04-findings", { target: [entry.locator(".modal__header"), findings], padding: 24 });
  await clearMarks();

  // 分離菌と感受性
  await entry.getByRole("button", { name: /分離菌追加/ }).click();
  const isolate = entry.locator("fieldset").filter({ has: page.locator("legend", { hasText: "分離菌 A" }) });
  await labeled(isolate, "菌名").locator("select").selectOption({ label: ORGANISM });
  await labeled(isolate, "菌量").locator("select").selectOption({ label: "定量" });
  await labeled(isolate, "菌数").locator("select").selectOption({ label: "10^7/ml以上" });
  await labeled(isolate, "起炎性").locator("select").selectOption({ label: "あり" });
  await isolate.getByRole("button", { name: "頻用抗菌薬一括追加" }).click();
  const susceptibility = isolate.locator("tbody tr");
  await susceptibility.nth(SUSCEPTIBILITY.length).waitFor();
  for (let count = await susceptibility.count(); count > SUSCEPTIBILITY.length; count--) {
    await susceptibility.last().getByRole("button", { name: "この感受性行を削除" }).click();
  }
  for (const [i, [mic, judge]] of SUSCEPTIBILITY.entries()) {
    await susceptibility.nth(i).getByLabel("MIC").fill(mic);
    const select = susceptibility.nth(i).getByLabel("S/I/R判定");
    await select.selectOption(judge);
    if ((await select.inputValue()) !== judge) throw new Error(`判定を選べません: ${i + 1} 行目`);
  }
  await blur(page);
  const firstRow = susceptibility.first();
  await mark(labeled(isolate, "菌名"), { label: 1, place: "corner" });
  await mark(isolate.locator(".micro-result-form__isolate-head label").filter({ hasText: "菌量" }), { label: 2, place: "corner" });
  await mark(labeled(isolate, "起炎性"), { label: 3, place: "corner" });
  await mark(firstRow.getByLabel("MIC"), { label: 4, place: "corner" });
  await mark(firstRow.getByLabel("S/I/R判定"), { label: 5, place: "corner" });
  await mark(isolate.getByRole("button", { name: "頻用抗菌薬一括追加" }), { label: 6, place: "corner" });
  await mark(entry.getByRole("button", { name: /分離菌追加/ }), { label: 7 });
  await mark(entry.getByRole("button", { name: "登録", exact: true }), { label: 8 });
  await shot("05-isolate", { target: [isolate, entry.getByRole("button", { name: "登録", exact: true })], padding: 32 });
  await clearMarks();
  await entry.getByRole("button", { name: "登録", exact: true }).click();
  await entry.waitFor({ state: "detached" });

  // 報告済
  await sputum.locator(".lab-worklist__status", { hasText: "報告済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(cell(sputum, "ステータス"), { label: 1, place: "corner" });
  await mark(cell(sputum, "結果"), { label: 2, place: "corner" });
  await mark(sputum.getByRole("button", { name: "結果編集" }), { label: 3, place: "corner" });
  await shot("06-reported", { target: sputum });
  await clearMarks();

  for (const name of [LAB_INPATIENT, LAB_OUTPATIENT]) await removeShootingLabRecords(page, await patientIdByName(page, name));
}
