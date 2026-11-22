// 操作マニュアル「院内がん登録」(docs/manual/cancer-registry.md)
// 医師 四郎が、院内がん登録の一覧を診断日で見本 太郎(早期胃癌)・見本 次郎(結腸癌)に絞り、見本 太郎の「登録」から
// 標準登録様式のテンプレートを開き、初期値の入った登録の画面を撮る(必須の項目が多いので登録はしない)。
// 撮影の前後に、見本 太郎の院内がん登録の回答を消す。
import { blur, fhirApi, labeled } from "../lib/karte.mjs";
import { patientIdByName } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const FROM = "2026-12-01";
const HBCR_TITLE = "院内がん登録 標準登録様式";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const api = await fhirApi(page);
  const patientId = await patientIdByName(page, PATIENT);
  const cleanUp = async () => {
    for (const response of await api.search("QuestionnaireResponse", { patient: patientId, _count: "500" })) {
      if (/hbcr/i.test(response.questionnaire ?? "")) await api.remove("QuestionnaireResponse", response.id);
    }
  };
  await cleanUp();

  // 登録対象の一覧
  const rows = await openList(page);
  const row = rows.filter({ hasText: PATIENT });
  const filters = page.locator(".patient-search-form");
  await mark(labeled(filters, "診断日"), { label: 1, place: "corner" });
  await mark(labeled(filters, "状態"), { label: 2, place: "corner" });
  await mark(labeled(filters, "届出"), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(8), { label: 4, place: "corner" });
  await mark(row.getByRole("link", { name: "登録" }), { label: 5, place: "corner" });
  await mark(page.getByRole("button", { name: "CSV" }), { label: 6, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), filters, page.locator(".lab-worklist"), page.locator(".lab-worklist__count")], padding: 24 });
  await clearMarks();

  // 登録を始める
  await row.getByRole("link", { name: "登録" }).click();
  const right = page.locator(".karte-right");
  const trigger = right.locator(".template-select__trigger");
  const form = right.locator("form").first();
  const meta = form.locator(".qp-meta");
  await trigger.filter({ hasText: HBCR_TITLE }).waitFor();
  await meta.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  const problem = form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select");
  const birthDate = form.locator(".qp-field").filter({ hasText: "[150] 生年月日" }).last();
  await mark(trigger, { label: 1, place: "corner" });
  await mark(meta.locator("summary"), { label: 2, place: "corner" });
  await mark(problem, { label: 3, place: "corner" });
  await mark(form.locator(".qp-field").filter({ hasText: "[900] 病院等の名称" }).last(), { label: 4, place: "corner" });
  await shot("02-form", { target: [right.getByText("テンプレート登録", { exact: true }), right.getByText("閉じる", { exact: true }), birthDate], padding: 24 });
  await clearMarks();

  await cleanUp();
}

/** 院内がん登録の一覧を開き、診断日を撮影用の患者の病名だけが入る期間に絞る。 */
async function openList(page) {
  await page.goto("/cancer-registry");
  const form = page.locator(".patient-search-form");
  await labeled(form, "診断日").locator("input[type=date]").first().fill(FROM);
  await form.getByLabel("診断日の終わり").fill(SHOOTING_DATE);
  const rows = page.locator(".lab-worklist tbody tr");
  await rows.filter({ hasText: PATIENT }).waitFor();
  await page.waitForLoadState("networkidle");
  for (const text of await rows.allInnerTexts()) {
    if (!/見本 /.test(text)) throw new Error(`院内がん登録の一覧に撮影用でない行があります: ${text}`);
  }
  await blur(page);
  return rows;
}
