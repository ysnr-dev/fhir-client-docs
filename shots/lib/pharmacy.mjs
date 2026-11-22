// 薬剤部のシーンで共通に使う画面操作と片付け。
// 薬剤部の写真は、医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者。見本病棟)に処方・注射を出し、
// 薬剤 三郎が部門の画面で受ける 2 段で撮る。見本 太郎は撮影用データでオーダーを持たないので、片付けは
// 見本 太郎のオーダーと、調剤・払出・投与の記録をまとめて消す。
import { blur, fhirApi, labeled, openKarte, patientIdOf, pickRow, removeOrdersOf } from "./karte.mjs";

export const PHARMACY_PATIENT = "見本 太郎";
const SEARCH_PLACEHOLDER = "部分一致で検索(かな・全半角の違いは無視)";

/** ヘッダーの「部門業務」>「薬剤部門」から画面を開く。 */
export async function openPharmacyMenu(page, item) {
  const menu = page.locator(".app__header .hover-menu").filter({ hasText: "部門業務" });
  await menu.locator(".hover-menu__trigger").hover();
  await menu.locator(".sub-menu").filter({ hasText: "薬剤部門" }).hover();
  await menu.locator(".sub-menu__items").getByRole("link", { name: item, exact: true }).click();
  await page.mouse.move(960, 1000);
  await page.waitForLoadState("networkidle");
}

/**
 * 一覧の行がすべて撮影用の患者(氏名が「見本」)か確かめる。日付を問わず並ぶ一覧(未監査など)に開発データが
 * 残っていると、実在の人名を含む行が写るので、撮らずに止める。
 */
export async function assertOnlyShootingPatients(rows) {
  for (const text of await rows.allInnerTexts()) {
    if (!text.includes("見本 ")) throw new Error(`撮影用でない患者の行があります。開発データを片付けてください: ${text}`);
  }
}

/** 見本 太郎のカルテを開き、撮影の前の片付けをする(医師でログインしておく)。 */
export async function openPharmacyKarte(page) {
  await openKarte(page, PHARMACY_PATIENT);
  await removePharmacyRecords(page, patientIdOf(page));
  await page.reload();
  await page.locator(".karte-right").waitFor();
  await page.waitForLoadState("networkidle");
}

/** 見本 太郎の ID(カルテを開かずに片付けるとき)。 */
export async function pharmacyPatientId(page) {
  const api = await fhirApi(page);
  const [family, given] = PHARMACY_PATIENT.split(" ");
  const patients = await api.search("Patient", { family, given });
  if (patients.length !== 1) throw new Error(`患者「${PHARMACY_PATIENT}」が 1 人に絞れません`);
  return patients[0].id;
}

/** 見本 太郎のオーダー(進捗・監査・照会・鑑別依頼の Task を含む)と、調剤・払出・投与の記録、持参薬を消す。 */
export async function removePharmacyRecords(page, patientId) {
  await removeOrdersOf(page, patientId, [
    ["MedicationAdministration", () => true],
    ["MedicationDispense", () => true],
    // オーダーに基づく実施の記録(服薬指導の指導など)。
    ["Procedure", (procedure) => Boolean(procedure.basedOn?.length)],
  ]);
  const api = await fhirApi(page);
  for (const statement of await api.search("MedicationStatement", { patient: patientId, _count: "500" })) {
    await api.remove("MedicationStatement", statement.id);
  }
}

/** 医薬品の検索モーダルで 1 行選ぶ。 */
async function pickMedicine(page, query, rowText) {
  const modal = page.locator(".modal");
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).first().fill(query);
  const row = modal.getByRole("row").filter({ hasText: rowText }).first();
  await row.waitFor();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });
}

/**
 * 開いているカルテから処方を 1 件登録する。rps は RP ごとの { medicines: [{ query, row, dose }], usage, usageRow, days }。
 * 用法は検索の語(usage)と、行を決める文字列か正規表現(usageRow)で選ぶ。
 */
export async function registerPrescription(page, rps) {
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "処方", exact: true }).click();
  const form = page.locator(".prescription-form");
  await form.waitFor();
  for (const [index, rp] of rps.entries()) {
    if (index > 0) await form.getByRole("button", { name: "+ RP追加" }).click();
    const card = form.locator("fieldset.rp-card").nth(index);
    for (const [i, medicine] of rp.medicines.entries()) {
      await card.getByRole("button", { name: i === 0 ? "医薬品を選択" : "+ 医薬品追加" }).click();
      await pickMedicine(page, medicine.query, medicine.row);
      await card.locator(".rp-card__dose-input").nth(i).fill(String(medicine.dose));
    }
    await card.getByRole("button", { name: "用法を選択" }).click();
    const modal = page.locator(".modal");
    await modal.getByPlaceholder(SEARCH_PLACEHOLDER).fill(rp.usage);
    const usageRow = modal.getByRole("row").filter({ hasText: rp.usageRow }).first();
    await usageRow.waitFor();
    await pickRow(usageRow);
    await modal.waitFor({ state: "detached" });
    await card.locator(".rp-card__dose-count-input").fill(String(rp.days));
  }
  await blur(page);
  await submitOrderForm(page, form);
}

/**
 * 開いているカルテから注射を 1 件登録する。medicines は [{ query, row, dose }]、time は開始時刻(HH:MM)、
 * category は注射区分(入院では必須)、endDate を渡すとその日までの連日の注射にする。
 * method・route は用法種別・投与経路(医薬品から決まらないときに選ぶ。例:「ワンショット」「皮下」)。
 */
export async function registerInjection(page, { medicines, time, category = "定時", endDate, method, route }) {
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "注射", exact: true }).click();
  const form = page.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await labeled(common, "注射区分").locator("select").selectOption({ label: category });
  if (endDate) await labeled(common, "終了日").locator("input").fill(endDate);
  const card = form.locator("fieldset.rp-card").first();
  for (const [i, medicine] of medicines.entries()) {
    await card.getByRole("button", { name: i === 0 ? "医薬品を選択" : "+ 医薬品追加" }).click();
    await pickMedicine(page, medicine.query, medicine.row);
    await card.locator(".rp-card__dose-input").nth(i).fill(String(medicine.dose));
  }
  const usage = card.locator(".injection-usage");
  if (method) await labeled(usage, "用法種別").locator("select").selectOption({ label: method });
  if (route) await labeled(usage, "投与経路").locator("select").selectOption({ label: route });
  if (time) {
    const times = card.locator(".injection-start-times");
    await times.getByRole("button", { name: "+ 開始時刻追加" }).click();
    await times.getByLabel("1 回目の開始時刻").fill(time);
  }
  await blur(page);
  await submitOrderForm(page, form);
}

/** 処方・注射のフォームを登録する。警告の確認が出たら、理由の先頭を選んで登録する。 */
export async function submitOrderForm(page, form) {
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  const confirm = page.locator(".modal").filter({ hasText: "警告の確認" });
  const error = page.locator(".karte-right .error-banner, .karte-right [role=alert]").first();
  await Promise.race([confirm.waitFor(), form.waitFor({ state: "detached" }), error.waitFor()]);
  if (await error.isVisible()) throw new Error(`登録できません: ${await error.innerText()}`);
  if (await confirm.isVisible()) {
    for (const select of await confirm.locator("select").all()) await select.selectOption({ index: 1 });
    await confirm.getByRole("button", { name: "登録", exact: true }).click();
  }
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
