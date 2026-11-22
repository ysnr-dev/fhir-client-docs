// 操作マニュアル「データ抽出」(docs/manual/data-extract.md)
// 医師 四郎が、「患者」タブで高血圧症 × アムロジピンの条件を組んで実行し(見本 花子だけが当たる)、条件を保存する。
// 続けて「入院・外来」タブで見本病棟の入院を表にし、内訳で在院日数の平均を出す。
// 撮影の前後に、自分の条件として保存した見本の条件を消す。
import { blur, labeled, settle } from "../lib/karte.mjs";
import { HYPERTENSION_QUERY, buildHypertensionQuery, buildWardQuery, removeQueries, saveQuery } from "../lib/data.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const cleanUp = () => removeQueries(page, [HYPERTENSION_QUERY]);
  await cleanUp();

  // 「患者」タブで条件を組む
  const { condition, medication } = await buildHypertensionQuery(page);
  await blur(page);
  await mark(page.getByRole("tablist", { name: "抽出の切替" }), { label: 1, place: "corner" });
  await mark(page.getByRole("group", { name: "条件のつなぎ方" }).first(), { label: 2, place: "corner" });
  await mark(page.locator(".extract-group__head select").filter({ has: page.locator("option", { hasText: "＋条件" }) }).first(), { label: 3, place: "corner" });
  await mark(condition.locator(".extract-leaf__row").first(), { label: 4, place: "corner" });
  await mark(medication.locator(".extract-leaf__row").nth(1), { label: 5, place: "corner" });
  await mark(medication.getByRole("group", { name: "出力する項目" }), { label: 6, place: "corner" });
  await mark(page.getByText("出力項目", { exact: true }).locator(".."), { label: 7, place: "corner" });
  await mark(page.getByRole("button", { name: "実行", exact: true }), { label: 8, place: "corner" });
  await shot("01-conditions", { target: [page.locator(".page__header"), page.getByRole("button", { name: "実行", exact: true })], padding: 24 });
  await clearMarks();

  // 実行した結果
  await page.getByRole("button", { name: "実行", exact: true }).click();
  const row = page.locator(".extract-results__table tbody tr").filter({ hasText: "見本 花子" });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await page.locator(".extract-results__table tbody tr").count()) !== 1) throw new Error("抽出の結果に撮影用でない患者がいます");
  await mark(medication.locator(".extract-leaf__status"), { label: 1, place: "corner" });
  await mark(page.locator(".extract-results__count"), { label: 2, place: "corner" });
  await mark(row.getByRole("link", { name: "見本 花子" }), { label: 3, place: "corner" });
  await mark(page.getByRole("button", { name: "フォルダ登録" }), { label: 4, place: "corner" });
  await mark(page.getByRole("button", { name: "CSV", exact: true }), { label: 5, place: "corner" });
  await mark(page.getByRole("button", { name: "明細CSV" }), { label: 6, place: "corner" });
  await mark(page.getByRole("tablist", { name: "結果の表示切替" }).getByText("内訳", { exact: true }), { label: 7, place: "corner" });
  await shot("02-result", { target: [medication, row], padding: 24 });
  await clearMarks();

  // 条件を保存する
  await page.getByRole("button", { name: "保存", exact: true }).first().click();
  const saveModal = page.locator(".modal").filter({ hasText: "条件を保存" });
  await labeled(saveModal, "名前").locator("input").fill(HYPERTENSION_QUERY);
  await blur(page);
  await settle(saveModal);
  await mark(labeled(saveModal, "名前"), { label: 1 });
  await mark(labeled(saveModal, "保存先"), { label: 2 });
  await mark(saveModal.getByRole("button", { name: "保存", exact: true }), { label: 3 });
  await shot("03-save", { target: saveModal, padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await saveQuery(page, HYPERTENSION_QUERY);
  const select = labeled(page.locator(".page"), "保存した条件").locator("select");
  await page.waitForLoadState("networkidle");
  await mark(labeled(page.locator(".page"), "保存した条件"), { label: 1, place: "corner" });
  await mark(page.getByRole("button", { name: "別名保存" }), { label: 2, place: "corner" });
  await mark(page.getByRole("button", { name: "条件を削除" }).first(), { label: 3, place: "corner" });
  await shot("04-saved", { target: [page.locator(".page__header"), select], padding: 24 });
  await clearMarks();

  // 記録のタブ(入院・外来)
  await buildWardQuery(page);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  const rows = page.locator(".extract-results__table tbody tr");
  await rows.filter({ hasText: "見本 太郎" }).waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 2) throw new Error(`見本病棟の入院に撮影用でない行があります: ${await rows.allInnerTexts()}`);
  const recordRow = (title) => page.getByRole("group", { name: title, exact: true });
  await mark(page.getByRole("tablist", { name: "抽出の切替" }).getByText("入院・外来", { exact: true }), { label: 1, place: "corner" });
  await mark(recordRow("記録"), { label: 2, place: "corner" });
  await mark(recordRow("患者"), { label: 3, place: "corner" });
  await mark(recordRow("比較"), { label: 4, place: "corner" });
  await mark(recordRow("表"), { label: 5, place: "corner" });
  await mark(page.locator(".extract-results__count"), { label: 6, place: "corner" });
  await shot("05-record", { target: [page.locator(".page__header"), rows.last()], padding: 24 });
  await clearMarks();

  // 内訳
  await page.getByRole("tablist", { name: "結果の表示切替" }).getByText("内訳", { exact: true }).click();
  await page.getByLabel("行の軸").selectOption({ label: "性別" });
  await page.getByLabel("集計する値").selectOption({ label: "在院日数" });
  const breakdown = page.locator("table.extract-breakdown");
  await page.waitForLoadState("networkidle");
  await mark(page.getByRole("group", { name: "行", exact: true }), { label: 1, place: "corner" });
  await mark(page.getByRole("group", { name: "列", exact: true }), { label: 2, place: "corner" });
  await mark(page.getByRole("group", { name: "値", exact: true }), { label: 3, place: "corner" });
  await mark(breakdown, { label: 4, place: "corner" });
  await mark(page.getByRole("button", { name: "内訳CSV" }), { label: 5, place: "corner" });
  await shot("06-breakdown", { target: [page.locator(".extract-breakdown__controls"), breakdown, page.getByRole("button", { name: "内訳CSV" })], padding: 24 });
  await clearMarks();

  await cleanUp();
}
