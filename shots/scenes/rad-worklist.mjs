// 操作マニュアル「放射線検査(実施入力・読影レポート)」(docs/manual/rad-worklist.md)
// 医師 四郎が外来の「見本 次郎」に腹部造影 CT(CT 室の 10 時の枠を予約)を、入院の「見本 太郎」に胸部 X 線を出し、
// 放射 七郎(診療放射線技師)が放射線検査一覧で CT を受け付けて実施入力し、読影 八郎(放射線科医)が読影レポートを書く。
// 撮影の前後に、撮影日の放射線検査を予約・実施記録・レポートごと消す。
import { blur, labeled, logout, menuItem, openKarte } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const CT_PATIENT = "見本 次郎";
const XRAY_PATIENT = "見本 太郎";

const FINDINGS =
  "上行結腸に約 4 cm の壁肥厚を認め、造影で不均一に増強される。周囲脂肪織に軽度の濃度上昇あり。\n" +
  "回結腸動脈領域に短径 8 mm のリンパ節を 2 個認める。肝に明らかな腫瘤性病変なし。腹水なし。";
const DIAGNOSIS = "上行結腸癌(cT3N1M0 疑い)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が放射線検査を出す
  await login("doctor");
  for (const name of [CT_PATIENT, XRAY_PATIENT]) await removeShootingOrders(page, await patientIdByName(page, name), ["rad"]);
  await openKarte(page, CT_PATIENT);
  await registerRad(page, {
    tab: "CT・MRI",
    item: "腹部造影CT",
    disease: "結腸癌",
    purpose: "術前の病期診断(リンパ節・肝転移の評価)",
    bookAt: "10:00",
  });
  await openKarte(page, XRAY_PATIENT);
  await registerRad(page, { item: "胸部立位P→A", disease: "早期胃癌", purpose: "術前の胸部の評価" });
  await logout(page);

  // 放射線検査一覧
  await login("radTech");
  await openDepartmentMenu(page, "放射線部門", "放射線検査一覧");
  const rows = page.locator(".rad-worklist tbody tr");
  const ct = rows.filter({ hasText: CT_PATIENT });
  const xray = rows.filter({ hasText: XRAY_PATIENT });
  await xray.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 2) throw new Error("撮影日の放射線検査一覧に撮影用でない行があります");
  const filters = page.locator(".patient-search-form");
  await mark(filters.locator("label").filter({ hasText: "撮影日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "種別(モダリティ)" }), { label: 2, place: "corner" });
  await mark(ct.locator(".rad-worklist__time"), { label: 3, place: "corner" });
  await mark(ct.locator(".rad-worklist__status"), { label: 4, place: "corner" });
  await mark(ct.locator("td").nth(-2), { label: 5, place: "corner" });
  await mark(ct.getByRole("button", { name: "受付" }), { label: 6, place: "corner" });
  await mark(page.getByRole("tab", { name: /日付未定/ }).or(page.getByText(/^日付未定/).first()), { label: 7, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), xray], padding: 24 });
  await clearMarks();

  // 受付
  await ct.getByRole("button", { name: "受付" }).click();
  await ct.locator(".rad-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await ct.getByRole("button", { name: "この検査の操作" }).click();
  await menuItem(page, "取消").waitFor();
  await mark(ct.locator(".rad-worklist__status"), { label: 1, place: "corner" });
  await mark(ct.getByRole("button", { name: "実施" }), { label: 2, place: "corner" });
  await mark(menuItem(page, "取消"), { label: 3 });
  await mark(menuItem(page, "中止"), { label: 4 });
  await shot("02-accepted", { target: [ct, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 撮影が済んだら実施入力
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T10:20:00+09:00`));
  await ct.getByRole("button", { name: "実施" }).click();
  const perform = page.locator(".modal").filter({ hasText: "実施入力" });
  await perform.getByRole("button", { name: "実施登録" }).waitFor();
  await page.waitForLoadState("networkidle");
  await perform.getByLabel("CTDIvol(mGy)").fill("12.4");
  await perform.getByLabel("DLP(mGy·cm)").fill("586");
  await blur(page);
  // 線量を入れると下へ送られるので、見出しまで戻してから枠を付ける
  await perform.getByText("実施入力", { exact: true }).scrollIntoViewIfNeeded();
  await mark(labeled(perform, "実施時刻"), { label: 1, place: "corner" });
  await mark(labeled(perform, "実施者"), { label: 2, place: "corner" });
  await mark(perform.getByRole("button", { name: "診療行為追加" }), { label: 3, place: "corner" });
  await mark(perform.getByRole("row").filter({ hasText: "イオパミロン" }).locator("input").first(), { label: 4 });
  await mark(perform.getByRole("row").filter({ hasText: "イオパミロン" }).locator("select"), { label: 5, place: "corner" });
  await mark(perform.getByRole("button", { name: "造影剤追加" }), { label: 6, place: "corner" });
  await shot("03-perform", { target: [perform.getByText("実施入力", { exact: true }), perform.getByRole("row").filter({ hasText: "イオパミロン" })], padding: 24 });
  await clearMarks();
  // 実施入力は縦に長いので、下まで送ってから器材と被曝線量を撮る
  await perform.getByRole("button", { name: "実施登録" }).scrollIntoViewIfNeeded();
  await mark(perform.getByRole("button", { name: "器材追加" }), { label: 1, place: "corner" });
  await mark(perform.getByLabel("CTDIvol(mGy)"), { label: 2, place: "corner" });
  await mark(perform.getByLabel("DLP(mGy·cm)"), { label: 2, place: "corner" });
  await mark(perform.getByRole("button", { name: "実施登録" }), { label: 3 });
  await shot("04-perform-dose", { target: perform });
  await clearMarks();
  await perform.getByRole("button", { name: "実施登録" }).click();
  await perform.waitFor({ state: "detached" });
  await ct.locator(".rad-worklist__status", { hasText: "実施済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await logout(page);

  // 読影医が読影レポートを書く
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T14:00:00+09:00`));
  await login("radiologist");
  await openDepartmentMenu(page, "放射線部門", "放射線検査一覧");
  await ct.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(ct.locator(".rad-worklist__status"), { label: 1, place: "corner" });
  await mark(ct.getByRole("button", { name: "読影" }), { label: 2, place: "corner" });
  await shot("05-completed", { target: ct });
  await clearMarks();

  await ct.getByRole("button", { name: "読影" }).click();
  const report = page.locator(".modal").filter({ hasText: "読影レポート登録" });
  await report.getByRole("button", { name: "登録", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(report.getByText("依頼内容", { exact: true }), { label: 1 });
  await mark(report.locator("fieldset").filter({ has: page.locator("legend", { hasText: "実施情報" }) }), { label: 2 });
  await shot("06-report-request", { target: report });
  await clearMarks();

  // 依頼内容を畳んで、読影の欄を書く
  await report.getByText("依頼内容", { exact: true }).click();
  const reading = report.locator(".exam-report-form");
  await labeled(reading, "報告区分").locator("select").selectOption({ label: "最終報告" });
  await labeled(reading, "所見").locator("textarea").fill(FINDINGS);
  await labeled(reading, "診断").locator("textarea").fill(DIAGNOSIS);
  await blur(page);
  await reading.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(labeled(reading, "報告区分"), { label: 1, place: "corner" });
  await mark(labeled(reading, "所見").locator("textarea"), { label: 2 });
  await mark(reading.getByRole("button", { name: "テンプレート" }).first(), { label: 3, place: "corner" });
  await mark(labeled(reading, "診断").locator("textarea"), { label: 4 });
  await mark(reading.getByText("重要所見あり"), { label: 5 });
  await mark(reading.getByText("フォロー推奨あり"), { label: 6 });
  await mark(reading.getByRole("button", { name: /画像添付/ }), { label: 7 });
  await mark(report.getByRole("button", { name: "登録", exact: true }), { label: 8 });
  await shot("07-report", { target: [reading, report.getByRole("button", { name: "登録", exact: true })], padding: 40 });
  await clearMarks();
  await report.getByRole("button", { name: "登録", exact: true }).click();
  await report.waitFor({ state: "detached" });
  await ct.getByRole("button", { name: "読影編集" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(ct.locator("td").nth(-2), { label: 1, place: "corner" });
  await mark(ct.getByRole("button", { name: "読影編集" }), { label: 2, place: "corner" });
  await shot("08-reported", { target: ct });
  await clearMarks();

  for (const name of [CT_PATIENT, XRAY_PATIENT]) await removeShootingOrders(page, await patientIdByName(page, name), ["rad"]);
}

/**
 * 開いているカルテから、撮影日の放射線検査を 1 件登録する。bookAt を渡すと、撮影日のその時刻の枠を予約する
 * (予約必須の項目)。
 */
async function registerRad(page, { tab, item, disease, purpose, bookAt }) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "放射線検査", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ index: 1 });
  if (tab) await form.locator(".order-select__tabs").getByText(tab, { exact: true }).click();
  await form.locator(".order-select__cell label").filter({ hasText: new RegExp(`^${item}$`) }).locator("input").check();
  const frame = form.locator(".rad-order-frame").first();
  await frame.waitFor();
  if (bookAt) {
    await frame.locator(".rad-order-frame__booking").getByRole("button", { name: "予約" }).click();
    const booking = page.locator(".modal").filter({ has: page.locator(".rad-booking") });
    const picker = booking.locator(".appointment-picker");
    await picker.locator(".appointment-month").waitFor();
    await picker.locator(".appointment-month button").filter({ hasText: /^1空き/ }).first().click();
    await picker.locator(".appointment-times__list button").filter({ hasText: new RegExp(`^${bookAt}`) }).first().click();
    await booking.getByRole("button", { name: "この枠で予約" }).click();
    await booking.waitFor({ state: "detached" });
  }
  await frame.locator('input[aria-label="依頼病名"]').fill(disease);
  await labeled(frame, "検査目的").locator("textarea").fill(purpose);
  await blur(page);
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
