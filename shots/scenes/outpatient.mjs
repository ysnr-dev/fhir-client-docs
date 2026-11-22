// 操作マニュアル「外来患者一覧」(docs/manual/outpatient.md)
// 医師 四郎が、撮影日の「内科 午前」に見本 花子(9:00)・見本 健一(9:15)・見本 和子(9:30)の予約を取り、外来患者一覧で
// 受付 → 当日受付(見本 次郎)→ 診察開始(待合表示板に呼出)→ 診察終了と進める。
// 待合表示板は、表示板の側(backend)がサーバーの今日の受付を出すので、撮影日ではなく実行した日の受付で撮る
// (時計を実行した日の朝に合わせ、当日受付と診察開始をしてから表示板を開く)。撮影の前後に、両日の予約・受付・診察を消す。
import { blur, fhirApi, labeled, menuItem, settle } from "../lib/karte.mjs";
import { bookVisit, DOCTOR, patientIdByName, removeVisits } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const BOOKED = [
  ["見本 花子", "09:00"],
  ["見本 健一", "09:15"],
  ["見本 和子", "09:30"],
];
const WALK_IN = "見本 次郎";
const PATIENTS = [...BOOKED.map(([name]) => name), WALK_IN];
const ROOM = "第1診察室";

const at = (day, time) => new Date(`${day}T${time}:00+09:00`);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const serverToday = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const patientIds = [];
  for (const name of PATIENTS) patientIds.push(await patientIdByName(page, name));
  const cleanUp = async () => {
    await removeVisits(page, patientIds, SHOOTING_DATE);
    await removeVisits(page, patientIds, serverToday);
  };
  await cleanUp();

  await page.clock.setSystemTime(at(SHOOTING_DATE, "08:30"));
  for (const [name, time] of BOOKED) await bookVisit(page, name, time);

  // 一覧の見方
  await page.goto(`/outpatients?date=${SHOOTING_DATE}`);
  const table = page.locator(".outpatient-wrap table");
  const row = (name) => table.locator("tbody tr").filter({ hasText: name });
  await row(BOOKED[2][0]).waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(page);
  const filters = page.locator(".patient-search-form");
  await mark(labeled(filters, "診察日"), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: /^診療科/ }), { label: 2, place: "corner" });
  await mark(page.locator(".outpatient__summary"), { label: 3, place: "corner" });
  await mark(row("見本 花子").getByRole("button", { name: "受付", exact: true }), { label: 4, place: "corner" });
  await mark(row("見本 花子").getByRole("link", { name: "カルテ" }), { label: 5, place: "corner" });
  await mark(page.getByRole("button", { name: "当日受付" }), { label: 6, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), table], padding: 24 });
  await clearMarks();

  // 受付
  await page.clock.setSystemTime(at(SHOOTING_DATE, "08:52"));
  await checkIn(page, row("見本 花子"));
  await page.clock.setSystemTime(at(SHOOTING_DATE, "09:08"));
  await checkIn(page, row("見本 健一"));

  // 当日受付
  await page.clock.setSystemTime(at(SHOOTING_DATE, "09:20"));
  await page.getByRole("button", { name: "当日受付" }).click();
  const walkIn = page.locator(".modal").filter({ hasText: "当日受付" });
  await labeled(walkIn, "氏名").locator("input").fill(WALK_IN);
  await walkIn.getByRole("button", { name: "検索", exact: true }).click();
  await walkIn.locator(".master-search__row").filter({ hasText: WALK_IN }).click();
  const fields = walkIn.locator(".walk-in__fields");
  await labeled(fields, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(fields, "担当医").locator("select").selectOption({ label: DOCTOR });
  await labeled(fields, "診察室").locator("select").selectOption({ label: ROOM });
  await labeled(fields, "初再診").locator("select").selectOption({ label: "再診" });
  await blur(page);
  await settle(walkIn);
  await mark(walkIn.locator(".walk-in__patient"), { label: 1, place: "corner" });
  await mark(fields, { label: 2, place: "corner" });
  await mark(walkIn.getByRole("button", { name: "受付", exact: true }), { label: 3, place: "corner" });
  await shot("02-walk-in", { target: walkIn });
  await clearMarks();
  await walkIn.getByRole("button", { name: "受付", exact: true }).click();
  await walkIn.waitFor({ state: "detached" });
  await row(WALK_IN).waitFor();

  // 受付を済ませた行
  await page.clock.setSystemTime(at(SHOOTING_DATE, "09:24"));
  await page.reload();
  await row(WALK_IN).waitFor();
  await page.waitForLoadState("networkidle");
  const cells = (name) => row(name).locator("td");
  await mark(cells("見本 花子").nth(1), { label: 1, place: "corner" });
  await mark(cells("見本 花子").nth(2), { label: 2, place: "corner" });
  await mark(cells("見本 花子").nth(3), { label: 3, place: "corner" });
  await mark(row("見本 花子").getByRole("button", { name: "診察開始" }), { label: 4, place: "corner" });
  await shot("03-checked-in", { target: [page.locator(".outpatient__summary"), table], padding: 24 });
  await clearMarks();

  // 診察開始(待合表示板に呼び出す)
  await row("見本 花子").getByRole("button", { name: "診察開始" }).click();
  const call = page.locator(".modal").filter({ hasText: "を呼び出しますか" });
  await call.waitFor();
  await mark(call.getByRole("button", { name: "呼出", exact: true }), { label: 1, place: "corner" });
  await mark(call.getByRole("button", { name: "呼出なし" }), { label: 2, place: "corner" });
  await shot("04-call", { target: call });
  await clearMarks();
  await call.getByRole("button", { name: "呼出", exact: true }).click();
  await page.locator(".karte-right").waitFor();

  // 診察終了
  await page.clock.setSystemTime(at(SHOOTING_DATE, "09:38"));
  await page.goBack();
  await row("見本 花子").getByRole("button", { name: "診察終了" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row("見本 花子").getByRole("button", { name: "診察終了" }).click();
  await row("見本 花子").getByText("診療済").waitFor();
  await page.waitForLoadState("networkidle");
  await row("見本 健一").getByRole("button", { name: "この予約の操作" }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(cells("見本 花子").locator(".outpatient__status"), { label: 1, place: "corner" });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "受付取消"), { label: 3 });
  await shot("05-status", { target: [page.locator(".outpatient__summary"), table, menu], padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 待合表示板(サーバーの今日の受付を出す)
  await page.clock.setSystemTime(at(serverToday, "09:00"));
  await page.goto(`/outpatients?date=${serverToday}`);
  for (const [name, time] of [["見本 健一", "09:02"], ["見本 和子", "09:06"], [WALK_IN, "09:11"], ["見本 花子", "09:15"]]) {
    await page.clock.setSystemTime(at(serverToday, time));
    await walkInCheckIn(page, name);
  }
  await page.clock.setSystemTime(at(serverToday, "09:20"));
  await row("見本 健一").getByRole("button", { name: "診察開始" }).click();
  await page.locator(".modal").filter({ hasText: "を呼び出しますか" }).getByRole("button", { name: "呼出", exact: true }).click();
  await page.locator(".karte-right").waitFor();
  await page.waitForLoadState("networkidle");
  const { items } = await (await page.request.get("/waiting_board/links")).json();
  const path = items.find((item) => item.path)?.path;
  if (!path) throw new Error("待合表示板の有効なリンクがありません(管理 > 施設設定 > 待合表示板で発行してください)");
  await page.clock.setSystemTime(at(serverToday, "09:22"));
  await page.goto(path);
  const board = page.locator(".waiting-board");
  await board.locator(".waiting-board__room-name").first().waitFor();
  await page.waitForLoadState("networkidle");
  const room = board.locator(".waiting-board__room").filter({ hasText: ROOM });
  await mark(room.locator(".waiting-board__calling"), { label: 1, place: "corner" });
  await mark(room.locator(".waiting-board__waiting"), { label: 2, place: "corner" });
  await mark(room.locator(".waiting-board__facts"), { label: 3, place: "corner" });
  await shot("06-board", { target: [board.locator(".waiting-board__header"), board.locator(".waiting-board__grid")] });
  await clearMarks();

  await page.goto("/");
  await cleanUp();
}

/** 予約の行の「受付」。 */
async function checkIn(page, row) {
  await row.getByRole("button", { name: "受付", exact: true }).click();
  await row.getByRole("button", { name: "診察開始" }).waitFor();
}

/** 当日受付で、撮影の医師・第 1 診察室の再診として受け付ける。 */
async function walkInCheckIn(page, name) {
  await page.getByRole("button", { name: "当日受付" }).click();
  const modal = page.locator(".modal").filter({ hasText: "当日受付" });
  await labeled(modal, "氏名").locator("input").fill(name);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  await modal.locator(".master-search__row").filter({ hasText: name }).click();
  const fields = modal.locator(".walk-in__fields");
  await labeled(fields, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(fields, "担当医").locator("select").selectOption({ label: DOCTOR });
  await labeled(fields, "診察室").locator("select").selectOption({ label: ROOM });
  await labeled(fields, "初再診").locator("select").selectOption({ label: "再診" });
  await modal.getByRole("button", { name: "受付", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await page.locator(".outpatient-wrap tbody tr").filter({ hasText: name }).waitFor();
}

/** 撮影日の一覧に、撮影用でない患者の行が無いことを確かめる(担当医の絞り込みを外して見る)。 */
async function assertOnlyShootingPatients(page) {
  const api = await fhirApi(page);
  const appointments = await api.search("Appointment", { date: SHOOTING_DATE, _count: "500" });
  const others = appointments
    .filter((a) => !a.basedOn?.length && a.status !== "cancelled")
    .map((a) => a.participant?.find((p) => p.actor?.reference?.startsWith("Patient/"))?.actor?.display ?? "")
    .filter((name) => !name.startsWith("見本 "));
  if (others.length) throw new Error(`撮影日の外来患者一覧に撮影用でない患者がいます: ${others.join("、")}`);
}
