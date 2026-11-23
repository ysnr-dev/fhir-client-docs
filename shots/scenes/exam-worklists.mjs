// 操作マニュアル「生理検査一覧・内視鏡一覧・処置一覧」(docs/manual/exam-worklists.md)
// 医師 四郎が外来の「見本 花子」に心電図を、入院の「見本 太郎」に上部内視鏡(至急)と創処置を出す。
// 生理検査は検査 春子(臨床検査技師)が受け付けて実施し、医師 四郎が所見レポートを書く。内視鏡は医師 四郎が、
// 処置は看護 次郎が、それぞれの一覧で受け付けて実施を記録する。
// 撮影の前後に、撮影日に出した生理検査・内視鏡・処置を、予約・実施記録・レポートごと消す。
import { blur, labeled, logout, openKarte } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const OUTPATIENT = "見本 花子";
const INPATIENT = "見本 太郎";
const ORDER_TYPES = ["physio", "endoscopy", "treatment"];
const FINDINGS = "洞調律、心拍数 72/分。SV1+RV5 = 4.2 mV と高電位。V5・V6 に軽度の ST 低下を認める。";
const JUDGEMENT = "左室肥大(ストレインパターン疑い)。心エコーでの評価を勧める。";
const TREATMENT_COMMENT = "創部の発赤・滲出液なし。洗浄し被覆材を交換";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師がオーダーを出す
  await login("doctor");
  await cleanUp(page);
  await openKarte(page, OUTPATIENT);
  await registerOrder(page, "生理検査", {
    item: "心電図12誘導",
    time: "10:00",
    disease: "高血圧症",
    purpose: "左室肥大の評価",
  });
  await openKarte(page, INPATIENT);
  await registerOrder(page, "内視鏡", { item: "EGD(経口)", urgent: true, disease: "早期胃癌", purposeTemplate: true });
  await registerOrder(page, "処置", { item: "創処置<100", time: "14:00" });
  await logout(page);

  // 生理検査一覧(臨床検査技師)
  await login("labTech");
  await openDepartmentMenu(page, "生理検査部門", "生理検査一覧");
  const physioRow = page.locator("tbody tr").filter({ hasText: OUTPATIENT });
  await physioRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("撮影日の生理検査一覧に撮影用でない行があります");
  const filters = page.locator(".patient-search-form");
  await mark(page.getByText(/^日付未定/).first(), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "検査種別" }).first(), { label: 2, place: "corner" });
  await mark(physioRow.locator("td").nth(-3), { label: 3, place: "corner" });
  await mark(physioRow.locator("td").nth(-2), { label: 4, place: "corner" });
  await mark(physioRow.getByRole("button", { name: "受付" }), { label: 5, place: "corner" });
  await shot("01-physio-list", { target: [page.locator(".page__header"), physioRow], padding: 24 });
  await clearMarks();

  await physioRow.getByRole("button", { name: "受付" }).click();
  await physioRow.getByRole("button", { name: "実施" }).waitFor();
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T10:10:00+09:00`));
  await physioRow.getByRole("button", { name: "実施" }).click();
  const physioPerform = page.locator(".modal").filter({ hasText: "実施入力" });
  const physioSubmit = physioPerform.getByRole("button", { name: "実施登録" });
  await physioSubmit.waitFor();
  await page.waitForLoadState("networkidle");
  await physioSubmit.click();
  await physioPerform.waitFor({ state: "detached" });
  await physioRow.getByRole("button", { name: "所見" }).waitFor();
  await logout(page);

  // 内視鏡一覧(医師)
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T13:00:00+09:00`));
  await login("doctor");
  await openDepartmentMenu(page, "内視鏡部門", "内視鏡一覧");
  const endoRow = page.locator("tbody tr").filter({ hasText: INPATIENT });
  await endoRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("撮影日の内視鏡一覧に撮影用でない行があります");
  await mark(endoRow.locator("td").first(), { label: 1 });
  await mark(endoRow.getByText("至急", { exact: true }), { label: 2, place: "corner" });
  await mark(endoRow.locator("td").nth(-4), { label: 3, place: "corner" });
  await shot("04-endoscopy-list", { target: [page.locator(".page__header"), endoRow], padding: 24 });
  await clearMarks();
  await endoRow.getByRole("button", { name: "受付" }).click();
  await endoRow.getByRole("button", { name: "実施" }).waitFor();
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T13:30:00+09:00`));
  await endoRow.getByRole("button", { name: "実施" }).click();
  const endoPerform = page.locator(".modal").filter({ hasText: "実施入力" }).first();
  await endoPerform.getByRole("button", { name: "実施登録" }).waitFor();
  await page.waitForLoadState("networkidle");

  // 診療行為(手技料)の追加
  await endoPerform.getByRole("button", { name: "診療行為追加" }).click();
  // モーダルはポータルではないので、実施入力の中に重なる。内側(最後)のものを取る。
  const procedures = page.locator(".modal").filter({ hasText: "診療行為(手技料)を検索" }).last();
  // 開いた時点でデータセットを読み終えていないと「全件検索」で開くので、タブを選び直す。
  await procedures.getByText(/^データセット \(\d+\)$/).click();
  const nbi = procedures.getByRole("row").filter({ hasText: "狭帯域光強調加算" });
  await nbi.waitFor();
  await blur(page);
  await mark(procedures.getByText(/^データセット/), { label: 1, place: "corner" });
  await mark(procedures.getByText("全件検索", { exact: true }), { label: 2, place: "corner" });
  await mark(nbi.getByRole("button", { name: "選択" }), { label: 3, place: "corner" });
  await shot("05-procedure-add", { target: procedures, padding: 24 });
  await clearMarks();
  await nbi.getByRole("button", { name: "選択" }).click();
  if (await procedures.isVisible()) await page.keyboard.press("Escape");
  await procedures.waitFor({ state: "detached" });

  await blur(page);
  await endoPerform.getByText("実施入力", { exact: true }).scrollIntoViewIfNeeded();
  await mark(endoPerform.getByRole("row").filter({ hasText: "狭帯域光強調加算" }), { label: 1 });
  await mark(endoPerform.getByRole("row").filter({ hasText: "キシロカイン" }).locator("input").first(), { label: 2, place: "corner" });
  await mark(endoPerform.getByRole("row").filter({ hasText: "キシロカイン" }).locator("select"), { label: 3, place: "corner" });
  await mark(endoPerform.getByRole("button", { name: "薬剤追加" }), { label: 4, place: "corner" });
  await mark(endoPerform.getByRole("button", { name: "器材追加" }), { label: 5, place: "corner" });
  await mark(endoPerform.getByRole("button", { name: "実施登録" }), { label: 6 });
  await shot("06-endoscopy-perform", { target: endoPerform, padding: 24 });
  await clearMarks();
  await endoPerform.getByRole("button", { name: "実施登録" }).click();
  await endoPerform.waitFor({ state: "detached" });
  await endoRow.getByRole("button", { name: "所見" }).waitFor();
  // 所見レポート(医師)。書き終えると依頼医(医師 四郎)に通知のお知らせが出るので、内視鏡の写真のあとに書く。
  await openDepartmentMenu(page, "生理検査部門", "生理検査一覧");
  await physioRow.getByRole("button", { name: "所見" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(physioRow.locator("td").nth(-3), { label: 1, place: "corner" });
  await mark(physioRow.getByRole("button", { name: "所見" }), { label: 2, place: "corner" });
  await shot("02-physio-completed", { target: physioRow });
  await clearMarks();
  await physioRow.getByRole("button", { name: "所見" }).click();
  const report = page.locator(".modal").filter({ hasText: "所見レポート" });
  const submit = report.getByRole("button", { name: "登録", exact: true });
  await submit.waitFor();
  await page.waitForLoadState("networkidle");
  const findings = report.locator(".exam-report-form");
  await labeled(findings, "所見").locator("textarea").fill(FINDINGS);
  await labeled(findings, "判定").locator("textarea").fill(JUDGEMENT);
  await blur(page);
  await findings.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(labeled(findings, "報告区分"), { label: 1, place: "corner" });
  await mark(labeled(findings, "所見").locator("textarea"), { label: 2 });
  await mark(labeled(findings, "判定").locator("textarea"), { label: 3 });
  await mark(labeled(findings, "判定").getByRole("button", { name: "テンプレート" }), { label: 4, place: "corner" });
  await shot("03-physio-report", { target: [findings.locator("fieldset").first()], padding: 40 });
  await clearMarks();
  await submit.click();
  await report.waitFor({ state: "detached" });
  await physioRow.getByRole("button", { name: "所見編集" }).waitFor();

  await logout(page);

  // 処置一覧(看護師)
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T14:05:00+09:00`));
  await login("nurse");
  await openDepartmentMenu(page, "処置", "処置一覧");
  const treatRow = page.locator("tbody tr").filter({ hasText: INPATIENT });
  await treatRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("撮影日の処置一覧に撮影用でない行があります");
  await mark(page.locator(".patient-search-form"), { label: 1 });
  await mark(treatRow.getByRole("button", { name: "受付" }), { label: 2, place: "corner" });
  await shot("07-treatment-list", { target: [page.locator(".page__header"), treatRow], padding: 24 });
  await clearMarks();
  await treatRow.getByRole("button", { name: "受付" }).click();
  await treatRow.getByRole("button", { name: "実施" }).waitFor();
  await treatRow.getByRole("button", { name: "実施" }).click();
  const treatPerform = page.locator(".modal").filter({ hasText: "実施入力" });
  await treatPerform.getByRole("button", { name: "実施登録" }).waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(treatPerform, "実施コメント").locator("textarea").fill(TREATMENT_COMMENT);
  await blur(page);
  await mark(labeled(treatPerform, "実施時刻"), { label: 1, place: "corner" });
  await mark(labeled(treatPerform, "実施コメント").locator("textarea"), { label: 2 });
  await mark(treatPerform.getByRole("button", { name: "実施登録" }), { label: 3 });
  await shot("08-treatment-perform", { target: treatPerform, padding: 24 });
  await clearMarks();
  await treatPerform.getByRole("button", { name: "実施登録" }).click();
  await treatPerform.waitFor({ state: "detached" });
  await treatRow.locator("td").filter({ hasText: "実施済" }).waitFor();
  await logout(page);

  await login("doctor");
  await cleanUp(page);
}

