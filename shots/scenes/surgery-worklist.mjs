// 操作マニュアル「手術一覧・手術カレンダー」(docs/manual/surgery-worklist.md)
// 医師 四郎が「見本 太郎」(早期胃癌)に撮影日 9 時の腹腔鏡下胃切除術を、「見本 次郎」(結腸癌)に日程未定の腹腔鏡下結腸切除術を
// 申し込み、看護 次郎(手術室の看護師)が手術カレンダーで日程を見て、手術一覧で日程確定・受付・入室・実施入力をする。
// 日程未定のタブと手術カレンダーの未確定には日付を問わず申込が並ぶので、撮影用でない患者の行があれば止める
// (開発データの日程未定の申込は、日程を入れて片付けておく)。撮影の前後に、撮影日に申し込んだ手術を消す。
import { addDays, blur, labeled, logout, menuItem, pickRow, settle } from "../lib/karte.mjs";
import { openDepartmentMenu } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";
import { SURGERY_CASES, registerSurgery, removeShootingSurgeries } from "../lib/surgery.mjs";

const GASTRIC = SURGERY_CASES.gastric;
const COLON = SURGERY_CASES.colon;
const COLON_DATE = addDays(SHOOTING_DATE, 2);

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が手術を申し込む
  await login("doctor");
  await removeShootingSurgeries(page);
  await registerSurgery(page, GASTRIC, { date: SHOOTING_DATE, time: "09:00", duration: 300 });
  await registerSurgery(page, COLON);
  await logout(page);

  // 手術カレンダー
  await login("nurse");
  await openDepartmentMenu(page, "手術部門", "手術カレンダー");
  const gastricCard = page.locator(".surgery-calendar__card").filter({ hasText: GASTRIC.patient }).first();
  const pending = page.locator(".surgery-pending");
  const colonCard = pending.locator(".surgery-pending__card").filter({ hasText: COLON.patient });
  await gastricCard.waitFor();
  await colonCard.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await pending.locator(".surgery-pending__card").count()) !== 1) throw new Error("手術カレンダーの未確定に撮影用でない申込があります");
  await mark(page.getByText("日", { exact: true }).first(), { label: 1, place: "corner" });
  await mark(page.getByRole("button", { name: "今日" }).locator(".."), { label: 2 });
  await mark(page.getByText("手術室1", { exact: true }).first(), { label: 3, place: "corner" });
  await mark(gastricCard, { label: 4, place: "corner" });
  await mark(colonCard, { label: 5 });
  await shot("01-calendar", { target: [page.locator(".page__header"), page.getByText("12:00", { exact: true }).first(), colonCard], padding: 24 });
  await clearMarks();

  // 手術一覧(予定日別)
  await openDepartmentMenu(page, "手術部門", "手術一覧");
  const rows = page.locator("tbody tr");
  const gastricRow = rows.filter({ hasText: GASTRIC.patient });
  await gastricRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("撮影日の手術一覧に撮影用でない行があります");
  const filters = page.locator(".patient-search-form");
  await mark(filters.locator("label").filter({ hasText: "予定手術日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "手術室" }), { label: 2, place: "corner" });
  await mark(gastricRow.locator("td").first(), { label: 3, place: "corner" });
  await mark(gastricRow.locator("td").filter({ hasText: /^未$/ }), { label: 4, place: "corner" });
  await mark(gastricRow.getByText("申込済", { exact: true }), { label: 5, place: "corner" });
  await mark(gastricRow.getByRole("button", { name: "受付" }), { label: 6, place: "corner" });
  await mark(page.getByText(/^日程未定 \(\d+\)$/), { label: 7, place: "corner" });
  await shot("02-list", { target: [page.locator(".page__header"), gastricRow], padding: 24 });
  await clearMarks();

  // 日程未定の申込の日程を確定する
  await page.getByText(/^日程未定 \(\d+\)$/).click();
  const colonRow = rows.filter({ hasText: COLON.patient });
  await colonRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("日程未定に撮影用でない申込があります");
  await colonRow.getByRole("button", { name: "日程確定" }).click();
  const confirm = page.locator(".modal").filter({ hasText: "日程を確定" });
  await labeled(confirm, "予定手術日").locator("input").fill(COLON_DATE);
  await labeled(confirm, "入室予定時刻").locator("input").fill("09:00");
  await labeled(confirm, "手術室").locator("select").selectOption({ label: "手術室2" });
  await confirm.getByText(/^手術室2 の予定/).waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await confirm.scrollIntoViewIfNeeded();
  await settle(confirm);
  await mark(labeled(confirm, "予定手術日"), { label: 1, place: "corner" });
  await mark(labeled(confirm, "入室予定時刻"), { label: 2, place: "corner" });
  await mark(labeled(confirm, "予定所要時間"), { label: 3, place: "corner" });
  await mark(labeled(confirm, "手術室"), { label: 4, place: "corner" });
  await mark(confirm.locator(".surgery-day-schedule"), { label: 5 });
  await mark(confirm.getByRole("button", { name: "確定", exact: true }), { label: 6 });
  await shot("03-confirm", { target: confirm, padding: 24 });
  await clearMarks();
  await confirm.getByRole("button", { name: "確定", exact: true }).click();
  await confirm.waitFor({ state: "detached" });
  await colonRow.waitFor({ state: "detached" });

  // 受付と入室
  await page.getByText("予定日別", { exact: true }).click();
  await gastricRow.getByRole("button", { name: "受付" }).click();
  await gastricRow.getByRole("button", { name: "入室" }).waitFor();
  await page.waitForLoadState("networkidle");
  await gastricRow.getByRole("button", { name: "この手術の操作" }).click();
  await menuItem(page, "受付取消").waitFor();
  await mark(gastricRow.getByText("受付済", { exact: true }), { label: 1, place: "corner" });
  await mark(gastricRow.getByRole("button", { name: "入室" }), { label: 2, place: "corner" });
  await mark(menuItem(page, "術前診察"), { label: 3 });
  await mark(menuItem(page, "受付取消"), { label: 4 });
  await mark(menuItem(page, "中止"), { label: 5 });
  await shot("04-accepted", { target: [gastricRow, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await gastricRow.getByRole("button", { name: "入室" }).click();
  await gastricRow.getByRole("button", { name: "実施" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(gastricRow.getByText("入室中", { exact: true }), { label: 1, place: "corner" });
  await mark(gastricRow.getByRole("button", { name: "実施" }), { label: 2, place: "corner" });
  await shot("05-in-room", { target: gastricRow });
  await clearMarks();

  // 退室後に実施入力
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T14:30:00+09:00`));
  await gastricRow.getByRole("button", { name: "実施" }).click();
  const perform = page.locator(".modal").filter({ hasText: "実施入力" }).first();
  const submit = perform.getByRole("button", { name: "実施登録" });
  await submit.waitFor();
  await page.waitForLoadState("networkidle");
  const times = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "時刻" }) });
  for (const [label, time] of [
    ["入室", "09:05"],
    ["麻酔開始", "09:15"],
    ["執刀開始", "09:45"],
    ["執刀終了", "13:20"],
    ["麻酔終了", "13:40"],
    ["退室", "13:55"],
  ]) {
    await labeled(times, label).locator("input").fill(`${SHOOTING_DATE}T${time}`);
  }
  const staff = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "実施スタッフ" }) });
  await staff.locator("select").selectOption({ label: "外回り" });
  await staff.getByRole("button", { name: "+ 追加" }).click();
  const picker = page.locator(".modal").filter({ hasText: "医療従事者を選択" }).last();
  await labeled(picker, "氏名").locator("input").fill("看護 次郎");
  await picker.getByRole("button", { name: "検索", exact: true }).click();
  const nurseRow = picker.getByRole("row").filter({ hasText: "看護 次郎" });
  await nurseRow.waitFor();
  await pickRow(nurseRow);
  await picker.waitFor({ state: "detached" });
  const measures = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "測定値" }) });
  await labeled(measures, "出血量").locator("input").fill("80");
  await labeled(measures, "尿量").locator("input").fill("350");
  const record = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "記録" }) });
  await labeled(record, "創分類").locator("select").selectOption({ label: "準清潔" });
  await labeled(record, "ガーゼ・器械カウント").locator("select").selectOption({ label: "合致" });
  await labeled(record, "転帰").locator("select").selectOption({ label: "良好" });
  await blur(page);
  await perform.getByText("実施入力", { exact: true }).scrollIntoViewIfNeeded();
  await mark(times, { label: 1 });
  await mark(perform.getByRole("button", { name: "+ 術式(K)" }), { label: 2, place: "corner" });
  await mark(perform.getByRole("button", { name: "+ 麻酔(L)" }), { label: 3, place: "corner" });
  await mark(staff, { label: 4 });
  await mark(measures, { label: 5 });
  await mark(record, { label: 6 });
  await shot("06-perform", { target: perform, padding: 24 });
  await clearMarks();

  await submit.scrollIntoViewIfNeeded();
  await mark(perform.getByRole("button", { name: "+ 薬剤" }), { label: 1, place: "corner" });
  await mark(perform.getByRole("button", { name: "+ 材料" }), { label: 2, place: "corner" });
  await mark(perform.locator("textarea").last(), { label: 3 });
  await mark(submit, { label: 4 });
  await shot("07-perform-rest", { target: perform, padding: 24 });
  await clearMarks();
  await submit.click();
  await perform.waitFor({ state: "detached" });
  await gastricRow.getByText("実施済", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(gastricRow.getByText("実施済", { exact: true }), { label: 1, place: "corner" });
  await shot("08-performed", { target: gastricRow });
  await clearMarks();

  await removeShootingSurgeries(page);
}
