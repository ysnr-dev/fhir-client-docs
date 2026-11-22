// 部門の一覧(放射線・生理検査・内視鏡・処置・手術・輸血・リハビリ・透析・栄養など)のシーンで共通に使う片付け。
// 部門の写真は、医師 四郎が撮影用の患者に撮影日のオーダーを出し、部門のアカウントで受ける 2 段で撮る。
// 片付けは撮影日に出したオーダーだけを、進捗・通知・予約・実施記録・レポートごと消す(受診歴や入院時のバイタルは残す)。
import { fhirApi } from "./karte.mjs";
import { SHOOTING_DATE } from "./session.mjs";

const ORDER_TYPE_SYSTEM = "http://fhir-client.local/CodeSystem/order-type";

/**
 * 患者(patientId)に撮影日に出した、種別が orderTypes(order-type のコード: rad / physio / endoscopy …)のオーダーを、
 * 進捗・通知の Task、予約(枠は空きに戻す)、実施記録(Procedure と、それに属する薬剤・器材・測定)、
 * レポート(DiagnosticReport と所見・テンプレートの記入)ごと消す。
 * since を渡すと、撮影日ではなくその日(YYYY-MM-DD)以降に出したオーダーを対象にする。
 */
export async function removeShootingOrders(page, patientId, orderTypes, { since } = {}) {
  const api = await fhirApi(page);
  const search = (type) => api.search(type, { patient: patientId, _count: "500" });
  const requests = await search("ServiceRequest");
  const isTarget = (sr) =>
    (since ? sr.authoredOn?.slice(0, 10) >= since : sr.authoredOn?.startsWith(SHOOTING_DATE)) &&
    sr.category?.some((c) => c.coding?.some((cd) => cd.system === ORDER_TYPE_SYSTEM && orderTypes.includes(cd.code)));
  const headers = requests.filter(isTarget);
  // 明細は basedOn でヘッダを指す。セットの子は親の明細を指すので、孫までたどる。
  const orderIds = new Set(headers.map((sr) => sr.id));
  const items = [];
  for (let added = true; added; ) {
    added = false;
    for (const sr of requests) {
      if (orderIds.has(sr.id) || !sr.basedOn?.some((r) => orderIds.has(idOf(r)))) continue;
      orderIds.add(sr.id);
      items.unshift(sr);
      added = true;
    }
  }
  if (orderIds.size === 0) return;

  // 実施記録。手技が複数あると 2 件目以降は partOf で 1 件目を指す。
  const procedures = await search("Procedure");
  const procedureIds = new Set(procedures.filter((p) => p.basedOn?.some((r) => orderIds.has(idOf(r)))).map((p) => p.id));
  for (let added = true; added; ) {
    added = false;
    for (const p of procedures) {
      if (procedureIds.has(p.id) || !p.partOf?.some((r) => procedureIds.has(idOf(r)))) continue;
      procedureIds.add(p.id);
      added = true;
    }
  }
  const belongs = (r) =>
    [...(r.partOf ?? []), ...(r.basedOn ?? [])].some((ref) => procedureIds.has(idOf(ref)) || orderIds.has(idOf(ref)));
  const administrations = (await search("MedicationAdministration")).filter(belongs);
  const dispenses = (await search("MedicationDispense")).filter(belongs);

  const reports = (await search("DiagnosticReport")).filter((r) => r.basedOn?.some((ref) => orderIds.has(idOf(ref))));
  const reportIds = new Set(reports.map((r) => r.id));
  const observations = (await search("Observation")).filter(
    (o) => belongs(o) || reports.some((r) => r.result?.some((ref) => idOf(ref) === o.id)),
  );
  // 検査目的・特別指示などのテンプレートの記入は、オーダーの側から QuestionnaireResponse を指す。
  const referencedResponses = new Set(
    [...headers, ...items].flatMap((sr) => [...JSON.stringify(sr).matchAll(/QuestionnaireResponse\/([\w-]+)/g)].map((m) => m[1])),
  );
  const responses = (await search("QuestionnaireResponse")).filter(
    (q) =>
      referencedResponses.has(q.id) ||
      q.basedOn?.some((ref) => orderIds.has(idOf(ref))) ||
      q.partOf?.some((ref) => procedureIds.has(idOf(ref))),
  );
  const refersTo = (task) =>
    [task.focus, ...(task.basedOn ?? [])].some(
      (r) => r && (orderIds.has(idOf(r)) || reportIds.has(idOf(r)) || procedureIds.has(idOf(r))),
    );
  const tasks = (await search("Task")).filter(refersTo);
  const appointments = (await search("Appointment")).filter((a) => a.basedOn?.some((ref) => orderIds.has(idOf(ref))));

  for (const task of tasks) await api.remove("Task", task.id);
  for (const report of reports) await api.remove("DiagnosticReport", report.id);
  // オーダーから指される記入は、オーダーを消してから消す。
  for (const response of responses.filter((q) => !referencedResponses.has(q.id))) {
    await api.remove("QuestionnaireResponse", response.id);
  }
  for (const observation of observations) await api.remove("Observation", observation.id);
  for (const administration of administrations) await api.remove("MedicationAdministration", administration.id);
  for (const dispense of dispenses) await api.remove("MedicationDispense", dispense.id);
  for (const id of [...procedureIds].reverse()) await api.remove("Procedure", id);
  for (const appointment of appointments) {
    for (const { reference } of appointment.slot ?? []) {
      const slot = await api.read(reference);
      if (slot.status !== "free") await api.update({ ...slot, status: "free" });
    }
    await api.remove("Appointment", appointment.id);
  }
  for (const sr of items) await api.remove("ServiceRequest", sr.id);
  for (const sr of headers) await api.remove("ServiceRequest", sr.id);
  for (const response of responses.filter((q) => referencedResponses.has(q.id))) {
    await api.remove("QuestionnaireResponse", response.id);
  }
}

function idOf(reference) {
  return reference?.reference?.split("/").pop();
}
