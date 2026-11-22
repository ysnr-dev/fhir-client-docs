// 操作マニュアル「検査結果取込」(docs/manual/lab-result-import.md)
// 医師 四郎が外来の「見本 花子」(撮影用の架空の患者)に撮影日の検体検査を出し、検査 春子(臨床検査技師)が
// ラベルを発行してから、分析装置の結果のファイル(シーンが発行したラベル番号で作る)を取り込んで登録する。
// ヘマトクリットはファイルの JLAC が結果項目マスタに無いので保留になり、画面で結果項目を割り当てる
// (割り当てのときマスタに JLAC を書き込まない。書き込むと次から保留にならず写真が変わる)。
// 撮影の前後に、撮影日の検体検査と、このファイルの取込を消す。
import { blur, logout } from "../lib/karte.mjs";
import {
  LAB_OUTPATIENT,
  issueLabel,
  labelsOf,
  openDepartmentMenu,
  openLabKarte,
  patientIdByName,
  registerLabOrder,
  removeImportBatches,
  removeShootingLabRecords,
  writeResultFile,
} from "../lib/lab.mjs";

const FILE_NAME = "見本検査室_20270201.hl7";

// [JLAC10, 略称, 値, 単位, ファイルの基準範囲, 異常フラグ]
const RESULTS = [
  ["2A990000001999952", "WBC", "6.2", "10*3/uL", "3.3-8.6", ""],
  ["2A990000001999951", "RBC", "4.35", "10*6/uL", "3.86-4.92", ""],
  ["2A030000001999901", "Hb", "13.1", "g/dL", "11.6-14.8", ""],
  ["2A040000001930102", "Ht", "39.8", "%", "35.1-44.4", ""],
  ["2A990000001999955", "PLT", "245", "10*3/uL", "158-348", ""],
  ["3B035000002399901", "AST", "24", "U/L", "13-30", ""],
  ["3B045000002399901", "ALT", "31", "U/L", "7-23", "H"],
  ["3C015000002399901", "Cre", "0.68", "mg/dL", "0.46-0.79", ""],
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が検体検査を出す
  await login("doctor");
  await openLabKarte(page, LAB_OUTPATIENT);
  await registerLabOrder(page, ["血算", "AST", "ALT", "Cre"]);
  await logout(page);

  // 検査室がラベルを発行し、分析装置が結果のファイルを出す
  await login("labTech");
  await removeImportBatches(page, FILE_NAME);
  await openDepartmentMenu(page, "臨床検査部門", "検体検査一覧");
  await issueLabel(page, page.locator(".lab-worklist tbody tr").filter({ hasText: LAB_OUTPATIENT }));
  const { patientNumber, numbers } = await labelsOf(page, LAB_OUTPATIENT);
  const file = await writeResultFile(FILE_NAME, {
    patientNumber,
    patientName: LAB_OUTPATIENT,
    birthDate: "1972-04-10",
    gender: "F",
    labels: [...numbers].reverse(),
    results: RESULTS,
  });

  // ファイルを取り込む
  await openDepartmentMenu(page, "臨床検査部門", "検査結果取込");
  const form = page.locator(".master-import-form");
  await form.getByLabel("取込ファイル").setInputFiles(file);
  await blur(page);
  await mark(form.locator("label").filter({ hasText: "取込ファイル" }), { label: 1, place: "corner" });
  await mark(form.locator("label").filter({ hasText: "文字コード" }), { label: 2, place: "corner" });
  await mark(form.getByRole("button", { name: "取込実行" }), { label: 3, place: "corner" });
  await shot("01-upload", { target: [page.locator(".page__header"), form], padding: 32 });
  await clearMarks();
  await form.getByRole("button", { name: "取込実行" }).click();
  await page.waitForURL(/\/lab-result-imports\/\d+$/);

  // 取り込んだ結果
  const card = page.locator(".lab-import-card");
  const pendingRow = card.getByRole("row").filter({ hasText: "結果項目が見つかりません" });
  await pendingRow.waitFor();
  await card.getByText(/^オーダー:/).waitFor();
  await page.waitForLoadState("networkidle");
  const altRow = card.getByRole("row").filter({ hasText: "3B045000002399901" });
  await mark(card.locator(".lab-import-card__header > div").first(), { label: 1, place: "corner" });
  await mark(card.locator(".lab-import-card__link"), { label: 2, place: "corner" });
  await mark(pendingRow.locator("td").nth(1), { label: 3, place: "corner" });
  await mark(altRow.locator("td").nth(6), { label: 4, place: "corner" });
  await mark(altRow.getByRole("button", { name: "対象外" }), { label: 5, place: "corner" });
  await mark(card.getByRole("button", { name: "候補登録" }), { label: 6, place: "corner" });
  // 取込日時(撮影の実際の日時)を写さないよう、上の行は入れない。
  await shot("02-detail", { target: card, padding: 12 });
  await clearMarks();

  // 保留の行に結果項目を割り当てる
  await pendingRow.getByRole("button", { name: "結果項目選択" }).click();
  let modal = page.locator(".modal");
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  modal = page.locator(".modal");
  await modal.getByLabel("名称・略称・カナ").fill("ヘマトクリット");
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  const item = modal.locator(".master-search__row").filter({ hasText: "ヘマトクリット" });
  await item.waitFor();
  await item.click();
  const resolve = page.locator(".modal").filter({ hasText: "結果項目の割り当て" });
  const writeJlac = resolve.locator("label").filter({ hasText: "結果項目マスタに JLAC" });
  await writeJlac.waitFor();
  await mark(resolve.locator(".lab-import-resolve__source"), { label: 1 });
  await mark(resolve.locator(".lab-import-resolve__selected"), { label: 2 });
  await mark(writeJlac, { label: 3 });
  await mark(resolve.locator("label").filter({ hasText: "同じコードの保留行にも反映する" }), { label: 4 });
  await mark(resolve.getByRole("button", { name: "割り当てる" }), { label: 5, place: "corner" });
  await shot("03-resolve", { target: resolve, padding: 40 });
  await clearMarks();
  await writeJlac.locator("input").uncheck();
  await resolve.getByRole("button", { name: "割り当てる" }).click();
  await resolve.waitFor({ state: "detached" });
  await card.getByText("保留の行が").waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 登録する
  const register = card.getByRole("button", { name: "候補登録" });
  await register.click();
  const karte = card.getByRole("link", { name: "カルテ" });
  await karte.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(karte, { label: 1, place: "corner" });
  await shot("04-registered", { target: card.locator(".lab-import-card__header"), padding: 12 });
  await clearMarks();

  await removeImportBatches(page, FILE_NAME);
  await removeShootingLabRecords(page, await patientIdByName(page, LAB_OUTPATIENT));
}
