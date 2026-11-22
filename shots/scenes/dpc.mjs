// 操作マニュアル「DPC」(docs/manual/dpc.md)
// 医師 四郎が、見本 太郎(早期胃癌で入院中)のカルテの右ペインの「DPC」で様式1 の病名を入れて下書き保存し、
// 診断群分類を退院時で決定する。続けて DPC患者一覧を見本病棟・撮影日の月の退院で絞って撮る。
// 診断群分類の在院日数と点数は、入院中なら backend の今日(撮影日ではなく実行した日)で数えるので、撮影の間だけ
// 見本 太郎の入院を撮影日の退院にしておく(終わったら元の入院中に戻す)。撮影の前後に、様式1 と決定を消す。
import { blur, fhirApi, labeled, openKarte, settle } from "../lib/karte.mjs";
import { SHOOTING_WARD } from "../lib/nursing.mjs";
import { patientIdByName } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const DPC_QUESTIONNAIRES = /\/Questionnaire\/dpc-(form1|coding)/;

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const api = await fhirApi(page);
  const patientId = await patientIdByName(page, PATIENT);
  const removeDpcRecords = async () => {
    for (const response of await api.search("QuestionnaireResponse", { patient: patientId, _count: "500" })) {
      if (DPC_QUESTIONNAIRES.test(response.questionnaire ?? "")) await api.remove("QuestionnaireResponse", response.id);
    }
  };
  await removeDpcRecords();
  const admission = (await api.search("Encounter", { patient: patientId, status: "in-progress", _count: "50" })).find(
    (e) => e.class?.code === "IMP",
  );
  if (!admission) throw new Error(`${PATIENT}の入院中の入院がありません`);
  const { meta, ...original } = admission;
  await api.update({ ...original, status: "finished", period: { ...original.period, end: `${SHOOTING_DATE}T10:00:00+09:00` } });
  try {
    await shootDpc(page, { mark, clearMarks, shot });
  } finally {
    await api.update(original);
    await removeDpcRecords();
  }
}

