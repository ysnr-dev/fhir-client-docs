// 操作マニュアル「麻酔チャート・術前診察」(docs/manual/anesthesia.md)
// 医師 四郎が「見本 太郎」(早期胃癌)に撮影日 9 時の腹腔鏡下胃切除術を申し込み、麻酔 九郎(麻酔科医)が麻酔科術前診察を書く。
// 看護 次郎が受け付けて入室したあと、麻酔 九郎が麻酔チャートにバイタル・イベント・薬剤を記録して確定する。
// 撮影の前後に、撮影日に申し込んだ手術を術前診察・麻酔チャートごと消す。
import { blur, labeled, logout, menuItem, settle } from "../lib/karte.mjs";
import { openDepartmentMenu } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";
import { SURGERY_CASES, registerSurgery, removeShootingSurgeries } from "../lib/surgery.mjs";

const CASE = SURGERY_CASES.gastric;

// 麻酔チャートのバイタル(時刻, 収縮期, 拡張期, 脈拍, SpO2, EtCO2)。
const VITALS = [
  ["09:10", 142, 84, 78, 98, ""],
  ["09:20", 118, 66, 70, 100, 36],
  ["09:30", 104, 58, 64, 100, 35],
  ["09:40", 110, 62, 66, 100, 35],
  ["09:50", 126, 72, 74, 99, 36],
  ["10:00", 122, 70, 72, 99, 37],
  ["10:10", 118, 68, 70, 99, 36],
  ["10:20", 120, 70, 71, 99, 36],
];
const EVENTS = [
  ["09:15", "麻酔開始"],
  ["09:22", "挿管"],
  ["09:45", "執刀開始"],
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeShootingSurgeries(page);
  await registerSurgery(page, CASE, { date: SHOOTING_DATE, time: "09:00", duration: 300 });
  await logout(page);

  // 麻酔科術前診察の一覧
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T08:30:00+09:00`));
  await login("anesthesiologist");
  await openDepartmentMenu(page, "手術部門", "麻酔科術前診察");
  const rows = page.locator("tbody tr");
  const row = rows.filter({ hasText: CASE.patient });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("麻酔科術前診察の一覧に撮影用でない行があります");
  const filters = page.locator(".patient-search-form");
  await mark(filters.locator("label").filter({ hasText: "手術日" }).first(), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "管理区分" }), { label: 2, place: "corner" });
  await mark(row.locator("td").filter({ hasText: /^未$/ }), { label: 3, place: "corner" });
  await mark(row.getByText("記入", { exact: true }), { label: 4, place: "corner" });
  await shot("01-preop-list", { target: [page.locator(".page__header"), row], padding: 24 });
  await clearMarks();

  // 術前診察を書く(カルテの右ペイン)
  await row.getByText("記入", { exact: true }).click();
  const pane = page.locator(".karte-right");
  const form = pane.locator("form").first();
  await form.locator(".qp-field__label", { hasText: /^ASA-PS$/ }).waitFor();
  await page.waitForLoadState("networkidle");
  const field = (title) => form.locator(".qp-field").filter({ has: page.locator(".qp-field__label", { hasText: new RegExp(`^${title}$`) }) }).first();
  const choose = (title, option) => field(title).locator(".qp-choices__option").filter({ hasText: new RegExp(`^${option}$`) }).locator("input").check();
  const group = (legend) => form.locator("fieldset.qp-group").filter({ has: page.locator("legend", { hasText: new RegExp(`^${legend}$`) }) });
  await labeled(form, "対象プロブレム").locator("select").selectOption({ index: 1 });
  await field("現病歴").locator("textarea, input").fill("健診の上部内視鏡で早期胃癌を指摘。ESD の適応外で手術の方針");
  await field("麻酔歴").locator("textarea, input").fill("なし");
  await choose("悪性高熱症の家族歴", "なし");
  await choose("喫煙", "過去");
  await choose("ASA-PS", "2");
  await choose("緊急\\(E\\)", "なし");
  await choose("NYHA", "I");
  await choose("運動耐容能", "4 METs 以上");
  await field("評価の要点").locator("textarea, input").fill("高血圧(内服で管理良好)。心肺機能に問題なし");
  await choose("Mallampati", "II");
  await choose("開口", "3 横指以上");
  await choose("甲状頤間距離", "3 横指以上");
  await choose("頸部後屈", "制限なし");
  await choose("予測困難気道", "なし");
  await choose("麻酔法", "全身麻酔\\(吸入\\)");
  await choose("麻酔法", "硬膜外麻酔");
  await choose("気道確保", "経口挿管");
  await choose("モニタ", "標準モニタ");
  await choose("術後管理先", "病棟");
  await field("最終摂食").locator("input").fill("前日 21 時");
  await field("最終飲水").locator("input").fill("当日 6 時まで(清澄水)");
  await field("内服の継続・休薬").locator("textarea").fill("降圧薬は当日朝も少量の水で内服");
  await choose("入室方法", "歩行");
  await choose("麻酔の説明", "実施済");
  await blur(page);

  await field("アレルギー").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(field("ASA-PS"), { label: 1 });
  await mark(field("NYHA"), { label: 2 });
  await mark(field("運動耐容能"), { label: 3 });
  await mark(field("評価の要点"), { label: 4 });
  await shot("02-preop-assessment", { target: [field("アレルギー"), field("評価の要点")], padding: 40 });
  await clearMarks();

  const airway = group("気道");
  await airway.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(field("Mallampati"), { label: 1 });
  await mark(field("開口"), { label: 2 });
  await mark(field("予測困難気道"), { label: 3 });
  await shot("03-preop-airway", { target: airway, padding: 40 });
  await clearMarks();

  const room = group("手術室への指示");
  await room.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(field("麻酔法"), { label: 1 });
  await mark(field("気道確保"), { label: 2 });
  await shot("04-preop-room", { target: [room.locator("legend"), field("気道確保")], padding: 40 });
  await clearMarks();

  const submit = form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true });
  await submit.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(field("最終摂食"), { label: 1 });
  await mark(field("最終飲水"), { label: 1 });
  await mark(field("麻酔の説明"), { label: 2 });
  await mark(submit, { label: 3 });
  await shot("05-preop-ward", { target: [field("最終摂食"), submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  await openDepartmentMenu(page, "手術部門", "麻酔科術前診察");
  await row.locator("td").filter({ hasText: /^済$/ }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator("td").filter({ hasText: /^済$/ }), { label: 1, place: "corner" });
  await mark(row.locator("td").filter({ hasText: /^2$/ }).first(), { label: 2, place: "corner" });
  await shot("06-preop-done", { target: row });
  await clearMarks();
  await logout(page);

  // 手術室で受け付けて入室する
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T09:05:00+09:00`));
  await login("nurse");
  await openDepartmentMenu(page, "手術部門", "手術一覧");
  const surgeryRow = page.locator("tbody tr").filter({ hasText: CASE.patient });
  await surgeryRow.getByRole("button", { name: "受付" }).click();
  await surgeryRow.getByRole("button", { name: "入室" }).click();
  await surgeryRow.getByRole("button", { name: "実施" }).waitFor();
  await logout(page);

  // 麻酔チャート
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T09:08:00+09:00`));
  await login("anesthesiologist");
  await openDepartmentMenu(page, "手術部門", "手術一覧");
  await surgeryRow.getByRole("button", { name: "この手術の操作" }).click();
  await menuItem(page, "麻酔チャート").waitFor();
  await mark(menuItem(page, "麻酔チャート"), { label: 1 });
  await shot("07-chart-open", { target: [surgeryRow, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await menuItem(page, "麻酔チャート").click();
  const start = page.getByRole("button", { name: "チャート開始" });
  await start.waitFor();
  await page.waitForLoadState("networkidle");
  await start.click();
  const vitals = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^バイタル$/ }) });
  await vitals.getByRole("button", { name: "追加" }).waitFor();

  for (const [time, systolic, diastolic, pulse, spo2, etco2] of VITALS) {
    await labeled(vitals, "時刻").locator("input").fill(`${SHOOTING_DATE}T${time}`);
    await vitals.getByPlaceholder("収縮").fill(String(systolic));
    await vitals.getByPlaceholder("拡張").fill(String(diastolic));
    await labeled(vitals, "脈拍").locator("input").fill(String(pulse));
    await labeled(vitals, "SpO2").locator("input").fill(String(spo2));
    await labeled(vitals, "EtCO2").locator("input").fill(String(etco2));
    await vitals.getByRole("button", { name: "追加" }).click();
    await vitals.getByRole("columnheader", { name: new RegExp(time) }).first().waitFor();
  }
  const events = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^イベント$/ }) });
  for (const [time, kind] of EVENTS) {
    await labeled(events, "時刻").locator("input").fill(`${SHOOTING_DATE}T${time}`);
    await labeled(events, "種別").locator("select").selectOption({ label: kind });
    await events.getByRole("button", { name: "追加" }).click();
    await events.locator("td, li").filter({ hasText: kind }).first().waitFor();
  }
  const drugs = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^薬剤$/ }) });
  await addDrug(page, drugs, { query: "プロポフォール", code: "620008541", dose: "0.6", route: "静脈内", time: "09:16" });
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T10:25:00+09:00`));
  await page.waitForLoadState("networkidle");

  // チャートの見方
  await page.getByText("標準", { exact: true }).click();
  await blur(page);
  const plot = page.locator("svg").filter({ has: page.locator("text", { hasText: "200" }) }).first();
  await mark(page.getByText(/麻酔担当:/).first(), { label: 1 });
  await mark(page.getByText("横軸", { exact: true }).locator(".."), { label: 2 });
  await mark(plot, { label: 3 });
  await mark(vitals.locator("table"), { label: 4 });
  await shot("08-chart", { target: [page.locator(".page__header, h1").first(), vitals.locator("table")], padding: 24 });
  await clearMarks();

  // 記録の入力
  await vitals.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(labeled(vitals, "時刻"), { label: 1, place: "corner" });
  await mark(vitals.getByRole("button", { name: "現在" }), { label: 2, place: "corner" });
  await mark(vitals.getByPlaceholder("収縮").locator("..").locator(".."), { label: 3, place: "corner" });
  await mark(vitals.getByRole("button", { name: "追加" }), { label: 4, place: "corner" });
  await mark(labeled(events, "種別"), { label: 5, place: "corner" });
  await mark(drugs.getByRole("button", { name: "薬剤追加" }), { label: 6 });
  await shot("09-chart-input", { target: [vitals, drugs], padding: 24 });
  await clearMarks();

  // 確定
  const confirm = page.getByRole("button", { name: "確定", exact: true });
  await mark(page.getByText("印刷", { exact: true }), { label: 1 });
  await mark(confirm, { label: 2, place: "corner" });
  await mark(page.getByRole("button", { name: "チャート取消" }), { label: 3, place: "corner" });
  await shot("10-chart-actions", { target: [drugs, confirm], padding: 24 });
  await clearMarks();

  await logout(page);
  await login("doctor");
  await removeShootingSurgeries(page);
}

/** 麻酔チャートの「薬剤追加」で薬を選び、単回の投与を記録する。 */
async function addDrug(page, drugs, { query, code, dose, route, time }) {
  await drugs.getByRole("button", { name: "薬剤追加" }).click();
  const modal = page.locator(".modal").filter({ hasText: "薬剤を選択" }).last();
  await labeled(modal, "医薬品名").locator("input").fill(query);
  const row = modal.getByRole("row").filter({ hasText: code });
  await row.waitFor();
  await row.locator("td").nth(1).click();
  await modal.waitFor({ state: "detached" });
  const entry = drugs.locator("form, div").filter({ has: page.getByRole("button", { name: "やめる" }) }).last();
  await settle(entry);
  await labeled(entry, "量").locator("input").fill(dose);
  await labeled(entry, "経路").locator("select").selectOption({ label: route });
  await labeled(entry, "時刻").locator("input").fill(`${SHOOTING_DATE}T${time}`);
  await entry.getByRole("button", { name: "追加" }).click();
  await drugs.getByRole("button", { name: "やめる" }).waitFor({ state: "detached" });
}
