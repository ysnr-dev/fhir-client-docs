// 手術部門のシーン(手術一覧・手術カレンダー・麻酔チャート・術前診察)で共通に使う申込の登録と片付け。
// 申込は医師 四郎が執刀医、麻酔 九郎が麻酔科医で出す。医療従事者の選択には開発環境の全員(実在の人名を含む)が
// 並ぶので、名前で絞ってから選ぶ。
import { blur, labeled, openKarte, pickRow } from "./karte.mjs";
import { removeShootingOrders } from "./department.mjs";
import { patientIdByName } from "./lab.mjs";

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