async function shootDpc(page, { mark, clearMarks, shot }) {
  await openKarte(page, PATIENT);
  await page.waitForLoadState("networkidle");
  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "DPC", exact: true }).click();
  const encounterSelect = labeled(right, "対象の入院").locator("select");
  await encounterSelect.waitFor();
  await page.waitForLoadState("networkidle");
  const section = (legend) => right.locator(".dpc-form1__section:visible").filter({ has: page.locator("legend", { hasText: legend }) }).first();

  // 様式1(上の段)
  const attributes = section("患者属性");
  await attributes.waitFor();
  await blur(page);
  await mark(labeled(right, "対象の入院"), { label: 1, place: "corner" });
  await mark(right.getByText("様式1", { exact: true }).first().locator(".."), { label: 2, place: "corner" });
  await mark(right.locator(".dpc-form1 .prescription-detail__common"), { label: 3, place: "corner" });
  await mark(attributes.locator(":visible", { hasText: /^必須$/ }).first(), { label: 4, place: "corner" });
  await shot("01-form1", { target: [right.getByText("DPC登録", { exact: true }), attributes], padding: 24 });
  await clearMarks();

  // 様式1(病名)
  const diagnosis = section("診断情報");
  const main = diagnosis.locator(".dpc-form1__record").first();
  await main.getByRole("button", { name: "登録病名から" }).click();
  const picker = page.locator(".modal").filter({ hasText: "病名を選択" });
  await picker.locator("tbody tr").filter({ hasText: "早期胃癌" }).first().click();
  await picker.waitFor({ state: "detached" });
  await main.getByRole("button", { name: "入院契機・医療資源へ複写" }).click();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await main.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(main.getByRole("button", { name: "登録病名から" }), { label: 1, place: "corner" });
  await mark(main.getByRole("button", { name: "マスタ検索" }), { label: 2, place: "corner" });
  await mark(main.locator(".dpc-form1__row").first(), { label: 3, place: "corner" });
  await mark(main.getByRole("button", { name: "入院契機・医療資源へ複写" }), { label: 4, place: "corner" });
  await shot("02-diagnosis", { target: main, padding: 24 });
  await clearMarks();

  // 様式1(保存)
  const submit = right.locator(".dpc-form1 .prescription-form__submit");
  await submit.scrollIntoViewIfNeeded();
  await mark(right.locator(".dpc-form1__add"), { label: 1, place: "corner" });
  await mark(submit.getByRole("button", { name: "集め直す" }), { label: 2, place: "corner" });
  await mark(submit.getByRole("button", { name: "下書き保存" }), { label: 3, place: "corner" });
  await mark(submit.getByRole("button", { name: "確定" }), { label: 4, place: "corner" });
  await shot("03-submit", { target: [right.locator(".dpc-form1__add"), submit], padding: 24 });
  await clearMarks();
  await submit.getByRole("button", { name: "下書き保存" }).click();
  await encounterSelect.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await right.getByRole("button", { name: "DPC", exact: true }).click();
  await encounterSelect.waitFor();

  // 診断群分類
  await right.getByText("診断群分類", { exact: true }).first().click();
  const coding = right.locator(".dpc-coding");
  const result = coding.locator(".dpc-coding__result");
  await result.waitFor();
  await page.waitForLoadState("networkidle");
  const branches = coding.locator(".dpc-coding__branches");
  await coding.scrollIntoViewIfNeeded();
  await mark(coding.locator(".prescription-detail__common").first(), { label: 1, place: "corner" });
  await mark(result.locator(".dpc-coding__code").first(), { label: 2, place: "corner" });
  await mark(result.locator("table").first(), { label: 3, place: "corner" });
  await mark(branches.locator("tbody tr").first().locator("select"), { label: 4, place: "corner" });
  await mark(branches.locator("tbody tr").first().locator("td").nth(3), { label: 5, place: "corner" });
  await shot("04-coding", { target: [coding.locator(".prescription-detail__common").first(), branches], padding: 24 });
  await clearMarks();

  const decide = coding.locator(".dpc-coding__decide");
  await labeled(decide, "時点").locator("select").selectOption({ label: "退院時" });
  await decide.getByRole("button", { name: "決定" }).click();
  const history = coding.locator("section").filter({ has: page.locator("h4", { hasText: "DPC歴" }) });
  await history.locator("tbody tr").first().waitFor();
  await page.waitForLoadState("networkidle");
  await settle(history);
  await history.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(labeled(decide, "時点"), { label: 1, place: "corner" });
  await mark(labeled(decide, "コメント"), { label: 2, place: "corner" });
  await mark(decide.getByRole("button", { name: "決定" }), { label: 3, place: "corner" });
  await mark(history.locator("tbody tr").first(), { label: 4, place: "corner" });
  await shot("05-decide", { target: [decide, history], padding: 24 });
  await clearMarks();

  // DPC患者
  await page.goto("/dpc-patients");
  const form = page.locator(".master-search__form");
  await labeled(form, "対象").locator("select").selectOption({ label: "退院月" });
  await form.locator(".dpc-form1-export__month input").fill(SHOOTING_DATE.slice(0, 7));
  const ward = labeled(form, "病棟").locator("select");
  await ward.locator("option", { hasText: SHOOTING_WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: SHOOTING_WARD });
  const rows = page.locator("table.dpc-patients tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("DPC患者一覧に撮影用でない行があります");
  await blur(page);
  await mark(labeled(form, "対象"), { label: 1, place: "corner" });
  await mark(labeled(form, "病棟"), { label: 2, place: "corner" });
  await mark(form.locator(".dpc-patients__check").first(), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(7), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(8), { label: 5, place: "corner" });
  await mark(row.getByRole("link", { name: "DPC" }).or(row.getByRole("button", { name: "DPC" })), { label: 6, place: "corner" });
  await mark(page.getByRole("button", { name: "CSV" }), { label: 7, place: "corner" });
  await shot("06-patients", { target: [page.locator(".page__header"), form, page.locator("table.dpc-patients")], padding: 24 });
  await clearMarks();
}
