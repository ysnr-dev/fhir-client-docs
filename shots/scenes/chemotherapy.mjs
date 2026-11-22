// 操作マニュアル「化学療法」(docs/manual/chemotherapy.md)
// 患者「見本 次郎」(撮影用の架空の患者。結腸癌、撮影日の 2 日前に体格と投与前の検査値)に、
// 承認済のレジメン mFOLFOX6 を撮影日から適用して撮る。
// 適用は画面から丸ごと消せないので、撮影の前後にこの患者のオーダーと有害事象を直接消す。
import { blur, dayGroup, labeled, openKarte, patientIdOf, removeOrdersOf } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 次郎";
const REGIMEN = "mFOLFOX6";

const isAdverseEvent = (observation) =>
  observation.category?.some((c) => c.coding?.some((coding) => coding.code === "adverse-event")) ?? false;

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const patientId = patientIdOf(page);
  const cleanUp = () => removeOrdersOf(page, patientId, [["Observation", isAdverseEvent]]);
  await cleanUp();
  await page.reload();
  const pane = page.locator(".karte-right");
  await pane.waitFor();

  // 化学療法を開く
  const paneButton = pane.getByRole("button", { name: "化学療法", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // レジメンを選ぶ
  const picker = pane.locator(".regimen-picker");
  const item = picker.locator(".regimen-picker__item").filter({ hasText: REGIMEN });
  await item.waitFor();
  await mark(picker.locator(".regimen-picker__search"), { label: 1 });
  await mark(item, { label: 2 });
  await shot("02-picker", { target: picker, padding: 40 });
  await clearMarks();
  await item.click();

  // 投与前チェックと累積投与量
  const form = pane.locator(".regimen-apply");
  await form.waitFor();
  await page.waitForLoadState("networkidle");
  const folds = form.locator(":scope > .regimen-apply__fold");
  await folds.first().locator("summary").click();
  await mark(folds.nth(0), { label: 1 });
  await mark(folds.nth(1), { label: 2 });
  await shot("03-checks", { target: [folds.nth(0), folds.nth(1)], padding: 40 });
  await clearMarks();
  await folds.first().locator("summary").click();

  // スケジュールとオーダー
  const schedule = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "スケジュール" }) });
  const order = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "オーダー" }) });
  await labeled(order, "対象プロブレム").locator("select").selectOption({ label: "#1 結腸癌" });
  await blur(page);
  await mark(labeled(schedule, "開始日"), { label: 1, place: "corner" });
  await mark(labeled(schedule, "登録するクール数"), { label: 2, place: "corner" });
  await mark(labeled(schedule, "予定クール数"), { label: 3, place: "corner" });
  await mark(labeled(order, "入外区分"), { label: 4, place: "corner" });
  await mark(labeled(order, "注射区分"), { label: 5, place: "corner" });
  await mark(labeled(order, "対象プロブレム"), { label: 6, place: "corner" });
  await shot("04-schedule", { target: [schedule, order], padding: 40 });
  await clearMarks();

  // 体格
  const body = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "体格" }) });
  await mark(labeled(body, "身長"), { label: 1, place: "corner" });
  await mark(labeled(body, "体重"), { label: 2, place: "corner" });
  await mark(body.locator(".regimen-editor__derived").filter({ hasText: "体表面積" }), { label: 3, place: "corner" });
  await mark(body.locator(".regimen-editor__derived").filter({ hasText: "直近の測定" }), { label: 4, place: "corner" });
  await shot("05-body", { target: body, padding: 40 });
  await clearMarks();

  // 投与内容: 前投薬とオキサリプラチンのステップ
  const doses = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "投与内容" }) });
  const steps = doses.locator("tbody");
  const anticancer = steps.nth(1).locator("tr").filter({ has: page.locator(".regimen-apply__role--anticancer") }).first();
  await steps.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(steps.nth(1).locator(".regimen-apply__step-head"), { label: 1 });
  await mark(anticancer.locator("td").nth(2), { label: 2, place: "corner" });
  await mark(anticancer.locator(".regimen-apply__ratio"), { label: 3, place: "corner" });
  await mark(anticancer.locator(".regimen-apply__dose"), { label: 4, place: "corner" });
  await mark(anticancer.locator(".regimen-apply__packs-hint").first(), { label: 5, place: "corner" });
  await shot("06-doses", { target: [doses.locator("thead"), steps.nth(1)], padding: 40 });
  await clearMarks();

  // 適用
  const actions = form.locator(":scope > .lab-order-item__actions");
  const submit = actions.getByRole("button", { name: "レジメン適用" });
  await submit.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await shot("07-submit", { target: [steps.last(), actions], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: REGIMEN }).first();
  await card.waitFor();
  await shot("08-card", { target: card });

  // 化学療法タブを開く
  const group = page.locator(".karte-tabs__group").filter({ hasText: "診療情報" });
  await group.locator(".karte-tabs__tab").hover();
  const tabMenu = page.locator(".karte-tabs__menu");
  const chemoTab = tabMenu.getByText("化学療法", { exact: true });
  await mark(chemoTab, { label: 1 });
  await shot("09-tab", { target: [page.locator(".karte-tabs__list"), tabMenu], padding: 24 });
  await clearMarks();
  await chemoTab.click();

  // 投与日を開く: 投与可否
  const tab = page.locator(".karte-left .karte-tabpanel");
  const firstDay = tab.locator(`.chemo-calendar [title^="${SHOOTING_DATE} のオーダーを開く"]`).first();
  await firstDay.click();
  const dayModal = page.locator(".modal").filter({ has: page.locator(".regimen-day") }).first();
  const decision = dayModal.getByRole("group", { name: "投与可否" });
  await decision.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(decision.locator(".regimen-decision__status"), { label: 1 });
  await mark(decision.locator(".regimen-apply__fold"), { label: 2 });
  await mark(labeled(decision, "コメント"), { label: 3 });
  await mark(decision.getByRole("button", { name: "実施可" }), { label: 4 });
  await shot("10-decision", { target: [dayModal.locator(".regimen-day__title"), decision], padding: 32 });
  await clearMarks();
  await decision.getByRole("button", { name: "実施可" }).click();
  await decision.getByText("医師 四郎").waitFor();
  await mark(decision.locator(".regimen-decision__status"), { label: 1 });
  await mark(decision.getByRole("button", { name: "取消" }), { label: 2, place: "corner" });
  await shot("11-decision-done", { target: decision, padding: 32 });
  await clearMarks();

  // 外来化学療法室の予約
  const bookingFields = dayModal.getByRole("group", { name: "外来化学療法室" });
  await bookingFields.scrollIntoViewIfNeeded();
  await bookingFields.getByRole("button", { name: "予約", exact: true }).click();
  const bookModal = page.locator(".modal").filter({ hasText: "外来化学療法室の予約" }).last();
  await labeled(bookModal, "予約枠").locator("select").selectOption({ index: 1 });
  const slot = bookModal.getByRole("button", { name: /^10:00-10:15/ });
  await slot.waitFor();
  await slot.click();
  await blur(page);
  await mark(labeled(bookModal, "予約枠"), { label: 1 });
  await mark(bookModal.locator("button:not([disabled])", { hasText: "空き" }).first(), { label: 2, place: "corner" });
  await mark(slot, { label: 3, place: "corner" });
  await mark(bookModal.getByRole("button", { name: "この枠で予約" }), { label: 4 });
  await shot("12-book", { target: bookModal });
  await clearMarks();
  await bookModal.getByRole("button", { name: "この枠で予約" }).click();
  await bookingFields.getByText("予約済み").waitFor();

  // 移動・中止
  const scope = dayModal.locator(".injection-scope");
  const move = dayModal.getByRole("group", { name: "移動" });
  const stop = dayModal.locator(":scope .lab-order-item__actions").last();
  await stop.scrollIntoViewIfNeeded();
  await mark(bookingFields, { label: 1 });
  await mark(scope, { label: 2 });
  await mark(move, { label: 3 });
  await mark(labeled(dayModal, "中止理由"), { label: 4 });
  await mark(stop, { label: 5 });
  await shot("13-day-actions", { target: [bookingFields, stop], padding: 32 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await dayModal.waitFor({ state: "detached" });

  // カレンダー
  await page.waitForLoadState("networkidle");
  const calendar = tab.locator(".chemo-calendar");
  await mark(tab.locator(".chemo-calendar__regimens"), { label: 1 });
  await mark(tab.locator(".meal-calendar__toolbar"), { label: 2 });
  await mark(firstDay, { label: 3, place: "corner" });
  await mark(tab.locator(".chemo-calendar__add-cycle"), { label: 4 });
  await shot("14-calendar", { target: [tab.locator(".chemo-views"), calendar], padding: 40 });
  await clearMarks();

  // レジメン詳細
  await tab.getByRole("tab", { name: "レジメン詳細" }).click();
  const detailRow = tab.locator("tbody tr").filter({ hasText: "第 1 クール" });
  await detailRow.waitFor();
  const detailActions = tab.locator(".lab-order-item__actions").last();
  await mark(detailRow.locator(".regimen-detail__days"), { label: 1 });
  await mark(detailRow.getByRole("button", { name: "記録" }), { label: 2 });
  await mark(detailRow.getByRole("button", { name: "計画書" }), { label: 3, place: "corner" });
  await mark(detailRow.getByRole("button", { name: "取消" }), { label: 4, place: "corner" });
  await mark(detailActions, { label: 5 });
  await shot("15-detail", { target: [tab.locator(".chemo-views"), detailActions], padding: 40 });
  await clearMarks();

  // 有害事象の記録
  await detailRow.getByRole("button", { name: "記録" }).click();
  const adverseModal = page.locator(".modal").filter({ hasText: "有害事象を追加" }).last();
  await adverseModal.waitFor();
  await labeled(adverseModal, "用語(CTCAE)").locator("input").fill("末梢性感覚ニューロパチー");
  await labeled(adverseModal, "Grade").locator("select").selectOption("1");
  await blur(page);
  await mark(labeled(adverseModal, "用語(CTCAE)").locator("input"), { label: 1 });
  await mark(adverseModal.getByRole("button", { name: "CTCAE から選択" }), { label: 2, place: "corner" });
  await mark(labeled(adverseModal, "Grade"), { label: 3, place: "corner" });
  await mark(labeled(adverseModal, "発現日"), { label: 4, place: "corner" });
  await mark(labeled(adverseModal, "回復日"), { label: 5, place: "corner" });
  await mark(labeled(adverseModal, "対処・経過"), { label: 6, place: "corner" });
  await mark(adverseModal.getByRole("button", { name: "追加", exact: true }), { label: 7 });
  await shot("16-adverse", { target: adverseModal });
  await clearMarks();
  await page.keyboard.press("Escape");
  await adverseModal.waitFor({ state: "detached" });

  // 次のクール
  await detailActions.getByRole("button", { name: /^第 2 クール登録$/ }).click();
  const cycleModal = page.locator(".modal").filter({ hasText: "化学療法(クール登録)" }).last();
  const cycleForm = cycleModal.locator(".regimen-apply");
  await cycleForm.waitFor();
  await page.waitForLoadState("networkidle");
  const cycleSchedule = cycleForm.locator("fieldset").filter({ has: page.locator("legend", { hasText: "スケジュール" }) });
  const carry = cycleForm.locator(".regimen-apply__carry");
  await mark(labeled(cycleSchedule, "開始日"), { label: 1, place: "corner" });
  await carry.scrollIntoViewIfNeeded();
  await mark(carry, { label: 2 });
  await shot("17-next-cycle", { target: [cycleSchedule, carry], padding: 40 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await cycleModal.waitFor({ state: "detached" });

  await cleanUp();
}
