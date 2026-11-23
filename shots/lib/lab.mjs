// 検査部のシーンで共通に使う画面操作と片付け。
// 検査部の写真は、医師 四郎が見本 太郎(入院。見本病棟)と見本 花子(外来)に撮影日の検体検査を出し、
// 検査 春子(臨床検査技師)が部門の画面で受ける 2 段で撮る。片付けは撮影日に出した検体検査だけを消す
// (見本 花子の受診歴、見本 太郎の入院時のバイタルは残す)。
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blur, dayGroup, fhirApi, labeled, openKarte, patientIdOf } from "./karte.mjs";
import { SHOOTING_DATE } from "./session.mjs";

export const LAB_INPATIENT = "見本 太郎";
export const LAB_OUTPATIENT = "見本 花子";

const ORDER_TYPE_SYSTEM = "http://fhir-client.local/CodeSystem/order-type";
// 片付けの対象にするオーダーの種別(検体検査・細菌検査・病理検査)。
const ORDER_TYPES = ["lab", "micro", "pathology"];

/** ヘッダーの「部門業務」> section > item で画面を開く。 */
export async function openDepartmentMenu(page, section, item) {
  const menu = page.locator(".app__header .hover-menu").filter({ hasText: "部門業務" });
  await menu.locator(".hover-menu__trigger").hover();
  await menu.locator(".sub-menu").filter({ hasText: section }).hover();
  await menu.locator(".sub-menu__items").getByRole("link", { name: item, exact: true }).click();
  await page.mouse.move(960, 1000);
  await page.waitForLoadState("networkidle");
}

/** 患者のカルテを開き、撮影日の検体検査を片付けてから開き直す(医師でログインしておく)。 */
export async function openLabKarte(page, patientName) {
  await openKarte(page, patientName);
  await removeShootingLabRecords(page, patientIdOf(page));
  await page.reload();
  await page.locator(".karte-right").waitFor();
  await page.waitForLoadState("networkidle");
}

/**
 * 開いているカルテから、撮影日の検体検査を登録する。items は検査伝票のチェックボックスの名前。
 * tab を渡すと、その伝票のタブに切り替えてから選ぶ(既定は最初の伝票)。
 */
export async function registerLabOrder(page, items, { tab } = {}) {
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "検体検査", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ index: 1 });
  if (tab) {
    await form.getByRole("tab", { name: tab }).click();
    await form.getByRole("checkbox", { name: items[0], exact: true }).first().waitFor();
    await page.waitForLoadState("networkidle");
  }
  for (const name of items) await form.getByRole("checkbox", { name, exact: true }).first().check();
  await blur(page);
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}

/**
 * 検体検査一覧の行の「ラベル発行」を押す。ラベルの PDF は別のタブで開き、PDF を作るときに管の番号が
 * 決まるので、PDF の応答を待ってからタブを閉じる。
 */
export async function issueLabel(page, row) {
  const response = page
    .context()
    .waitForEvent("response", (r) => r.url().includes("/reports/lab_labels/") && r.request().method() === "GET");
  const [pdf] = await Promise.all([page.context().waitForEvent("page"), row.getByRole("link", { name: "ラベル発行" }).click()]);
  await (await response).finished();
  await pdf.close();
  await row.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
}

/**
 * 開いているカルテから、撮影日の細菌検査を登録する。specimen は検体種別、site は採取部位、items は検査項目の
 * チェックボックスの名前。
 */
export async function registerMicroOrder(page, { specimen, site, items }) {
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "細菌検査", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  await form.locator("fieldset").first().waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(form.locator("fieldset").first(), "対象プロブレム").locator("select").selectOption({ index: 1 });
  await labeled(fieldset("検体"), "検体種別").locator("select").selectOption({ label: specimen });
  await labeled(fieldset("検体"), "採取部位").locator("select").selectOption({ label: site });
  for (const name of items) await fieldset("検査項目").getByRole("checkbox", { name, exact: true }).check();
  await blur(page);
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}

/**
 * 開いているカルテから、撮影日の病理検査(組織診)を登録し、採取を記録してラベルを発行する。organ は検体の頻用の
 * 臓器のボタンの名前。ラベルの PDF は別のタブで開き、PDF を作るときに番号が決まるので、応答を待ってから閉じる。
 */
