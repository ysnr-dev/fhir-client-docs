// 操作マニュアル「NCD 症例登録」(docs/manual/ncd.md)
// 医師 四郎が見本 太郎(早期胃癌)に撮影日の腹腔鏡下胃切除術を申し込み、看護 次郎(手術室の看護師)が手術一覧で
// 実施まで記録してから、医師 四郎が NCD症例登録の一覧を撮影日の手術に絞り、「登録」から症例登録のテンプレートを開いて撮る。
// 撮影の前後に、撮影日に申し込んだ手術を実施記録・症例登録ごと消す。
import { blur, labeled, logout } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";
import { SURGERY_CASES, performSurgery, registerSurgery, removeShootingSurgeries } from "../lib/surgery.mjs";

const GASTRIC = SURGERY_CASES.gastric;

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeShootingSurgeries(page);
  await registerSurgery(page, GASTRIC, { date: SHOOTING_DATE, time: "09:00", duration: 300 });
  await logout(page);
  await login("nurse");
  await performSurgery(page, GASTRIC);
  await logout(page);
  await login("doctor");

  // 症例登録の一覧
  await page.goto("/ncd-registrations");
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "手術日").locator("input[type=date]").first().fill(SHOOTING_DATE);
  await filters.getByLabel("手術日の終わり").fill(SHOOTING_DATE);
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: GASTRIC.patient });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("NCD症例登録の一覧に撮影用でない行があります");
  await blur(page);
  await mark(labeled(filters, "手術日"), { label: 1, place: "corner" });
  await mark(labeled(filters, "依頼科"), { label: 2, place: "corner" });
  await mark(labeled(filters, "状態"), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(9), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(10), { label: 5, place: "corner" });
  await mark(row.getByRole("link", { name: "登録" }), { label: 6, place: "corner" });
  await mark(page.getByRole("button", { name: "CSV" }), { label: 7, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), filters, page.locator(".lab-worklist"), page.locator(".lab-worklist__count")], padding: 24 });
  await clearMarks();

  // 症例登録を始める
  await row.getByRole("link", { name: "登録" }).click();
  const right = page.locator(".karte-right");
  const trigger = right.locator(".template-select__trigger");
  const form = right.locator("form").first();
  const meta = form.locator(".qp-meta");
  await meta.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  const firstGroup = form.locator("fieldset").first();
  await mark(trigger, { label: 1, place: "corner" });
  await mark(meta.locator("summary"), { label: 2, place: "corner" });
  await mark(firstGroup, { label: 3, place: "corner" });
  await shot("02-form", { target: [right.getByText("テンプレート登録", { exact: true }), right.getByText("閉じる", { exact: true }), firstGroup], padding: 24 });
  await clearMarks();

  // 手術の項目の初期値
  const surgeryGroup = form.locator("fieldset").filter({ has: page.locator(":scope > legend", { hasText: /^手術$/ }) }).first();
  await surgeryGroup.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(surgeryGroup.locator(".qp-field").filter({ hasText: "手術日" }).first(), { label: 1, place: "corner" });
  await mark(surgeryGroup.locator(".qp-field").filter({ hasText: "主術式" }).first(), { label: 2, place: "corner" });
  await shot("03-surgery", { target: surgeryGroup, padding: 24 });
  await clearMarks();

  // 登録して一覧に戻る
  const submit = form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await submit.waitFor({ state: "detached", timeout: 8000 });
  await page.waitForLoadState("networkidle");
  await page.goto("/ncd-registrations");
  await labeled(filters, "手術日").locator("input[type=date]").first().fill(SHOOTING_DATE);
  await filters.getByLabel("手術日の終わり").fill(SHOOTING_DATE);
  await row.getByRole("link", { name: "開く" }).waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(row.locator("td").nth(10), { label: 1, place: "corner" });
  await mark(row.locator("td").nth(12), { label: 2, place: "corner" });
  await mark(row.getByRole("link", { name: "開く" }), { label: 3, place: "corner" });
  await shot("04-registered", { target: [page.locator(".lab-worklist thead"), row], padding: 24 });
  await clearMarks();

  await removeShootingSurgeries(page);
}
