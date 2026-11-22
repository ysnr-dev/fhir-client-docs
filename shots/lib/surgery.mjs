// 手術部門のシーン(手術一覧・手術カレンダー・麻酔チャート・術前診察)と、手術を前提にするシーン(NCD 症例登録・感染サーベイランス)で
// 共通に使う申込の登録・実施入力と片付け。
// 申込は医師 四郎が執刀医、麻酔 九郎が麻酔科医で出す。医療従事者の選択には開発環境の全員(実在の人名を含む)が
// 並ぶので、名前で絞ってから選ぶ。
import { blur, labeled, openKarte, pickRow } from "./karte.mjs";
import { removeShootingOrders } from "./department.mjs";
import { openDepartmentMenu, patientIdByName } from "./lab.mjs";
import { SHOOTING_DATE } from "./session.mjs";

export const SURGERY_ROOM = "手術室1";

/** 手術の患者(見本 太郎は早期胃癌、見本 次郎は結腸癌)と、申し込む術式。 */
export const SURGERY_CASES = {
  gastric: {
    patient: "見本 太郎",
    query: "腹腔鏡下胃切除",
    code: "150323510",
    diagnosis: "早期胃癌",
  },
  colon: {
    patient: "見本 次郎",
    query: "腹腔鏡下結腸切除",
    code: "150277810",
    diagnosis: "結腸癌",
  },
};

/** 撮影日に申し込んだ手術を、進捗・術前診察・麻酔チャート・実施記録ごと消す。 */
export async function removeShootingSurgeries(page) {
  for (const { patient } of Object.values(SURGERY_CASES)) {
    await removeShootingOrders(page, await patientIdByName(page, patient), ["surgery"]);
  }
}

/**
 * 患者のカルテを開いて手術を申し込む(医師でログインしておく)。date を省くと日程未定で申し込む。
 * 入室予定時刻・所要時間・手術室は date があるときだけ入れる。
 */
export async function registerSurgery(page, surgery, { date, time = "09:00", duration, room = SURGERY_ROOM } = {}) {
  await openKarte(page, surgery.patient);
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "手術", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const common = fieldset("手術共通");
  const schedule = fieldset("日程・手術室");
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ index: 1 });
  await labeled(common, "執刀科").locator("select").selectOption({ label: "外科" });
  if (date) {
    await labeled(schedule, "予定手術日").locator("input").fill(date);
    await labeled(schedule, "入室予定時刻").locator("input").fill(time);
    if (duration) await labeled(schedule, "予定所要時間").locator("input").fill(String(duration));
    await labeled(schedule, "手術室").locator("select").selectOption({ label: room });
  }

  const procedures = form.locator("section.order-select__preview").filter({ has: page.getByRole("button", { name: "+ 術式追加" }) });
  await procedures.getByRole("button", { name: "+ 術式追加" }).click();
  const modal = page.locator(".modal").filter({ hasText: "術式を選択" });
  await labeled(modal, "名称・略称・カナ").locator("input").fill(surgery.query);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  const row = modal.getByRole("row").filter({ hasText: surgery.code });
  await row.waitFor();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });
  await procedures.locator(".rad-gp").first().locator('input[aria-label="術前診断"]').fill(surgery.diagnosis);

  const staff = fieldset("スタッフ");
  for (const [button, name] of [
    ["+ 執刀医", "医師 四郎"],
    ["+ 麻酔科医", "麻酔 九郎"],
  ]) {
    await staff.getByRole("button", { name: button }).click();
    const picker = page.locator(".modal").filter({ hasText: "医療従事者を選択" });
    await labeled(picker, "氏名").locator("input").fill(name);
    await picker.getByRole("button", { name: "検索", exact: true }).click();
    const staffRow = picker.getByRole("row").filter({ hasText: name });
    await staffRow.waitFor();
    await pickRow(staffRow);
    await picker.waitFor({ state: "detached" });
  }
  const anesthesia = fieldset("麻酔");
  await labeled(anesthesia, "管理区分").locator("select").selectOption({ label: "麻酔科管理" });
  await fieldset("同意書").locator("label").filter({ hasText: /^手術同意書$/ }).locator("input").check();
  await blur(page);
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  // 同じ手術室・時間に重なる手術があると確認が出る。撮影日の前後は開発データが無いので出ない想定。
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}

/**
 * 撮影日に申し込んだ手術(registerSurgery で日付を入れて申し込んだもの)を、手術一覧で受付・入室し、実施入力まで済ませる。
 * 手術を前提にする画面(NCD症例登録・感染サーベイランス)の準備に使う。実施入力の時刻は 9 時入室・13 時 55 分退室。
 */
export async function performSurgery(page, surgery) {
  await openDepartmentMenu(page, "手術部門", "手術一覧");
  const row = page.locator("tbody tr").filter({ hasText: surgery.patient });
  await row.getByRole("button", { name: "受付" }).click();
  await row.getByRole("button", { name: "入室" }).click();
  await row.getByRole("button", { name: "実施" }).click();
  const perform = page.locator(".modal").filter({ hasText: "実施入力" }).first();
  const submit = perform.getByRole("button", { name: "実施登録" });
  await submit.waitFor();
  await page.waitForLoadState("networkidle");
  const times = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "時刻" }) });
  for (const [label, time] of [
    ["入室", "09:05"],
    ["麻酔開始", "09:15"],
    ["執刀開始", "09:45"],
    ["執刀終了", "13:20"],
    ["麻酔終了", "13:40"],
    ["退室", "13:55"],
  ]) {
    await labeled(times, label).locator("input").fill(`${SHOOTING_DATE}T${time}`);
  }
  const measures = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "測定値" }) });
  await labeled(measures, "出血量").locator("input").fill("80");
  const record = perform.locator("fieldset").filter({ has: page.locator("legend", { hasText: "記録" }) });
  await labeled(record, "創分類").locator("select").selectOption({ label: "準清潔" });
  await labeled(record, "ガーゼ・器械カウント").locator("select").selectOption({ label: "合致" });
  await labeled(record, "転帰").locator("select").selectOption({ label: "良好" });
  await submit.click();
  await perform.waitFor({ state: "detached" });
  await row.getByText("実施済", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
}
