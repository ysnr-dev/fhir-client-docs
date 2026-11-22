// 操作マニュアル「経過表と一括入力」(docs/manual/nursing-flowsheet.md)
// 看護 次郎が見本病棟の 2 人の朝の測定を経過表一括入力で入れ、「見本 秋子」の経過表タブを見る。
// 撮影の前後に、撮影日 8 時以降の測定と看護の実施を直接消す。
import { blur, openKarte } from "../lib/karte.mjs";
import {
  NURSING_PATIENT,
  nursingPatientId,
  openNursingMenu,
  removeShootingDayNursing,
  removeShootingDayVitals,
  wardField,
} from "../lib/nursing.mjs";

const PATIENTS = ["見本 太郎", NURSING_PATIENT];
// 血圧(上・下)・体温・脈拍・SpO2・呼吸数・体重の順。体重は測らない。
const VALUES = {
  "見本 太郎": ["126", "78", "36.6", "72", "98", "16", ""],
  [NURSING_PATIENT]: ["122", "70", "36.9", "80", "96", "18", ""],
};

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  const cleanUp = async () => {
    await removeShootingDayVitals(page, PATIENTS);
    await removeShootingDayNursing(page, patientId);
  };
  await cleanUp();

  // 経過表一括入力
  await openNursingMenu(page, "経過表一括入力");
  const table = page.locator("table").first();
  const row = (name) => table.getByRole("row").filter({ hasText: name });
  await row(NURSING_PATIENT).waitFor();
  const measuredAt = page.locator("label").filter({ hasText: /^測定日時/ }).first();
  for (const name of PATIENTS) {
    const inputs = row(name).locator("input");
    for (const [index, value] of VALUES[name].entries()) if (value) await inputs.nth(index).fill(value);
  }
  await blur(page);
  const submit = page.getByRole("button", { name: /^登録/ });
  await mark(wardField(page), { label: 1, place: "corner" });
  await mark(measuredAt, { label: 2, place: "corner" });
  await mark(page.locator("label").filter({ hasText: /^食事/ }).first(), { label: 3, place: "corner" });
  await mark(row(NURSING_PATIENT).locator("input").first(), { label: 4, place: "corner" });
  await mark(submit, { label: 5 });
  await shot("01-bulk", { target: [page.locator(".page__header"), submit], padding: 24 });
  await clearMarks();
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/fhir");
  await submit.click();
  await saved;
  await page.waitForLoadState("networkidle");

  // 経過表タブ
  await openKarte(page, NURSING_PATIENT);
  const tab = page.locator(".karte-tabs__list").getByRole("tab", { name: "経過表", exact: true });
  await tab.click();
  const panel = page.locator(".karte-left .karte-tabpanel");
  const wrap = panel.locator(".lab-timeline__table-wrap").first();
  await wrap.waitFor();
  await page.waitForLoadState("networkidle");
  await wrap.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.waitForTimeout(300);
  const controls = panel.locator(".lab-timeline__controls").first();
  await mark(controls.locator("input[type=date]").first(), { label: 1, place: "corner" });
  await mark(controls.locator("select").first(), { label: 2, place: "corner" });
  await mark(controls.getByRole("button", { name: "全画面" }), { label: 3, place: "corner" });
  await mark(panel.locator(".vital-flowsheet__chart").first(), { label: 4, place: "corner" });
  await shot("02-flowsheet", { target: panel, padding: 32 });
  await clearMarks();

  await cleanUp();
}