export async function registerPathoOrder(page, { organ, method, count, containers, clinical }) {
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "病理検査", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const common = fieldset("検査共通");
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "採取(予定)日時").locator("input").fill(`${SHOOTING_DATE}T10:00`);
  const specimen = form.locator(".patho-order__specimen").first();
  await specimen.locator(".patho-order__frequent").getByRole("button", { name: organ }).click();
  await labeled(specimen, "採取法").locator("select").selectOption({ label: method });
  await labeled(specimen, "検体個数").locator("input").fill(String(count));
  await labeled(specimen, "容器数").locator("input").fill(String(containers));
  await fieldset("臨床情報").locator("textarea").fill(clinical);
  await blur(page);
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  const card = dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: "病理検査" }).first();
  await card.getByRole("button", { name: /の操作$/ }).click();
  await page.locator(".row-menu__item", { hasText: /^採取$/ }).click();
  const modal = page.locator(".modal").filter({ hasText: "病理検査の採取" });
  await modal.waitFor();
  const response = page
    .context()
    .waitForEvent("response", (r) => r.url().includes("/reports/patho_labels/") && r.request().method() === "GET");
  const [pdf] = await Promise.all([page.context().waitForEvent("page"), modal.getByRole("button", { name: /^採取/ }).last().click()]);
  await (await response).finished();
  await pdf.close();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}

/** 患者の ID(カルテを開かずに片付けるとき)。 */
export async function patientIdByName(page, patientName) {
  const api = await fhirApi(page);
  const [family, given] = patientName.split(" ");
  const patients = await api.search("Patient", { family, given });
  if (patients.length !== 1) throw new Error(`患者「${patientName}」が 1 人に絞れません`);
  return patients[0].id;
}

/** 患者番号と、撮影日の検体検査の採取管のラベル番号(発行した順)。 */
export async function labelsOf(page, patientName) {
  const api = await fhirApi(page);
  const patientId = await patientIdByName(page, patientName);
  const patient = await api.read(`Patient/${patientId}`);
  const { orderIds } = await shootingLabOrders(api, patientId);
  const numbers = (await api.search("Specimen", { patient: patientId, _count: "500" }))
    .filter((s) => s.request?.some((r) => orderIds.has(idOf(r))))
    .map((s) => s.accessionIdentifier?.value)
    .filter(Boolean)
    .sort();
  return { patientNumber: patient.identifier?.[0]?.value, numbers };
}

/**
 * 検査室の分析装置から届く結果のファイル(JAHIS 臨床検査データ交換規約の ORU^R01、UTF-8)を作り、そのパスを返す。
 * results は [JLAC10, 略称, 値, 単位, ファイルの基準範囲, 異常フラグ]。
 */
export async function writeResultFile(fileName, { patientNumber, patientName, birthDate, gender, labels, results }) {
  const [family, given] = patientName.split(" ");
  const stamp = `${SHOOTING_DATE.replaceAll("-", "")}`;
  const segments = [
    `MSH|^~\\&|LIS|見本検査室|HIS|見本病院|${stamp}103000||ORU^R01^ORU_R01|SHOTS${stamp}|P|2.5||||||UNICODE UTF-8`,
    `PID|||${patientNumber}||${family}^${given}^^^^^L^I||${birthDate.replaceAll("-", "")}|${gender}`,
    "ORC|SC||||CM",
    `OBR|1||||||${stamp}090000||||||||||||||${stamp}103000|||F`,
    ...results.map(
      ([jlac, name, value, unit, range, flag], i) => `OBX|${i + 1}|NM|${jlac}^${name}^JC10||${value}|${unit}|${range}|${flag}||N|F`,
    ),
    `SPM|1|${labels.join("~")}||023^血清^JC10`,
  ];
  const dir = join(tmpdir(), "fhir-client-docs-shots");
  await mkdir(dir, { recursive: true });
  const file = join(dir, fileName);
  await writeFile(file, `${segments.join("\r")}\r`);
  return file;
}

