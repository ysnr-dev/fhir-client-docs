// 操作マニュアル「入院患者一覧・病棟マップ」(docs/manual/inpatient.md)
// 医師 四郎が見本 健一に、撮影日の見本病棟 102 ベッド1 への入院予定を入れる。看護 次郎が入院患者一覧の「入院予定」から入院実施し、
// 入院患者の一覧と行のメニュー、病棟マップ(患者のカード・右の患者情報・空床への転床)を撮る。転床は確定せずに破棄する。
// 撮影の前後に、見本 健一の入院と入院予定を直接消す(画面の入院取消は記録が残る)。
import { blur, fhirApi, labeled, logout, openKarte, patientIdOf, settle } from "../lib/karte.mjs";
import { selectWard, SHOOTING_WARD } from "../lib/nursing.mjs";
import { DOCTOR, patientIdByName } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 健一";
const ROOM = "102";

const at = (time) => new Date(`${SHOOTING_DATE}T${time}:00+09:00`);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const patientId = await patientIdByName(page, PATIENT);
  await removeAdmissions(page, patientId);
  await page.clock.setSystemTime(at("09:10"));
  await planAdmission(page);
  await logout(page);

  await page.clock.setSystemTime(at("10:30"));
  await login("nurse");
  await page.goto("/inpatients?tab=planned");
  await selectWard(page);
  const table = page.locator("main table").first();
  const row = (text) => table.locator("tbody tr").filter({ hasText: text });
  await row(PATIENT).waitFor();
  await page.waitForLoadState("networkidle");

  // 入院予定から入院実施
  const tabs = page.getByRole("tablist").first();
  await mark(wardLabel(page), { label: 1, place: "corner" });
  await mark(page.getByRole("tab", { name: "入院予定", exact: true }), { label: 2, place: "corner" });
  await mark(row(PATIENT).getByRole("button", { name: "入院実施" }), { label: 3, place: "corner" });
  await shot("01-planned", { target: [page.locator(".page__header"), tabs, table], padding: 24 });
  await clearMarks();

  await row(PATIENT).getByRole("button", { name: "入院実施" }).click();
  const execute = page.locator(".modal").filter({ hasText: "入院実施" });
  await labeled(execute, "入院日時").locator("input").waitFor();
  await blur(page);
  await settle(execute);
  await mark(labeled(execute, "ベッド"), { label: 1, place: "corner" });
  await mark(labeled(execute, "主治医"), { label: 2, place: "corner" });
  await mark(labeled(execute, "入院日時"), { label: 3, place: "corner" });
  await mark(execute.getByRole("button", { name: "入院登録" }), { label: 4, place: "corner" });
  await shot("02-execute", { target: execute });
  await clearMarks();
  await execute.getByRole("button", { name: "入院登録" }).click();
  await execute.waitFor({ state: "detached" });

  // 入院患者
  await page.getByRole("tab", { name: "入院患者", exact: true }).click();
  await row(PATIENT).getByRole("link", { name: "カルテ" }).waitFor();
  await page.waitForLoadState("networkidle");
  const empty = row("空床");
  await mark(labeled(page.locator(".patient-search-form"), "基準日"), { label: 1, place: "corner" });
  await mark(page.getByRole("tab", { name: "入院患者", exact: true }), { label: 2, place: "corner" });
  await mark(row(PATIENT).locator("td").nth(2), { label: 3, place: "corner" });
  await mark(empty.getByRole("button", { name: /の操作$/ }), { label: 4, place: "corner" });
  await mark(page.getByRole("link", { name: "病棟マップ" }).or(page.getByRole("button", { name: "病棟マップ" })).first(), { label: 5, place: "corner" });
  await shot("03-current", { target: [page.locator(".page__header"), tabs, table], padding: 24 });
  await clearMarks();

  // 行のメニュー
  await row(PATIENT).getByRole("button", { name: `${PATIENT} の操作` }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await shot("04-menu", { target: [row(PATIENT), menu], padding: 24 });
  await page.keyboard.press("Escape");

  // 病棟マップ
  await page.getByRole("link", { name: "病棟マップ" }).or(page.getByRole("button", { name: "病棟マップ" })).first().click();
  const card = page.locator(".ward-map__bed--occupied").filter({ hasText: PATIENT });
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  const target = page.locator(".ward-map__bed--empty").first();
  await mark(page.locator(".ward-map__toolbar"), { label: 1, place: "corner" });
  await mark(card, { label: 2, place: "corner" });
  await mark(target, { label: 3, place: "corner" });
  await mark(page.locator(".ward-map__panel").filter({ hasText: "本日の入院予定" }), { label: 4, place: "corner" });
  await shot("05-map", { target: [page.locator(".ward-map__toolbar"), page.locator(".ward-map__side h3", { hasText: "凡例" }).locator("..")] });
  await clearMarks();

  await card.click();
  const drawer = page.locator(".patient-drawer");
  await drawer.waitFor();
  await page.waitForLoadState("networkidle");
  await settle(drawer);
  const header = drawer.locator(".patient-drawer__header");
  const actions = drawer.locator(".patient-drawer__menu");
  await mark(header.getByRole("link", { name: "カルテ" }), { label: 1, place: "corner" });
  await mark(actions, { label: 2, place: "corner" });
  await shot("06-drawer", { target: [header, actions, drawer.getByRole("tab", { name: "基本情報" })], padding: 24 });
  await clearMarks();
  await card.click();
  await drawer.waitFor({ state: "detached" });

  // 空床へ運んで転床
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + from.width / 2 + ((to.x - from.x) * i) / 10, from.y + 20 + ((to.y - from.y) * i) / 10);
  }
  await page.mouse.up();
  const moves = page.locator(".ward-map__panel").filter({ hasText: "保留中の移動" });
  await moves.getByText(PATIENT).waitFor();
  await page.mouse.move(960, 1000);
  await mark(page.locator(".ward-map__bed--empty, .ward-map__bed").filter({ hasText: PATIENT }).last(), { label: 1, place: "corner" });
  await mark(moves, { label: 2, place: "corner" });
  await shot("07-move", { target: [page.locator(".ward-map__toolbar"), page.locator(".ward-map__side h3", { hasText: "凡例" }).locator("..")] });
  await clearMarks();

  await moves.getByRole("button", { name: "転床確定" }).click();
  const confirm = page.locator(".modal").filter({ hasText: "転床を確定" });
  await confirm.waitFor();
  await shot("08-confirm", { target: confirm });
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await moves.getByRole("button", { name: "すべて破棄" }).click();

  await logout(page);
  await login("doctor");
  await removeAdmissions(page, patientId);
}

