// 操作マニュアル「食事一覧」(docs/manual/meal-worklist.md)
// 医師 四郎が見本病棟の「見本 太郎」(胃潰瘍食・全粥、撮影日の昼から)と「見本 秋子」(糖尿病食・全粥、撮影日の朝から)に
// 食事を指示し、栄養 桃子(管理栄養士)が食事一覧で患者別の食事と食数を見る。一覧には在院中の全患者が並ぶので、
// 病棟を見本病棟に絞って撮る。撮影の前後に、撮影日に出した食事のオーダーを消す。
import { blur, labeled, logout, openKarte, settle } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";

const MEALS = [
  { patient: "見本 太郎", diet: "胃潰瘍食1600kcal", staple: "全粥", start: "昼食から", comment: "刻み不要。温かいものを" },
  { patient: "見本 秋子", diet: "糖尿病食1400kcal", staple: "全粥", start: "朝食から", comment: "" },
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await cleanUp(page);
  for (const meal of MEALS) {
    await openKarte(page, meal.patient);
    await registerMeal(page, meal);
  }
  await logout(page);

  await login("dietitian");
  await openDepartmentMenu(page, "栄養部門", "食事一覧");
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "病棟").locator("select").selectOption({ label: "見本病棟" });
  const rows = page.locator("tbody tr");
  await rows.filter({ hasText: MEALS[0].patient }).waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  const taro = rows.filter({ hasText: MEALS[0].patient });
  await mark(labeled(filters, "日付"), { label: 1, place: "corner" });
  await mark(labeled(filters, "病棟"), { label: 2, place: "corner" });
  await mark(labeled(filters, "表示"), { label: 3, place: "corner" });
  await mark(taro.locator("td").nth(3), { label: 4, place: "corner" });
  await mark(taro.locator("td").nth(4), { label: 5, place: "corner" });
  await mark(taro.locator("td").last(), { label: 6, place: "corner" });
  await mark(taro.getByRole("link", { name: MEALS[0].patient }), { label: 7, place: "corner" });
  await shot("01-patients", { target: [page.locator(".page__header"), rows.last()], padding: 24 });
  await clearMarks();

  await page.locator(".order-select__tabs").getByText(/^食数集計/).click();
  const dietTable = page.locator("table").filter({ hasText: MEALS[0].diet }).first();
  await dietTable.waitFor();
  await page.waitForLoadState("networkidle");
  const stapleTable = page.locator("table:visible").filter({ hasText: "主食" }).last();
  await settle(stapleTable);
  const tiles = page.locator(".stat-tiles:visible").first();
  await mark(tiles, { label: 1 });
  await mark(dietTable, { label: 2 });
  await mark(stapleTable, { label: 3, place: "corner" });
  await shot("02-counts", { target: [page.locator(".page__header"), dietTable, stapleTable], padding: 24 });
  await clearMarks();
  await logout(page);
  await login("doctor");
  await cleanUp(page);
}

async function cleanUp(page) {
  for (const { patient } of MEALS) await removeShootingOrders(page, await patientIdByName(page, patient), ["meal"]);
}

/** 開いているカルテから、撮影日に始める食事を指示する(特別食の食種・主食・開始の食)。 */
async function registerMeal(page, { diet, staple, start, comment }) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "食事", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const content = fieldset("食事内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");
  await content.getByRole("button", { name: "食種選択" }).click();
  const picker = page.locator(".modal").filter({ hasText: "食種選択" }).last();
  await labeled(picker, "種別").locator("select").selectOption({ label: "特別食" });
  const dietRow = picker.getByRole("row").filter({ hasText: diet });
  await dietRow.waitFor();
  await dietRow.locator("td").nth(1).click();
  await picker.waitFor({ state: "detached" });
  const stapleSet = fieldset("主食");
  for (const meal of ["朝", "昼", "夕"]) await labeled(stapleSet, meal).locator("select").selectOption({ label: staple });
  const period = fieldset("期間");
  await period.locator("label").filter({ has: page.locator("select") }).nth(0).locator("select").selectOption({ label: start });
  if (comment) await fieldset("コメント").locator("textarea").fill(comment);
  await blur(page);
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
