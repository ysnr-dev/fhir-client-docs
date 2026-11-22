// 操作マニュアル「看護必要度」(docs/manual/nursing-acuity.md)
// 看護 次郎が見本病棟の撮影日の重症度、医療・看護必要度を評価して登録し、集計と届出を見る。
// 撮影の前後に、見本病棟の 2 人の撮影日の評価を直接消す。
import { fhirApi } from "../lib/karte.mjs";
import { NURSING_PATIENT, openNursingMenu, SHOOTING_WARD } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENTS = ["見本 太郎", NURSING_PATIENT];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  await removeEvaluations(page);

  // 評価のグリッド
  await openNursingMenu(page, "看護必要度", { selectWard: false });
  const unit = page.locator("label").filter({ hasText: /^届出単位/ }).first();
  const unitSelect = unit.locator("select");
  const unitOption = await unitSelect.locator("option").filter({ hasText: SHOOTING_WARD }).first().getAttribute("value");
  await unitSelect.selectOption(unitOption);
  const grid = page.locator("table").first();
  const row = (name) => grid.getByRole("row").filter({ hasText: name }).first();
  await row(NURSING_PATIENT).waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  // 見本 秋子: 呼吸ケア(A2)と、介助が要る B の項目
  const akiko = row(NURSING_PATIENT);
  await akiko.locator("td").nth(1).click();
  const b = akiko.locator("select");
  await b.nth(0).selectOption({ label: "何かにつかまればできる" });
  await b.nth(1).selectOption({ label: "一部介助・介助あり" });
  await b.nth(2).selectOption({ label: "要介助・介助あり" });
  await b.nth(3).selectOption({ label: "一部介助・介助あり" });
  await b.nth(4).selectOption({ label: "一部介助・介助あり" });
  // 見本 太郎: 自立のまま登録の対象にする
  await row("見本 太郎").getByRole("checkbox").check();
  await page.mouse.move(960, 1060);
  const submit = page.getByRole("button", { name: "登録", exact: true });
  await mark(unit, { label: 1, place: "corner" });
  await mark(akiko.locator("td").nth(1), { label: 2, place: "corner" });
  await mark(b.nth(1), { label: 3, place: "corner" });
  await mark(akiko.locator("td").nth(-5), { label: 4, place: "corner" });
  await mark(akiko.getByRole("checkbox"), { label: 5, place: "corner" });
  await mark(submit, { label: 6, place: "corner" });
  await shot("01-grid", { target: [page.getByRole("tab", { name: "評価" }), grid], padding: 24 });
  await clearMarks();
  await submit.click();
  await page.waitForLoadState("networkidle");
  await akiko.getByText("評価済").waitFor();
  await page.waitForTimeout(500);

  // 1 人ずつの評価
  await akiko.getByRole("link", { name: NURSING_PATIENT }).or(akiko.getByRole("button", { name: NURSING_PATIENT })).first().click();
  const modal = page.locator(".modal").last();
  await modal.waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await shot("02-patient", { target: modal });
  await modal.locator(".modal__close").click();

  // 集計
  await page.getByRole("tab", { name: "集計" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const summaryTable = page.locator("table").first();
  await shot("03-summary", { target: [page.getByRole("tab", { name: "評価" }), summaryTable, page.getByText(/^該当 \d+ \/ 評価/).last()], padding: 24 });

  // 届出
  await page.getByRole("tab", { name: "届出" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Excel" }).waitFor();
  await shot("04-report", { target: [page.getByRole("tab", { name: "評価" }), page.getByRole("button", { name: "Excel" }), page.getByText("2 オ 基準").first(), page.locator("table").first()], padding: 24 });

  await removeEvaluations(page);
}

/** 見本病棟の患者の撮影日の看護必要度の評価を消す。 */
async function removeEvaluations(page) {
  const api = await fhirApi(page);
  for (const name of PATIENTS) {
    const [family, given] = name.split(" ");
    const [patient] = await api.search("Patient", { family, given });
    if (!patient) continue;
    const observations = await api.search("Observation", { patient: patient.id, date: SHOOTING_DATE, _count: "500" });
    for (const observation of observations.filter((o) => /acuity/i.test(JSON.stringify(o.code ?? {})) && o.effectiveDateTime?.startsWith(SHOOTING_DATE))) {
      await api.remove("Observation", observation.id);
    }
  }
}
