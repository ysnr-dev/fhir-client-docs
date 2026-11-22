// 操作マニュアル「地域連携」(docs/manual/referrals.md)
// 連携 菊子(地域医療連携部)が、見本内科クリニック(撮影用の架空の連携先)から「見本 花子」の紹介を受けて台帳に載せ、
// 受診日と返書(受診報告・最終報告)を記録して、集計を見る。撮影の前後に、撮影日以降に載せた見本 花子の紹介を消す。
import { blur, labeled } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const PARTNER = "見本内科クリニック";
const VISIT_DATE = "2027-02-03";
const FINAL_DATE = "2027-02-17";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T10:00:00+09:00`));
  await login("liaison");
  const patientId = await patientIdByName(page, PATIENT);
  const cleanUp = () => removeShootingOrders(page, patientId, ["referral"]);
  await cleanUp();
  await openDepartmentMenu(page, "地域連携部門", "地域連携");
  const main = page.locator("main");
  const filters = main.locator(".patient-search-form").first();
  await filters.waitFor();
  await page.getByLabel("紹介日(開始)").first().fill(SHOOTING_DATE);
  await labeled(filters, "状態").locator("select").selectOption({ label: "すべて" });

  // 紹介受の登録
  await filters.getByRole("button", { name: "登録", exact: true }).click();
  const modal = page.locator(".modal").filter({ hasText: "紹介受の登録" }).last();
  await modal.getByLabel(/氏名/).fill(PATIENT);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  await modal.getByRole("row").filter({ hasText: PATIENT }).locator("td").nth(1).click();
  await labeled(modal, "受診予定日").locator("input").fill(VISIT_DATE);
  await modal.getByRole("button", { name: "選択", exact: true }).click();
  const picker = page.locator(".modal").filter({ hasText: "紹介元を選択" }).last();
  await picker.getByLabel(/医療機関名/).fill(PARTNER);
  await picker.getByRole("button", { name: "検索", exact: true }).click();
  await picker.getByRole("row").filter({ hasText: PARTNER }).locator("td").nth(1).click();
  await picker.waitFor({ state: "detached" });
  await labeled(modal, "紹介医").locator("input").fill("見本 一夫");
  await labeled(modal, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(modal, "担当医").locator("select").selectOption({ label: "医師 四郎" });
  await labeled(modal, "紹介目的").locator("textarea").fill("2 型糖尿病。HbA1c 8.5% と血糖コントロール不良のため、精査と治療方針のご相談");
  await blur(page);
  const submit = modal.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true });
  await mark(labeled(modal, "区分"), { label: 1, place: "corner" });
  await mark(labeled(modal, "受診予定日"), { label: 2, place: "corner" });
  await mark(labeled(modal, "紹介元"), { label: 3, place: "corner" });
  await mark(labeled(modal, "紹介医"), { label: 4, place: "corner" });
  await mark(labeled(modal, "担当医").locator(".."), { label: 5, place: "corner" });
  await mark(labeled(modal, "紹介目的"), { label: 6, place: "corner" });
  await mark(labeled(modal, "紹介状"), { label: 7, place: "corner" });
  await mark(submit, { label: 8, place: "corner" });
  await shot("01-create", { target: modal });
  await clearMarks();
  await submit.click();
  await modal.waitFor({ state: "detached" });

  // 一覧(受診待ち)
  const rows = main.locator("tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.getByText("受診待ち").waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("撮影日以降の紹介受に撮影用でない行があります");
  await mark(main.getByRole("tablist").first(), { label: 1, place: "corner" });
  await mark(filters, { label: 2, place: "corner" });
  await mark(row.locator("td").nth(4), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(-2), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "受診", exact: true }), { label: 5, place: "corner" });
  await shot("02-list", { target: [main.locator("h1").first(), row], padding: 24 });
  await clearMarks();

  // 受診の記録
  await page.clock.setSystemTime(new Date(`${VISIT_DATE}T11:00:00+09:00`));
  await row.getByRole("button", { name: "受診", exact: true }).click();
  const visit = page.locator(".modal").filter({ hasText: "受診の記録" }).last();
  await mark(labeled(visit, "受診日"), { label: 1, place: "corner" });
  await mark(visit.getByRole("button", { name: "登録", exact: true }), { label: 2, place: "corner" });
  await shot("03-visit", { target: visit });
  await clearMarks();
  await visit.getByRole("button", { name: "登録", exact: true }).click();
  await visit.waitFor({ state: "detached" });
  await row.getByText("返書待ち").waitFor();

  // 返書(受診報告)
  await row.getByRole("button", { name: "返書", exact: true }).click();
  const reply = page.locator(".modal").filter({ hasText: "返書の記録" }).last();
  await labeled(reply, "メモ").locator("input").fill("初診時の検査結果と治療方針を報告");
  await blur(page);
  await mark(labeled(reply, "区分"), { label: 1, place: "corner" });
  await mark(labeled(reply, "送付日"), { label: 2, place: "corner" });
  await mark(labeled(reply, "文書"), { label: 3, place: "corner" });
  await mark(labeled(reply, "メモ"), { label: 4, place: "corner" });
  await mark(reply.getByRole("button", { name: "登録", exact: true }), { label: 5, place: "corner" });
  await shot("04-reply", { target: reply });
  await clearMarks();
  await reply.getByRole("button", { name: "登録", exact: true }).click();
  await reply.waitFor({ state: "detached" });
  await row.locator(".referral__reply").first().waitFor();

  // 返書(最終報告)で完了
  await page.clock.setSystemTime(new Date(`${FINAL_DATE}T11:00:00+09:00`));
  await row.getByRole("button", { name: "返書", exact: true }).click();
  await reply.waitFor();
  await reply.getByRole("button", { name: "登録", exact: true }).click();
  await reply.waitFor({ state: "detached" });
  await row.getByText("完了").waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator("td").nth(-4), { label: 1, place: "corner" });
  await mark(row.locator("td").nth(-3), { label: 2, place: "corner" });
  await mark(row.locator("td").nth(-2), { label: 3, place: "corner" });
  await shot("05-done", { target: [main.locator("thead").first(), row] });
  await clearMarks();

  // 集計
  await main.getByRole("tab", { name: "集計" }).click();
  await page.getByLabel("紹介日(開始)").first().fill(SHOOTING_DATE);
  const statFilters = main.locator(".patient-search-form").first();
  await labeled(statFilters, "初診患者数").locator("input").fill("20");
  await blur(page);
  const partnerRow = main.locator("tbody tr").filter({ hasText: PARTNER });
  await partnerRow.waitFor();
  await main.getByText("返書 1 / 受診 1").waitFor();
  await page.waitForLoadState("networkidle");
  if ((await main.locator("tbody tr").count()) !== 1) throw new Error("集計に撮影用でない連携先があります");
  const tile = (label) => main.locator(".stat-tile").filter({ hasText: label }).first();
  await mark(statFilters.locator("label").first(), { label: 1, place: "corner" });
  await mark(labeled(statFilters, "初診患者数"), { label: 2, place: "corner" });
  await mark(tile("紹介率"), { label: 3, place: "corner" });
  await mark(tile("返書率"), { label: 4, place: "corner" });
  await mark(tile("返書待ち"), { label: 5, place: "corner" });
  await mark(partnerRow, { label: 6, place: "corner" });
  await shot("06-stats", { target: [main.getByRole("tablist").first(), partnerRow], padding: 24 });
  await clearMarks();

  await cleanUp();
}
