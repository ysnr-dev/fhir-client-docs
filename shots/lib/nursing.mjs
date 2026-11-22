// 看護のシーンで共通に使う画面操作と片付け。
// 看護の写真は撮影用の病棟「見本病棟」と、そこに入院中の「見本 秋子」で撮る。見本 秋子は撮影用データ(manualShots)で
// 看護指示・点滴と、入院日から撮影日の朝(8 時前)までの実施の記録を持っている。シーンは撮影日に自分で作った記録だけを消す。
import { fhirApi } from "./karte.mjs";
import { SHOOTING_DATE } from "./session.mjs";

export const NURSING_PATIENT = "見本 秋子";
export const SHOOTING_WARD = "見本病棟";

// 撮影用データが撮影日に入れてある実施(深夜勤の分)は、この時刻より前。
const SEEDED_BEFORE = `${SHOOTING_DATE}T08:00`;

/** ヘッダーの「看護業務」メニュー(マウスを乗せると開く)。 */
export function nursingMenu(page) {
  return page.locator(".app__header .hover-menu").filter({ hasText: "看護業務" });
}

/**
 * ヘッダーの「看護業務」メニューから画面を開き、病棟を見本病棟にする。病棟の欄が「病棟」でない画面
 * (看護必要度の「届出単位」など)は selectWard: false で開き、シーンで選ぶ。
 */
export async function openNursingMenu(page, item, { selectWard: select = true } = {}) {
  const menu = nursingMenu(page);
  await menu.locator(".hover-menu__trigger").hover();
  await menu.locator(".hover-menu__items").getByRole("link", { name: item, exact: true }).click();
  await page.mouse.move(960, 1000);
  if (select) await selectWard(page);
}

/** 病棟の画面の「病棟」の欄(項目名ごと)。 */
export function wardField(page) {
  return page.locator("label").filter({ has: page.locator("select") }).filter({ hasText: /^病棟/ }).first();
}

/** 病棟の画面の「病棟」を見本病棟にする。 */
export async function selectWard(page) {
  await wardField(page).locator("select").selectOption({ label: SHOOTING_WARD });
  await page.waitForURL(/[?&]ward=/);
  await page.waitForLoadState("networkidle");
}

/** 撮影日の 8 時以降のバイタル(経過表一括入力・バイタル登録で入れた測定)を消す。patients は患者名の配列。 */
export async function removeShootingDayVitals(page, patients) {
  const api = await fhirApi(page);
  for (const name of patients) {
    const [family, given] = name.split(" ");
    const [patient] = await api.search("Patient", { family, given });
    if (!patient) continue;
    const vitals = await api.search("Observation", {
      patient: patient.id,
      category: "vital-signs",
      date: `ge${SEEDED_BEFORE}`,
      _count: "500",
    });
    for (const vital of vitals.filter((v) => !v.basedOn?.length && (v.effectiveDateTime ?? "") >= SEEDED_BEFORE)) {
      await api.remove("Observation", vital.id);
    }
  }
}

/** 看護の患者の ID。 */
export async function nursingPatientId(page) {
  const api = await fhirApi(page);
  const [family, given] = NURSING_PATIENT.split(" ");
  const patients = await api.search("Patient", { family, given });
  if (patients.length !== 1) throw new Error(`患者「${NURSING_PATIENT}」が 1 人に絞れません`);
  return patients[0].id;
}

const isNursingOrder = (sr) =>
  sr.category?.some((c) => c.coding?.some((coding) => coding.system?.endsWith("/order-type") && coding.code === "nursing"));

/**
 * 看護の患者の、撮影日にシーンが作った看護の記録を消す。撮影日に出した看護指示(指示受けの Task・実施ごと)と、
 * 撮影用データの指示への撮影日 8 時以降の実施。撮影用データの指示そのものと、それより前の実施は残す。
 */
export async function removeShootingDayNursing(page, patientId) {
  const api = await fhirApi(page);
  const orders = (await api.search("ServiceRequest", { patient: patientId, _count: "500" })).filter(isNursingOrder);
  const records = async (type, orderId) => api.search(type, { "based-on": `ServiceRequest/${orderId}`, _count: "500" });
  for (const order of orders) {
    const createdToday = order.authoredOn?.startsWith(SHOOTING_DATE);
    for (const type of ["Observation", "Procedure"]) {
      for (const record of await records(type, order.id)) {
        const at = record.effectiveDateTime ?? record.performedDateTime ?? record.performedPeriod?.start ?? "";
        if (createdToday || at >= SEEDED_BEFORE) await api.remove(type, record.id);
      }
    }
    if (!createdToday) continue;
    for (const task of await api.search("Task", { focus: `ServiceRequest/${order.id}` })) await api.remove("Task", task.id);
    await api.remove("ServiceRequest", order.id);
  }
}
