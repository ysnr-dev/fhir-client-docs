// 操作マニュアル「注射の実施入力」(docs/manual/nursing-injection.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者。抗菌薬の点滴が 1 日 2 回)の 10 時の点滴を、注射バーコード実施で
// 患者番号と注射ラベルを読んで記録する。ブラウザの時計を 10 時過ぎに進める。
// 撮影の前後に、カルテの注射カードの「実施取消」で撮影日の実施を消す。
import { dayGroup, fhirApi, menuItem, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const MORNING_DOSE = new Date(`${SHOOTING_DATE}T10:05:00+09:00`);
// 抗菌薬(ユナシン-S キット)の医薬品コード。撮影用データの点滴と同じもの。
const ANTIBIOTIC = "620004776";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await page.clock.setSystemTime(MORNING_DOSE);
  await login("nurse");
  const patientId = await nursingPatientId(page);
  const api = await fhirApi(page);
  const patient = await api.read(`Patient/${patientId}`);
  const patientNumber = patient.identifier?.[0]?.value ?? "";
  // 撮影日の注射は抗菌薬の点滴と血糖スケールのインスリンの 2 つ。抗菌薬の点滴を撮る。
  const antibiotic = await api.search("MedicationRequest", { patient: patientId, code: ANTIBIOTIC, _count: "100" });
  const antibioticOrders = new Set(antibiotic.flatMap((mr) => (mr.basedOn ?? []).map((r) => r.reference?.split("/").pop())));
  const order = (await api.search("ServiceRequest", { patient: patientId, _count: "100" })).find(
    (sr) => antibioticOrders.has(sr.id) && sr.occurrenceDateTime?.startsWith(SHOOTING_DATE),
  );
  if (!order) throw new Error("撮影日の注射オーダーがありません。撮影用データを流し直してください");
  const rpBarcode = `INJ-${order.id.replaceAll("-", "").toUpperCase().slice(0, 12)}-1`;

  const card = () => dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: "ユナシン" }).first();
  const cancelPerforms = async () => {
    await openKarte(page, NURSING_PATIENT);
    await page.waitForLoadState("networkidle");
    await card().getByRole("button", { name: /の操作$/ }).click();
    const cancel = menuItem(page, "実施取消");
    if (await cancel.count()) {
      page.once("dialog", (dialog) => dialog.accept());
      await cancel.click();
      await page.waitForLoadState("networkidle");
    } else {
      await page.keyboard.press("Escape");
    }
  };
  await cancelPerforms();

  // 注射バーコード実施を開く
  const menu = page.locator(".app__header .hover-menu").filter({ hasText: "看護業務" });
  await menu.locator(".hover-menu__trigger").hover();
  await menu.locator(".hover-menu__items").getByRole("link", { name: "注射バーコード実施" }).click();
  await page.mouse.move(960, 1000);
  const field = page.getByLabel("バーコードの読み取り");
  await field.waitFor();
  await mark(field, { label: 1, place: "corner" });
  await shot("01-scan", { target: [page.locator(".page__header"), field], padding: 24 });
  await clearMarks();

  // 患者番号を読む
  await field.fill(patientNumber);
  await field.press("Enter");
  const rows = page.locator("table").first();
  await rows.getByText("RP1").first().waitFor();
  await page.waitForLoadState("networkidle");
  await mark(page.getByText(NURSING_PATIENT, { exact: true }).first().locator(".."), { label: 1, place: "corner" });
  await mark(rows, { label: 2, place: "corner" });
  await shot("02-patient", { target: [page.locator(".page__header"), rows], padding: 24 });
  await clearMarks();

  // 注射ラベルを読む
  await field.fill(rpBarcode);
  await field.press("Enter");
  const modal = page.locator(".modal").filter({ hasText: "注射の実施入力" }).last();
  const verified = modal.getByRole("button", { name: "照合完了" });
  await verified.waitFor();
  await mark(modal.locator("table, .injection-verify").first(), { label: 1, place: "corner" });
  await mark(modal.getByRole("button", { name: "スキップ" }), { label: 2, place: "corner" });
  await mark(verified, { label: 3, place: "corner" });
  await shot("03-verify", { target: modal });
  await clearMarks();
  await verified.click();

  // 実施を入れる
  const submit = modal.getByRole("button", { name: "実施登録" });
  await submit.waitFor();
  const label = (text) => modal.locator("label").filter({ hasText: new RegExp(`^${text}`) }).first();
  await mark(modal.getByText(/^照合:/).first(), { label: 1, place: "corner" });
  await mark(label("開始時刻"), { label: 2, place: "corner" });
  await mark(label("実施者"), { label: 3, place: "corner" });
  await mark(modal.getByRole("button", { name: "実施", exact: true }).locator(".."), { label: 4, place: "corner" });
  await mark(modal.locator("table").first(), { label: 5, place: "corner" });
  await mark(submit, { label: 6, place: "corner" });
  await shot("04-perform", { target: modal });
  await clearMarks();
  await submit.click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await rows.getByText("1/2").waitFor();
  await shot("05-done", { target: [page.locator(".page__header"), rows], padding: 24 });

  // カルテの注射カード
  await openKarte(page, NURSING_PATIENT);
  await page.waitForLoadState("networkidle");
  await card().getByRole("button", { name: /の操作$/ }).click();
  const cardMenu = card().locator(".row-menu__items");
  await cardMenu.waitFor();
  await mark(card().getByText("照合済").first(), { label: 1, place: "corner" });
  await mark(menuItem(page, "実施入力"), { label: 2 });
  await mark(menuItem(page, "実施取消"), { label: 3 });
  await shot("06-card", { target: [card(), cardMenu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await cancelPerforms();
}
