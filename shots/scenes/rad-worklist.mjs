// 操作マニュアル「放射線検査一覧」(docs/manual/rad-worklist.md)
// 医師 四郎が外来の「見本 次郎」に腹部造影 CT(CT 室の 10 時の枠を予約)を、入院の「見本 太郎」に胸部 X 線を出し、
// 放射 七郎(診療放射線技師)が放射線検査一覧で CT を受け付けて実施入力し、読影 八郎(放射線科医)が読影レポートを書く。
// 集計(件数・線量)は期間を撮影日だけにして、撮影のデータだけを数える。副作用の記録は入力の画面だけを撮り、登録しない。
// 撮影の前後に、撮影日の放射線検査を予約・実施記録・レポートごと消す。
import { blur, labeled, logout, menuItem, openKarte, settle } from "../lib/karte.mjs";
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
  const tabs = page.locator(".order-select__tabs");
  await mark(filters.locator("label").filter({ hasText: "撮影日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "種別(モダリティ)" }), { label: 2, place: "corner" });
  await mark(ct.locator(".rad-worklist__time"), { label: 3, place: "corner" });
  await mark(ct.locator(".rad-worklist__status"), { label: 4, place: "corner" });
  await mark(ct.locator("td").nth(-2), { label: 5, place: "corner" });
  await mark(ct.getByRole("button", { name: "受付" }), { label: 6, place: "corner" });
  await mark(tabs, { label: 7, place: "corner" });
  await mark(ct.locator(".rad-worklist__content"), { label: 8, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), xray], padding: 24 });
  await clearMarks();

  // 行を押すと右に開くドロワー
  await ct.locator(".rad-worklist__content").click();
  const drawer = page.locator(".patient-drawer");
  const drawerOrder = drawer.locator(".patient-drawer__order");
  await drawerOrder.waitFor();
  await drawer.getByText("読み込み中").waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await mark(drawer.locator(".patient-drawer__menu"), { label: 1 });
  await mark(drawerOrder, { label: 2 });
  await mark(drawer.getByRole("link", { name: "カルテ" }), { label: 3, place: "corner" });
  await shot("09-drawer", { target: [drawer.locator(".patient-drawer__header"), drawerOrder], padding: 40 });
  await clearMarks();
  await drawer.getByRole("button", { name: "閉じる" }).click();
  await drawer.waitFor({ state: "detached" });

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
  // 器材の初期の行は後から読み込まれ、モーダルが伸びて上にも動く。行が出て位置が落ち着いてから枠を付ける。
  await perform.getByRole("row").filter({ hasText: "エクステンションチューブ" }).waitFor();
  await perform.getByText("実施入力", { exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await settle(perform);
  await mark(labeled(perform, "実施時刻"), { label: 1, place: "corner" });
  await mark(labeled(perform, "実施者"), { label: 2, place: "corner" });
  await mark(labeled(perform, "撮影室"), { label: 3, place: "corner" });
  await mark(labeled(perform, "再撮影"), { label: 4, place: "corner" });
  await mark(perform.getByRole("button", { name: "診療行為追加" }), { label: 5, place: "corner" });
  await mark(perform.getByRole("row").filter({ hasText: "イオパミロン" }).locator("input").first(), { label: 6 });
  await mark(perform.getByRole("row").filter({ hasText: "イオパミロン" }).locator("select"), { label: 7, place: "corner" });
  await mark(perform.getByRole("button", { name: "造影剤追加" }), { label: 8, place: "corner" });
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

  // 副作用の記録
  await ct.getByRole("button", { name: "この検査の操作" }).click();
  await menuItem(page, "副作用記録").waitFor();
  await mark(menuItem(page, "副作用記録"), { label: 1 });
  await shot("10-adverse-menu", { target: [ct, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await menuItem(page, "副作用記録").click();
  const adverse = page.locator(".modal").filter({ hasText: "放射線検査(副作用)" });
  const agents = adverse.locator("fieldset").filter({ has: page.locator("legend", { hasText: "使用した造影剤" }) });
  await agents.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(adverse, "用語(CTCAE)").locator("input").fill("蕁麻疹");
  await labeled(adverse, "対処・経過").locator("input").fill("造影後 10 分で前胸部に膨疹。抗ヒスタミン薬を静注し軽快");
  await blur(page);
  await settle(adverse);
  await mark(labeled(adverse, "用語(CTCAE)"), { label: 1 });
  await mark(labeled(adverse, "Grade"), { label: 2, place: "corner" });
  await mark(labeled(adverse, "発現日"), { label: 3, place: "corner" });
  await mark(labeled(adverse, "対処・経過"), { label: 4 });
  await mark(adverse.getByRole("button", { name: "追加", exact: true }), { label: 5 });
  await mark(agents.getByRole("button", { name: "アレルギー登録" }), { label: 6, place: "corner" });
  await shot("11-adverse", { target: adverse });
  await clearMarks();
  await adverse.getByRole("button", { name: "閉じる" }).click();
  await adverse.waitFor({ state: "detached" });
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

  // 読影待ち(撮影日をまたいで並ぶので、撮影用の患者だけであることを確かめる)
  const readingTab = page.getByRole("tab", { name: /読影待ち/ });
  await readingTab.click();
  await ct.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("読影待ちに撮影用でない行があります");
  await mark(readingTab, { label: 1, place: "corner" });
  await mark(ct.getByRole("button", { name: "読影" }), { label: 2, place: "corner" });
  await shot("12-reading", { target: [page.locator(".page__header"), ct], padding: 24 });
  await clearMarks();
  await page.getByRole("tab", { name: "撮影日別" }).click();
  await ct.waitFor();

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

  // 件数集計・線量集計(期間を撮影日だけにして、撮影のデータだけを数える)
  const period = page.locator(".patient-search-form");
  const tiles = page.locator(".stat-tiles");
  const sections = page.locator(".stat-section");
  await page.getByRole("tab", { name: "件数集計" }).click();
  await labeled(period, "開始日").locator("input").fill(SHOOTING_DATE);
  await blur(page);
  await sections.filter({ hasText: "撮影項目ごと" }).locator("tbody tr").filter({ hasText: "腹部" }).waitFor();
  await page.waitForLoadState("networkidle");
  if ((await sections.filter({ hasText: "撮影項目ごと" }).locator("tbody tr").count()) !== 1) {
    throw new Error("件数集計に撮影用でない検査が入っています");
  }
  await mark(period, { label: 1 });
  await mark(tiles, { label: 2 });
  await mark(sections.first(), { label: 3 });
  await shot("13-count", { target: [page.locator(".page__header"), sections.last()], padding: 24 });
  await clearMarks();

  await page.getByRole("tab", { name: "線量集計" }).click();
  await labeled(period, "開始日").locator("input").fill(SHOOTING_DATE);
  await blur(page);
  const doseSection = sections.filter({ hasText: "撮影内容ごとの線量" });
  await doseSection.locator("tbody tr").filter({ hasText: "DLP" }).waitFor();
  await page.waitForLoadState("networkidle");
  if ((await doseSection.locator("tbody tr").count()) !== 2) throw new Error("線量集計に撮影用でない実施が入っています");
  await mark(period, { label: 1 });
  await mark(tiles, { label: 2 });
  await mark(doseSection.locator("table"), { label: 3 });
  await mark(sections.filter({ hasText: "再撮影の理由" }).locator("table"), { label: 4 });
  await shot("14-dose", { target: [page.locator(".page__header"), sections.filter({ hasText: "再撮影の理由" })], padding: 24 });
  await clearMarks();

  // 照射録(別のタブで開く。撮るときは同じタブで開き直す)
  await page.getByRole("tab", { name: "撮影日別" }).click();
  await ct.waitFor();
  const recordLink = page.getByRole("link", { name: "照射録" });
  await mark(recordLink, { label: 1, place: "corner" });
  await shot("15-record-open", { target: [page.locator(".page__header"), filters], padding: 24 });
  await clearMarks();
  const [record] = await Promise.all([page.context().waitForEvent("page"), recordLink.click()]);
  const recordUrl = record.url();
  await record.close();
  await page.goto(recordUrl);
  await page.locator(".lab-outsource-slip__table tbody tr").filter({ hasText: CT_PATIENT }).waitFor();
  await page.waitForLoadState("networkidle");
  await shot("16-record", { target: page.locator(".lab-outsource-slip__page"), padding: 8 });

  // カルテの「検査結果 > 被曝線量」
  await openKarte(page, CT_PATIENT);
  await page.goto(`${page.url().split("?")[0]}?tab=rad-dose`);
  const doseTable = page.locator(".stat-table").filter({ hasText: "CTDIvol" });
  await doseTable.locator("tbody tr").first().waitFor();
  await page.waitForLoadState("networkidle");
  await shot("17-karte-dose", { target: [page.locator(".karte-tabs__list"), doseTable], padding: 24 });

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
