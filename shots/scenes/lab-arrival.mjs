// 操作マニュアル「検体到着確認」(docs/manual/lab-arrival.md)
// 医師 四郎が外来の「見本 花子」(撮影用の架空の患者)に撮影日の検体検査を出し、検査 春子(臨床検査技師)が
// 検体検査一覧でラベルを発行してから、検体到着確認で管のラベル番号を読む。撮影の前後に、撮影日の検体検査を消す。
import { logout } from "../lib/karte.mjs";
import {
  LAB_OUTPATIENT,
  issueLabel,
  labelsOf,
  openDepartmentMenu,
  openLabKarte,
  patientIdByName,
  registerLabOrder,
  removeShootingLabRecords,
} from "../lib/lab.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が検体検査を出す
  await login("doctor");
  await openLabKarte(page, LAB_OUTPATIENT);
  await registerLabOrder(page, ["血算", "AST", "ALT", "Cre"]);
  await logout(page);

  // 検査室がラベルを発行する
  await login("labTech");
  await openDepartmentMenu(page, "臨床検査部門", "検体検査一覧");
  const row = page.locator(".lab-worklist tbody tr").filter({ hasText: LAB_OUTPATIENT });
  await issueLabel(page, row);
  const [whole, serum] = (await labelsOf(page, LAB_OUTPATIENT)).numbers;

  // 検体到着確認
  await openDepartmentMenu(page, "臨床検査部門", "検体到着確認");
  const form = page.locator(".lab-arrival__scan");
  const input = page.getByPlaceholder("バーコードをスキャン(11桁)");
  await input.fill(whole);
  await mark(input, { label: 1 });
  await mark(form.getByRole("button", { name: "確定" }), { label: 2, place: "corner" });
  await shot("01-scan", { target: [page.locator(".page__header"), form], padding: 40 });
  await clearMarks();

  // 1 本目、同じ管の読み直し、読み取りの誤り、2 本目
  const feed = page.locator(".lab-arrival__feed li:not(.lab-arrival__empty)");
  const scan = async (number, count) => {
    await input.fill(number);
    await input.press("Enter");
    await feed.nth(count - 1).waitFor();
    await page.waitForLoadState("networkidle");
  };
  await scan(whole, 1);
  await scan(whole, 2);
  await scan(misread(serum), 3);
  await scan(serum, 4);
  await page.locator(".lab-arrival__result--completed").waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  const [latest, error, again, first] = await Promise.all([0, 1, 2, 3].map((i) => feed.nth(i)));
  await mark(first.locator(".lab-arrival__result--arrived"), { label: 1, place: "corner" });
  await mark(again.locator(".lab-arrival__result").first(), { label: 2, place: "corner" });
  await mark(error.locator(".lab-arrival__result--error"), { label: 3, place: "corner" });
  await mark(latest.locator(".lab-arrival__result--completed"), { label: 4, place: "corner" });
  await mark(latest.getByRole("button", { name: "取消" }), { label: 5 });
  await shot("02-feed", { target: page.locator(".lab-arrival__feed"), padding: 32 });
  await clearMarks();

  // 読み間違えた管の到着を取り消す
  await latest.getByRole("button", { name: "取消" }).click();
  await latest.locator(".lab-arrival__result", { hasText: "取消済み" }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.activeElement?.blur());
  await mark(latest.locator(".lab-arrival__result"), { label: 1, place: "corner" });
  await shot("03-cancel", { target: latest, padding: 12 });
  await clearMarks();

  await removeShootingLabRecords(page, await patientIdByName(page, LAB_OUTPATIENT));
}

/** 読み取りの誤り(最後のチェックデジットが合わない番号)。 */
function misread(number) {
  const last = Number(number.at(-1));
  return `${number.slice(0, -1)}${(last + 1) % 10}`;
}
