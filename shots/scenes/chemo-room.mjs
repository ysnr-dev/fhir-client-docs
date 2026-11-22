// 操作マニュアル「外来化学療法室」(docs/manual/chemo-room.md)
// 医師 四郎が「見本 次郎」(結腸癌)に mFOLFOX6 を撮影日から適用し、投与可否を「実施可」にして外来化学療法室の 10 時の枠を
// 予約する。看護 次郎が外来化学療法室の画面で、その日の予約を受けて投与を進める。
// 適用は画面から丸ごと消せないので、撮影の前後にこの患者のオーダーと有害事象を直接消す。
import { blur, dayGroup, labeled, logout, openKarte, patientIdOf, removeOrdersOf } from "../lib/karte.mjs";
import { openDepartmentMenu } from "../lib/lab.mjs";
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
  await page.locator(".karte-right").waitFor();
  await applyRegimenAndBook(page);
  await logout(page);

  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T09:50:00+09:00`));
  await login("nurse");
  await openDepartmentMenu(page, "外来化学療法室", "外来化学療法室");
  const rows = page.locator("tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("撮影日の外来化学療法室に撮影用でない行があります");
  await mark(labeled(page.locator("main"), "予約日"), { label: 1, place: "corner" });
  await mark(row.locator("td").first(), { label: 2, place: "corner" });
  await mark(row.locator("td").nth(4), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(5), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(6), { label: 5, place: "corner" });
  await mark(row.locator("td").nth(7), { label: 6, place: "corner" });
  await mark(row.getByText("カルテで確認"), { label: 7, place: "corner" });
  await shot("01-list", { target: [page.locator("main h1").first(), row], padding: 24 });
  await clearMarks();

  await row.getByText("カルテで確認").click();
  await page.locator(".karte-right").waitFor();
  await page.waitForLoadState("networkidle");
  const day = page.locator(`.chemo-calendar [title^="${SHOOTING_DATE} のオーダーを開く"]`).first();
  await day.waitFor();
  await mark(page.locator(".karte-tabs__list").getByText("診療情報"), { label: 1, place: "corner" });
  await mark(day, { label: 2, place: "corner" });
  await shot("02-karte", { target: page.locator(".karte-left"), padding: 16 });
  await clearMarks();

  await logout(page);
  await login("doctor");
  await openKarte(page, PATIENT);
  await cleanUp();
}

/** レジメンを撮影日から適用し、初日の投与可否を「実施可」にして、外来化学療法室の 10 時の枠を予約する。 */
async function applyRegimenAndBook(page) {
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "化学療法", exact: true }).click();
  const picker = pane.locator(".regimen-picker");
  const item = picker.locator(".regimen-picker__item").filter({ hasText: REGIMEN });
  await item.waitFor();
  await item.click();
  const form = pane.locator(".regimen-apply");
  await form.waitFor();
  await page.waitForLoadState("networkidle");
  const order = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "オーダー" }) });
  await labeled(order, "対象プロブレム").locator("select").selectOption({ label: "#1 結腸癌" });
  await blur(page);
  const submit = form.locator(":scope > .lab-order-item__actions").getByRole("button", { name: "レジメン適用" });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  await form.waitFor({ state: "detached" });
  await dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: REGIMEN }).first().waitFor();

  const group = page.locator(".karte-tabs__group").filter({ hasText: "診療情報" });
  await group.locator(".karte-tabs__tab").hover();
  await page.locator(".karte-tabs__menu").getByText("化学療法", { exact: true }).click();
  const tab = page.locator(".karte-left .karte-tabpanel");
  await tab.locator(`.chemo-calendar [title^="${SHOOTING_DATE} のオーダーを開く"]`).first().click();
  const dayModal = page.locator(".modal").filter({ has: page.locator(".regimen-day") }).first();
  const decision = dayModal.getByRole("group", { name: "投与可否" });
  await decision.waitFor();
  await page.waitForLoadState("networkidle");
  await decision.getByRole("button", { name: "実施可" }).click();
  await decision.getByText("医師 四郎").waitFor();
  const bookingFields = dayModal.getByRole("group", { name: "外来化学療法室" });
  await bookingFields.scrollIntoViewIfNeeded();
  await bookingFields.getByRole("button", { name: "予約", exact: true }).click();
  const bookModal = page.locator(".modal").filter({ hasText: "外来化学療法室の予約" }).last();
  await labeled(bookModal, "予約枠").locator("select").selectOption({ index: 1 });
  const slot = bookModal.getByRole("button", { name: /^10:00-10:15/ });
  await slot.waitFor();
  await slot.click();
  await blur(page);
  await bookModal.getByRole("button", { name: "この枠で予約" }).click();
  await bookingFields.getByText("予約済み").waitFor();
  await page.keyboard.press("Escape");
  await dayModal.waitFor({ state: "detached" });
}
