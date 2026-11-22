// 操作マニュアル「看護指示の実施」(docs/manual/nursing-perform.md)
// 看護 次郎が病棟の指示簿から「見本 秋子」(撮影用の架空の患者。看護指示を持つ)の実施を記録する。
// 9 時に遅れている口腔清拭を、14 時過ぎに午後の観察を記録する(ブラウザの時計を 14 時過ぎに進める)。
// 撮影の前後に、撮影日 8 時以降の実施を直接消す。
import { blur } from "../lib/karte.mjs";
import { nursingPatientId, openNursingMenu, removeShootingDayNursing } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const AFTERNOON = new Date(`${SHOOTING_DATE}T14:05:00+09:00`);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeShootingDayNursing(page, patientId);

  // 実施予定を見る
  await openNursingMenu(page, "指示簿");
  await page.getByRole("tab", { name: /^実施予定/ }).click();
  const table = page.locator("table.lab-worklist").first();
  const oralCare = table.getByRole("row").filter({ hasText: "口腔清拭" });
  await oralCare.waitFor();
  await page.waitForLoadState("networkidle");
  const performButton = table.getByRole("button", { name: "実施入力" }).first();
  await mark(page.getByRole("tab", { name: /^実施予定/ }), { label: 1, place: "corner" });
  await mark(oralCare.locator("td").nth(7), { label: 2, place: "corner" });
  await mark(performButton, { label: 3, place: "corner" });
  await shot("01-due", { target: [page.getByRole("tab", { name: /^実施予定/ }), table] });
  await clearMarks();

  // 行為を記録する
  await performButton.click();
  let modal = page.locator(".modal").filter({ hasText: "実施記録" }).last();
  await modal.waitFor();
  const actRow = modal.locator("tr").filter({ hasText: "口腔清拭" });
  await actRow.getByRole("checkbox").check();
  await blur(page);
  await mark(modal.locator("label").filter({ hasText: "記録日時" }), { label: 1, place: "corner" });
  await mark(modal.locator("label").filter({ hasText: "実施者" }), { label: 2, place: "corner" });
  await mark(modal.locator("tr").filter({ hasText: "体温" }).locator(".nursing-perform__slots"), { label: 3, place: "corner" });
  await mark(actRow.getByRole("checkbox"), { label: 4 });
  const record = modal.getByRole("button", { name: "記録", exact: true });
  await mark(record, { label: 5 });
  await shot("02-act", { target: modal, padding: 24 });
  await clearMarks();
  await record.click();
  await modal.waitFor({ state: "detached" });

  // 14 時の観察を記録する
  await page.clock.setSystemTime(AFTERNOON);
  await page.reload();
  await page.getByRole("tab", { name: /^実施予定/ }).click();
  await table.getByRole("row").filter({ hasText: "体温" }).waitFor();
  await page.waitForLoadState("networkidle");
  await table.getByRole("button", { name: "実施入力" }).first().click();
  modal = page.locator(".modal").filter({ hasText: "実施記録" }).last();
  await modal.waitFor();
  const row = (text) => modal.locator("tr").filter({ hasText: text });
  await row("体温").locator("input").first().fill("36.8");
  await row("脈拍数").locator("input").first().fill("76");
  await modal.getByLabel("収縮期血圧").fill("118");
  await modal.getByLabel("拡張期血圧").fill("70");
  await row("経皮的動脈血酸素飽和度").locator("input").first().fill("97");
  await row("経皮的動脈血酸素飽和度").locator("input").last().fill("室内気");
  await blur(page);
  await mark(row("体温").locator(".nursing-perform__value"), { label: 1, place: "corner" });
  await mark(modal.getByLabel("収縮期血圧").locator(".."), { label: 2, place: "corner" });
  await mark(row("経皮的動脈血酸素飽和度").locator("input").last(), { label: 3, place: "corner" });
  await mark(row("血糖値").locator(".nursing-perform__slots"), { label: 4, place: "corner" });
  await shot("03-observe", { target: modal, padding: 24 });
  await clearMarks();
  await modal.getByRole("button", { name: "記録", exact: true }).click();
  await modal.waitFor({ state: "detached" });

  // 記録したあとの指示簿
  await page.getByRole("tab", { name: "全指示" }).click();
  const temperature = table.getByRole("row").filter({ hasText: "体温" });
  await temperature.waitFor();
  await page.waitForTimeout(1000);
  await page.waitForLoadState("networkidle");
  await mark(temperature.locator("td").nth(7), { label: 1, place: "corner" });
  await shot("04-after", { target: table });
  await clearMarks();

  // 実施履歴と取消
  await temperature.getByRole("button", { name: "表示" }).click();
  const detail = page.locator(".modal").last();
  const history = detail.getByRole("button", { name: "取消" }).first();
  await history.waitFor();
  await mark(history, { label: 1 });
  await shot("05-history", { target: detail });
  await clearMarks();

  await removeShootingDayNursing(page, patientId);
}
