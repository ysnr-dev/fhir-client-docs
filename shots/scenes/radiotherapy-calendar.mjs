// 操作マニュアル「放射線治療カレンダー」(docs/manual/radiotherapy-calendar.md)
// 医師 四郎が「見本 次郎」(撮影用の架空の患者。結腸癌)に腰椎転移への緩和照射(骨転移 30Gy/10回)を処方し、
// 放射 七郎(診療放射線技師)が放射線治療カレンダーでコースを受け付け、照射予定を組み、初回の照射を記録する。
// 右のコースの一覧には開発データの患者も並ぶので、患者の絞り込みに「見本」を入れて撮る。
// 撮影の前後に、撮影日に出した放射線治療を予定・照射記録ごと消す。
import { blur, labeled, logout, menuItem, openKarte } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 次郎";
const PROTOCOL = "骨転移 30Gy/10回";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が治療処方を出す
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["radiotherapy"]);
  await openKarte(page, PATIENT);
  await registerCourse(page);
  await logout(page);

  // 放射線治療カレンダー
  await login("radTech");
  await openDepartmentMenu(page, "放射線部門", "放射線治療カレンダー");
  await page.getByPlaceholder("氏名・患者番号").fill("見本");
  const courses = page.locator(".surgery-pending");
  const course = courses.locator(".surgery-pending__card").filter({ hasText: PATIENT }).first();
  await course.getByRole("button", { name: "受付" }).waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(page.getByText("日", { exact: true }).first(), { label: 1, place: "corner" });
  await mark(page.getByRole("button", { name: "今日" }).locator(".."), { label: 2 });
  await mark(page.getByText("リニアック1号機", { exact: false }).first(), { label: 3, place: "corner" });
  await mark(page.getByPlaceholder("氏名・患者番号"), { label: 4 });
  await mark(course.getByRole("button", { name: "受付" }), { label: 5, place: "corner" });
  await mark(page.getByRole("button", { name: "新規登録" }), { label: 6 });
  await shot("01-calendar", { target: [page.locator(".page__header"), course, page.getByRole("button", { name: "新規登録" })], padding: 24 });
  await clearMarks();

  // 受付
  await course.getByRole("button", { name: "受付" }).click();
  await course.getByRole("button", { name: "予定登録" }).waitFor();
  await page.waitForLoadState("networkidle");
  await course.getByRole("button", { name: "この放射線治療の操作" }).click();
  await menuItem(page, "受付取消").waitFor();
  const menu = page.locator(".row-menu__items").last();
  await mark(course.locator(".surgery-calendar__status"), { label: 1, place: "corner" });
  await mark(course.getByRole("button", { name: "治療開始" }), { label: 2, place: "corner" });
  await mark(course.getByRole("button", { name: "予定登録" }), { label: 3, place: "corner" });
  await mark(menuItem(page, "受付取消"), { label: 4 });
  await shot("02-accepted", { target: [course, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 照射予定を組む
  await course.getByRole("button", { name: "予定登録" }).click();
  const plan = page.locator(".modal").filter({ hasText: "照射予定の一括登録" });
  await plan.getByRole("button", { name: /回ぶん登録/ }).waitFor();
  await plan.getByLabel(/開始時刻/).fill("10:00");
  await blur(page);
  const rows = plan.locator("tbody tr");
  await mark(labeled(plan, "開始日"), { label: 1, place: "corner" });
  await mark(labeled(plan, "開始時刻"), { label: 2, place: "corner" });
  await mark(labeled(plan, "所要時間"), { label: 3, place: "corner" });
  await mark(labeled(plan, "治療装置"), { label: 4, place: "corner" });
  await mark(plan.locator("label").filter({ hasText: /^月$/ }).locator("..").first(), { label: 5 });
  await mark(rows.first().locator("input"), { label: 6, place: "corner" });
  await mark(rows.first().getByRole("button", { name: "外す" }), { label: 7, place: "corner" });
  await mark(plan.getByRole("button", { name: /回ぶん登録/ }), { label: 8 });
  await shot("03-plan", { target: plan, padding: 24 });
  await clearMarks();
  await plan.getByRole("button", { name: /回ぶん登録/ }).click();
  await plan.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 治療開始
  await course.getByRole("button", { name: "治療開始" }).click();
  await course.getByRole("button", { name: "休止" }).waitFor();
  await page.waitForLoadState("networkidle");
  const slot = page.locator(".radiotherapy-calendar__card").filter({ hasText: PATIENT }).first();
  await mark(slot, { label: 1 });
  await mark(slot.getByRole("button", { name: "実施" }), { label: 2, place: "corner" });
  await mark(course.locator(".surgery-calendar__status"), { label: 3, place: "corner" });
  await mark(course.getByRole("button", { name: "終了" }).locator(".."), { label: 4 });
  await shot("04-scheduled", { target: [page.locator(".page__header"), slot, course], padding: 24 });
  await clearMarks();

  // 照射を記録する
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T10:20:00+09:00`));
  await slot.getByRole("button", { name: "実施" }).click();
  const perform = page.locator(".modal").filter({ hasText: "照射入力" });
  await perform.getByRole("button", { name: "登録", exact: true }).waitFor();
  await labeled(perform, "位置照合").locator("select").selectOption({ label: "CBCT" });
  await blur(page);
  await mark(labeled(perform, "照射日"), { label: 1, place: "corner" });
  await mark(labeled(perform, "開始時刻"), { label: 2, place: "corner" });
  await mark(labeled(perform, "終了時刻"), { label: 2, place: "corner" });
  await mark(labeled(perform, "Phase"), { label: 3, place: "corner" });
  await mark(labeled(perform, "何回目"), { label: 3, place: "corner" });
  await mark(labeled(perform, "使用装置"), { label: 4, place: "corner" });
  await mark(labeled(perform, "位置照合"), { label: 5, place: "corner" });
  await mark(labeled(perform, "実施者"), { label: 6, place: "corner" });
  await mark(perform.locator("tbody tr").first().locator("input"), { label: 7, place: "corner" });
  await mark(perform.getByRole("button", { name: "登録", exact: true }), { label: 8 });
  await shot("05-perform", { target: perform, padding: 24 });
  await clearMarks();
  await perform.getByRole("button", { name: "登録", exact: true }).click();
  await perform.waitFor({ state: "detached" });
  await slot.getByText("実施済", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(slot.getByText("実施済", { exact: true }), { label: 1, place: "corner" });
  await mark(course.getByText(/^照射 1 \/ 10 回/), { label: 2, place: "corner" });
  await mark(course.getByText("診察なし", { exact: true }), { label: 3, place: "corner" });
  await shot("06-performed", { target: [slot, course], padding: 24 });
  await clearMarks();

  // 週の表示
  await page.getByText("週", { exact: true }).first().click();
  await page.getByText(/^2\/5\(金\)$/).waitFor();
  await page.waitForLoadState("networkidle");
  await shot("07-week", { target: [page.locator(".page__header"), course], padding: 24 });

  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["radiotherapy"]);
}

/** 開いているカルテから、撮影日に始める治療処方を登録する(プロトコルで標的と Phase を入れ、部位と装置を選ぶ)。 */
async function registerCourse(page) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "放射線治療", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const course = fieldset("治療コース");
  await course.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(course, "治療プロトコル").locator("select").selectOption({ label: PROTOCOL });
  await labeled(course, "開始予定日").locator("input").fill(SHOOTING_DATE);
  await labeled(course, "担当医").locator("select").selectOption({ label: "医師 四郎" });
  await labeled(course, "対象プロブレム").locator("select").selectOption({ label: "#1 結腸癌" });
  const targets = fieldset("標的");
  await labeled(targets, "部位").locator("select").selectOption({ label: "354 腰椎" });
  await labeled(targets, "補足").locator("input").fill("L3 椎体");
  await labeled(fieldset("Phase"), "使用予定装置").locator("select").selectOption({ index: 1 });
  await blur(page);
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