/** 検査結果取込のバッチのうち、ファイル名が fileName のものを消す(撮影の前後に、取込一覧を毎回同じにする)。 */
export async function removeImportBatches(page, fileName) {
  const { csrf_token: csrf } = await (await page.request.get("/auth/session")).json();
  const { items } = await (await page.request.get("/master/lab_result_imports?page=1")).json();
  for (const batch of items.filter((b) => b.file_name === fileName)) {
    const response = await page.request.delete(`/master/lab_result_imports/${batch.id}`, { headers: { "X-CSRF-Token": csrf } });
    if (!response.ok()) throw new Error(`取込 ${batch.id} を消せません: ${response.status()}`);
  }
}

/**
 * 撮影日に出した検体検査・細菌検査・病理検査を、進捗・通知の Task、検体ラベル、結果ごと消す。
 * オーダーに紐付けずに取り込んだ撮影日の検体検査の結果も消す。
 */
export async function removeShootingLabRecords(page, patientId) {
  const api = await fhirApi(page);
  const { headers, items, orderIds } = await shootingLabOrders(api, patientId);

  const reports = (await api.search("DiagnosticReport", { patient: patientId, _count: "500" })).filter(
    (report) =>
      report.basedOn?.some((r) => orderIds.has(idOf(r))) ||
      (!report.basedOn?.length && report.effectiveDateTime?.startsWith(SHOOTING_DATE) && isLabReport(report)),
  );
  const reportIds = new Set(reports.map((r) => r.id));
  // 細菌検査の結果は、分離菌の記録が感受性の記録を hasMember で束ねる。
  const observationIds = [];
  for (let queue = reports.flatMap((r) => (r.result ?? []).map(idOf)); queue.length > 0; ) {
    const id = queue.shift();
    if (observationIds.includes(id)) continue;
    observationIds.push(id);
    const observation = await api.read(`Observation/${id}`);
    queue.push(...(observation.hasMember ?? []).map(idOf));
  }

  const refersTo = (task) =>
    [task.focus, ...(task.basedOn ?? [])].some((r) => r && (orderIds.has(idOf(r)) || reportIds.has(idOf(r))));
  const tasks = (await api.search("Task", { patient: patientId, _count: "500" })).filter(refersTo);
  // 検体ラベル(管・容器)は request でオーダーを指し、病理の検体はオーダーの specimen から指される。
  const specimenIds = new Set([...headers, ...items].flatMap((sr) => (sr.specimen ?? []).map(idOf)));
  const specimens = (await api.search("Specimen", { patient: patientId, _count: "500" })).filter(
    (s) => specimenIds.has(s.id) || s.request?.some((r) => orderIds.has(idOf(r))),
  );

  for (const task of tasks) await api.remove("Task", task.id);
  for (const report of reports) await api.remove("DiagnosticReport", report.id);
  for (const id of observationIds) await api.remove("Observation", id);
  // 指す側から先に消す(ラベルはオーダーを指し、病理の検体はオーダーから指される)。
  const [referenced, labels] = [specimens.filter((s) => specimenIds.has(s.id)), specimens.filter((s) => !specimenIds.has(s.id))];
  for (const specimen of labels) await api.remove("Specimen", specimen.id);
  for (const sr of items) await api.remove("ServiceRequest", sr.id);
  for (const sr of headers) await api.remove("ServiceRequest", sr.id);
  for (const specimen of referenced) await api.remove("Specimen", specimen.id);
}

/** 撮影日に出した検体検査・細菌検査・病理検査のヘッダと明細。 */
async function shootingLabOrders(api, patientId) {
  const requests = await api.search("ServiceRequest", { patient: patientId, _count: "500" });
  const headers = requests.filter(
    (sr) =>
      sr.authoredOn?.startsWith(SHOOTING_DATE) &&
      sr.category?.some((c) => c.coding?.some((cd) => cd.system === ORDER_TYPE_SYSTEM && ORDER_TYPES.includes(cd.code))),
  );
  // 明細は basedOn でヘッダを指す。パネルの構成項目はパネルの明細を指すので、孫までたどる。
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
  return { headers, items, orderIds };
}

function idOf(reference) {
  return reference?.reference?.split("/").pop();
}

function isLabReport(report) {
  return report.category?.some((c) => c.coding?.some((cd) => cd.code === "LAB"));
}