/** 病棟の画面の「病棟」の欄。 */
function wardLabel(page) {
  return page.locator("label").filter({ has: page.locator("select") }).filter({ hasText: /^病棟/ }).first();
}

/** カルテの右ペインの「入院予定」で、撮影日に見本病棟 102 ベッド1 へ入る予定を入れる。 */
async function planAdmission(page) {
  await openKarte(page, PATIENT);
  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "入院予定", exact: true }).click();
  const ward = labeled(right, "病棟").locator("select");
  await ward.locator("option", { hasText: SHOOTING_WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: SHOOTING_WARD });
  const room = labeled(right, "病室").locator("select");
  await room.locator("option", { hasText: ROOM }).waitFor({ state: "attached" });
  await room.selectOption({ label: ROOM });
  const bed = labeled(right, "ベッド").locator("select");
  await bed.locator("option").nth(1).waitFor({ state: "attached" });
  await bed.selectOption({ index: 1 });
  await labeled(right, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(right, "主治医").locator("select").selectOption({ label: DOCTOR });
  await labeled(right, "入院予定日").locator("input[type=date]").fill(SHOOTING_DATE);
  await labeled(right, "入院経路").locator("select").selectOption({ label: "家庭からの入院" });
  await labeled(right, "予定・救急医療入院").locator("select").selectOption({ label: "予定入院" });
  await labeled(right, "特記事項").locator("textarea").fill("大腸ポリープの内視鏡的切除。");
  const submit = right.getByRole("button", { name: "入院予定登録" });
  await submit.click();
  await submit.waitFor({ state: "detached" });
  return patientIdOf(page);
}

/** 患者の入院・入院予定と、入院に付いた通知を消す。 */
async function removeAdmissions(page, patientId) {
  const api = await fhirApi(page);
  for (const task of await api.search("Task", { patient: patientId, _count: "100" })) await api.remove("Task", task.id);
  const encounters = await api.search("Encounter", { patient: patientId, _count: "100" });
  for (const encounter of encounters.filter((e) => e.class?.code === "IMP" || ["planned", "cancelled"].includes(e.status))) {
    await api.remove("Encounter", encounter.id);
  }
}
