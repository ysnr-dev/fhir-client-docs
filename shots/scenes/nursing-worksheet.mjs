// 操作マニュアル「ワークシート」(docs/manual/nursing-worksheet.md)
// 看護 次郎が見本病棟の看護ワークシートを開き、遅れている「見本 秋子」の口腔清拭を印から記録する。
// 撮影の前後に、撮影日 8 時以降の看護の実施を直接消す。
import { nursingPatientId, openNursingMenu, removeShootingDayNursing, wardField } from "../lib/nursing.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeShootingDayNursing(page, patientId);

  // ワークシートを開く
  await openNursingMenu(page, "ワークシート");
  const grid = page.locator("table.nursing-worksheet, .nursing-worksheet table, table").filter({ hasText: "随時" }).first();
  const lateMark = grid.locator(".nursing-worksheet__mark--late").first();
  await lateMark.waitFor();
  await page.waitForLoadState("networkidle");
  const field = (text) => page.locator("label").filter({ hasText: new RegExp(`^${text}`) }).first();
  await mark(wardField(page), { label: 1, place: "corner" });
  await mark(field("勤務帯"), { label: 2, place: "corner" });
  await mark(field("担当"), { label: 3, place: "corner" });
  await mark(field("区分"), { label: 4, place: "corner" });
  await mark(field("状態"), { label: 5, place: "corner" });
  await mark(grid.locator(".nursing-worksheet__patient").filter({ hasText: "見本 秋子" }), { label: 6, place: "corner" });
  await shot("01-sheet", { target: [page.locator(".page__header"), grid] });
  await clearMarks();

  // 印の見方
  const injection = grid.locator(".nursing-worksheet__mark").filter({ hasText: "注" }).first();
  await mark(lateMark, { label: 1, place: "corner" });
  await mark(injection, { label: 2, place: "corner" });
  await shot("02-marks", { target: grid.getByRole("row").filter({ hasText: "見本 秋子" }) });
  await clearMarks();

  // 印から実施を記録する
  await lateMark.click();
  const modal = page.locator(".modal").filter({ hasText: "実施記録" }).last();
  await modal.waitFor();
  await modal.locator("tr").filter({ hasText: "口腔清拭" }).getByRole("checkbox").check();
  await shot("03-perform", { target: modal, padding: 24 });
  await modal.getByRole("button", { name: "記録", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  const doneMark = grid.locator(".nursing-worksheet__mark--done").filter({ hasText: "口腔清拭" }).first();
  await doneMark.waitFor();
  await mark(doneMark, { label: 1, place: "corner" });
  await shot("04-done", { target: grid.getByRole("row").filter({ hasText: "見本 秋子" }) });
  await clearMarks();

  // すべての勤務帯
  await field("勤務帯").locator("select").selectOption({ label: "すべて" });
  await page.waitForLoadState("networkidle");
  await shot("05-all-day", { target: grid });

  await removeShootingDayNursing(page, patientId);
}
