// 操作マニュアル「病理(受付・レポート)」(docs/manual/patho-worklist.md)
// 医師 四郎が入院の「見本 太郎」(撮影用の架空の患者)に胃前庭部の生検(容器 2 つ)を出して採取とラベル発行を記録し、
// 検査 春子(臨床検査技師)が病理受付で容器のラベルを照合して受け付け、病理 六郎(病理医)が診断レポートを書く。
// 撮影の前後に、撮影日の病理検査を消す。
// 診断医の選択欄の一覧には開発環境の医師(実在の人名を含む)が並ぶので、開かない。
import { blur, labeled, logout, menuItem } from "../lib/karte.mjs";
import {
  LAB_INPATIENT,
  labelsOf,
  openDepartmentMenu,
  openLabKarte,
  patientIdByName,
  registerPathoOrder,
  removeShootingLabRecords,
} from "../lib/lab.mjs";
import { assertOnlyShootingPatients } from "../lib/pharmacy.mjs";

const GROSS = "生検組織 2 片。2 mm 大と 3 mm 大。";
const MICRO = "幽門腺粘膜に、不整な腺管を形成して浸潤する異型細胞を認める。核は腫大し、極性の乱れがある。";
const DIAGNOSIS = "Stomach, antrum, biopsy:\n  Adenocarcinoma (tub2), Group 5.";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が病理検査を出し、採取を記録してラベルを刷る
  await login("doctor");
  await openLabKarte(page, LAB_INPATIENT);
  await registerPathoOrder(page, {
    organ: "胃前庭部",
    method: "生検",
    count: 2,
    containers: 2,
    clinical: "上部消化管内視鏡で胃前庭部前壁に 0-IIc 様の陥凹性病変。同部より生検 2 個。",
  });
  await logout(page);

  // 病理検査一覧
  await login("labTech");
  await openDepartmentMenu(page, "病理部門", "病理検査一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: LAB_INPATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const headerIndex = Object.fromEntries(
    (await page.locator(".lab-worklist thead th").allInnerTexts()).map((text, i) => [text.trim(), i]),
  );
  const cell = (header) => row.locator("td").nth(headerIndex[header]);
  const filters = page.locator(".patient-search-form");
  const lookup = page.locator(".patho-worklist__lookup");
  await mark(filters.locator("label").filter({ hasText: "採取日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "検査区分" }), { label: 2, place: "corner" });
  await mark(lookup.getByRole("textbox"), { label: 3 });
  await mark(cell("検体"), { label: 4, place: "corner" });
  await mark(cell("ステータス"), { label: 5, place: "corner" });
  await mark(cell("レポート"), { label: 6, place: "corner" });
  await mark(row.getByRole("link", { name: "受付" }), { label: 7, place: "corner" });
  await mark(row.getByRole("button", { name: "表示" }), { label: 8, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), page.locator(".lab-worklist__count")], padding: 24 });
  await clearMarks();

  // 病理受付で容器のラベルを照合する
  const [first, second] = (await labelsOf(page, LAB_INPATIENT)).numbers;
  await row.getByRole("link", { name: "受付" }).click();
  const input = page.getByPlaceholder("ラベルのバーコードを読む(11桁)");
  await page.getByText("照合 0/2").waitFor();
  await input.fill(first);
  await input.press("Enter");
  await page.getByText("照合 1/2").waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  const receive = page.getByRole("button", { name: "受付", exact: true });
  const containers = page.locator(".page table tbody tr");
  await mark(input, { label: 1 });
  await mark(page.locator(".page").getByText(/^患者$/).locator(".."), { label: 2, place: "corner" });
  await mark(containers.first().locator("td").last(), { label: 3, place: "corner" });
  await mark(page.getByText("照合 1/2"), { label: 4 });
  await mark(receive, { label: 5, place: "corner" });
  await mark(page.getByRole("button", { name: "やり直し" }), { label: 6, place: "corner" });
  await shot("02-reception", { target: [page.locator(".page__header, .page h1").first(), receive], padding: 32 });
  await clearMarks();

  await input.fill(second);
  await input.press("Enter");
  await page.getByText("照合 2/2").waitFor();
  await receive.click();
  const done = page.getByText(/受付しました/);
  await done.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(done, { label: 1, place: "corner" });
  await shot("03-received", { target: [input, done.locator("xpath=ancestor::ul[1]")], padding: 32 });
  await clearMarks();

  // 受付済の行
  await openDepartmentMenu(page, "病理部門", "病理検査一覧");
  await row.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "この検査の操作" }).click();
  const menu = page.locator(".row-menu__items").last();
  await menu.waitFor();
  await mark(row.locator(".patho-worklist__accession"), { label: 1, place: "corner" });
  await mark(cell("ステータス"), { label: 2, place: "corner" });
  await mark(row.getByRole("button", { name: "検査済" }), { label: 3, place: "corner" });
  await mark(row.getByRole("button", { name: "レポート登録" }), { label: 4, place: "corner" });
  await mark(menuItem(page, "取消"), { label: 5 });
  await mark(menuItem(page, "中止"), { label: 6 });
  await mark(menuItem(page, "ラベル発行"), { label: 7 });
  await shot("04-accepted", { target: [row, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");
  await logout(page);

  // 病理医が診断レポートを書く
  await login("pathologist");
  await openDepartmentMenu(page, "病理部門", "病理検査一覧");
  await row.getByRole("button", { name: "レポート登録" }).click();
  const form = page.locator(".modal");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const common = fieldset("報告共通");
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(labeled(common, "報告日"), { label: 1, place: "corner" });
  await mark(labeled(common, "検査区分"), { label: 2, place: "corner" });
  await mark(labeled(common, "報告区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "診断医1"), { label: 4, place: "corner" });
  await mark(fieldset("検体情報"), { label: 5, place: "corner" });
  await shot("05-report-common", { target: [form.locator(".modal__header"), fieldset("検体情報")], padding: 24 });
  await clearMarks();

  const findings = fieldset("所見");
  const diagnosis = fieldset("診断");
  await labeled(findings, "肉眼所見").locator("textarea").fill(GROSS);
  await labeled(findings, "顕微鏡所見").locator("textarea").fill(MICRO);
  await labeled(diagnosis, "重要度").locator("select").selectOption({ label: "悪性" });
  await diagnosis.locator("textarea").fill(DIAGNOSIS);
  await blur(page);
  await diagnosis.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(labeled(findings, "肉眼所見"), { label: 1, place: "corner" });
  await mark(labeled(findings, "顕微鏡所見"), { label: 2, place: "corner" });
  await mark(labeled(diagnosis, "重要度"), { label: 3, place: "corner" });
  await mark(diagnosis.locator("textarea"), { label: 4, place: "corner" });
  await mark(diagnosis.getByRole("button", { name: "テンプレート" }), { label: 5, place: "corner" });
  await shot("06-report-diagnosis", { target: [findings, diagnosis], padding: 24 });
  await clearMarks();

  const save = form.getByRole("button", { name: "登録", exact: true });
  const draft = form.getByRole("button", { name: "一時保存" });
  const follow = fieldset("フォロー推奨");
  await save.scrollIntoViewIfNeeded();
  await mark(follow, { label: 1, place: "corner" });
  await mark(fieldset("採取法"), { label: 2, place: "corner" });
  await mark(fieldset("画像"), { label: 3, place: "corner" });
  await mark(draft, { label: 4, place: "corner" });
  await mark(save, { label: 5, place: "corner" });
  await shot("07-report-rest", { target: [follow, save], padding: 24 });
  await clearMarks();
  await save.click();
  await form.waitFor({ state: "detached" });

  // レポートを登録した行
  await cell("レポート").getByText("最終報告").waitFor();
  await page.waitForLoadState("networkidle");
  await mark(cell("レポート"), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "検査済" }), { label: 2, place: "corner" });
  await mark(row.getByRole("button", { name: "レポート編集" }), { label: 3, place: "corner" });
  await shot("08-reported", { target: row });
  await clearMarks();

  await removeShootingLabRecords(page, await patientIdByName(page, LAB_INPATIENT));
}
