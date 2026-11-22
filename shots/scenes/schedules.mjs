// 操作マニュアル「予約枠」(docs/manual/schedules.md)
// 医師 四郎の枠表「内科 午後」(月・水・金の 14〜16 時、20 分枠)を新規登録し、撮影日から 4 週の枠を一括生成して、
// 予約枠カレンダーで枠を選んで停止する。撮影の前後に、この枠表と枠を直接消す。
// 一覧は担当医を医師 四郎に絞って撮る(開発環境にはほかの医師の枠表がある)。
import { addDays, blur, fhirApi, labeled } from "../lib/karte.mjs";
import { DOCTOR } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const NAME = "内科 午後";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeSchedule(page);

  // 枠表の一覧
  await page.goto("/schedules");
  const filters = page.locator(".patient-search-form");
  const doctor = labeled(filters, "担当医").locator("select");
  await doctor.locator("option", { hasText: DOCTOR }).waitFor({ state: "attached" });
  await doctor.selectOption({ label: DOCTOR });
  await filters.getByRole("button", { name: "検索", exact: true }).click();
  const table = page.locator("main table").first();
  const row = (name) => table.locator("tbody tr").filter({ hasText: name });
  await row("内科 午前").waitFor();
  await page.waitForLoadState("networkidle");
  if ((await table.locator("tbody tr").count()) !== 1) throw new Error("医師 四郎の枠表が「内科 午前」だけではありません");
  await mark(labeled(filters, "担当医"), { label: 1, place: "corner" });
  await mark(row("内科 午前").getByRole("link", { name: "予約枠カレンダー" }).or(row("内科 午前").getByRole("button", { name: "予約枠カレンダー" })).first(), { label: 2, place: "corner" });
  await mark(page.getByRole("link", { name: "新規登録" }).or(page.getByRole("button", { name: "新規登録" })).first(), { label: 3, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), filters, table], padding: 24 });
  await clearMarks();

  // 新規登録
  await page.getByRole("link", { name: "新規登録" }).or(page.getByRole("button", { name: "新規登録" })).first().click();
  const form = page.locator("main form").first();
  await labeled(form, "枠の名称").locator("input").fill(NAME);
  await labeled(form, "種別").locator("select").selectOption({ label: "診察予約" });
  const formDoctor = labeled(form, "担当医").locator("select");
  await formDoctor.locator("option", { hasText: DOCTOR }).waitFor({ state: "attached" });
  await formDoctor.selectOption({ label: DOCTOR });
  await labeled(form, "診療科").locator("select").selectOption({ label: "内科" });
  const pattern = form.locator(".slot-pattern");
  for (const [index, day] of ["日", "月", "火", "水", "木", "金", "土"].entries()) {
    await pattern.locator(".slot-pattern__weekday", { hasText: day }).locator("input").setChecked([1, 3, 5].includes(index));
  }
  const blocks = pattern.locator(".slot-pattern__block");
  while ((await blocks.count()) > 1) await blocks.last().getByRole("button", { name: "この時間帯を削除" }).click();
  const times = blocks.first().locator("input[type=time]");
  await times.nth(0).fill("14:00");
  await times.nth(1).fill("16:00");
  await labeled(pattern, "1 枠の長さ").locator("input").fill("20");
  await labeled(pattern, "同時に受ける人数").locator("input").fill("1");
  await blur(page);
  const submit = form.getByRole("button", { name: "登録", exact: true });
  const active = form.locator("label").filter({ hasText: "有効(active)" });
  await labeled(form, "枠の名称").scrollIntoViewIfNeeded();
  await mark(labeled(form, "枠の名称"), { label: 1, place: "corner" });
  await mark(labeled(form, "種別"), { label: 2, place: "corner" });
  await mark(labeled(form, "担当医"), { label: 3, place: "corner" });
  await mark(labeled(form, "有効期間(開始)").locator(".."), { label: 4, place: "corner" });
  await shot("02-form", { target: [labeled(form, "枠の名称"), active] });
  await clearMarks();
  await submit.scrollIntoViewIfNeeded();
  await mark(form.locator(".slot-pattern__weekdays"), { label: 1, place: "corner" });
  await mark(form.locator(".slot-pattern__blocks"), { label: 2, place: "corner" });
  await mark(form.locator(".slot-pattern__row"), { label: 3, place: "corner" });
  await mark(submit, { label: 4, place: "corner" });
  await shot("03-pattern", { target: [form.locator(".schedule-form__pattern"), submit] });
  await clearMarks();
  await submit.click();

  // 枠一括生成
  await page.waitForURL(/\/schedules\/[^/]+\/slots/);
  await page.getByRole("button", { name: "枠一括生成" }).click();
  const modal = page.locator(".modal").filter({ hasText: "枠を一括生成" });
  await labeled(modal, "生成する期間(開始)").locator("input").fill(SHOOTING_DATE);
  await labeled(modal, "生成する期間(終了)").locator("input").fill(addDays(SHOOTING_DATE, 27));
  await blur(page);
  await modal.locator(".slot-generate__preview", { hasText: "新しく作る枠" }).waitFor();
  await mark(modal.locator(".slot-generate__range"), { label: 1, place: "corner" });
  await mark(modal.locator(".slot-pattern"), { label: 2, place: "corner" });
  await mark(modal.locator(".slot-generate__skip-holidays"), { label: 3, place: "corner" });
  await mark(modal.locator(".slot-generate__preview"), { label: 4, place: "corner" });
  await mark(modal.getByRole("button", { name: "生成", exact: true }), { label: 5, place: "corner" });
  await shot("04-generate", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "生成", exact: true }).click();
  await modal.waitFor({ state: "detached" });

  // 予約枠カレンダー
  const calendar = page.locator(".slot-calendar");
  const slot = calendar.locator(".slot-calendar__slot--free").first();
  await slot.waitFor();
  await page.waitForLoadState("networkidle");
  const wednesday = calendar.locator("tbody tr").filter({ hasText: "15:00" }).locator(".slot-calendar__slot").nth(1);
  await wednesday.click();
  await mark(page.locator(".slot-calendar__week"), { label: 1, place: "corner" });
  await mark(page.locator(".slot-calendar__counts"), { label: 2, place: "corner" });
  await mark(wednesday, { label: 3, place: "corner" });
  await mark(page.locator(".slot-calendar__actions"), { label: 4, place: "corner" });
  await mark(page.locator(".page__header-actions"), { label: 5, place: "corner" });
  await shot("05-calendar", { target: [page.locator(".page__header"), calendar], padding: 24 });
  await clearMarks();

  await removeSchedule(page);
}

/** 撮影の医師の枠表「内科 午後」と、その枠を消す。 */
async function removeSchedule(page) {
  const api = await fhirApi(page);
  const schedules = await api.search("Schedule", { _count: "500" });
  const targets = schedules.filter(
    (s) => s.serviceType?.[0]?.text === NAME && s.actor?.some((a) => a.display === DOCTOR),
  );
  for (const schedule of targets) {
    for (let slots = await api.search("Slot", { schedule: `Schedule/${schedule.id}`, _count: "500" }); slots.length; ) {
      for (const slot of slots) await api.remove("Slot", slot.id);
      slots = await api.search("Slot", { schedule: `Schedule/${schedule.id}`, _count: "500" });
    }
    await api.remove("Schedule", schedule.id);
  }
}