async function cleanUp(page) {
  for (const name of [OUTPATIENT, INPATIENT]) await removeShootingOrders(page, await patientIdByName(page, name), ORDER_TYPES);
}

/**
 * 開いているカルテから、撮影日の生理検査・内視鏡・処置を 1 件登録する。kind は右ペインのボタンの名前。
 * urgent で至急(当日・予約なし)にし、purposeTemplate で内視鏡の検査目的を JED のテンプレートから選ぶ。
 */
async function registerOrder(page, kind, { item, time, urgent, disease, purpose, purposeTemplate }) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: kind, exact: true }).click();
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ index: 1 });
  const escaped = item.replace(/[()<>]/g, "\\$&");
  await form.locator(".order-select__cell label").filter({ hasText: new RegExp(`^${escaped}$`) }).locator("input").check();
  const frame = form.locator(".rad-order-frame").first();
  await frame.waitFor();
  if (urgent) await labeled(frame, "至急区分").locator("select").selectOption({ label: "至急" });
  if (time) await labeled(frame, "実施時刻").locator("input").fill(time);
  if (disease) await frame.locator('input[aria-label="依頼病名"]').fill(disease);
  if (purpose) await labeled(frame, "検査目的").locator("textarea").fill(purpose);
  if (purposeTemplate) {
    await labeled(frame, "検査目的").getByRole("button", { name: "テンプレート" }).click();
    const template = page.locator(".modal").filter({ hasText: "テンプレート記載" }).last();
    const select = labeled(template, "検査目的").locator("select");
    await select.waitFor();
    await select.selectOption({ label: "吐・下血以外の有症状" });
    await labeled(template, "補足").locator("input").fill("ESD 前の範囲診断");
    await template.getByRole("button", { name: "記載反映" }).click();
    await template.waitFor({ state: "detached" });
  }
  await blur(page);
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
