// 操作マニュアル「看護記録」(docs/manual/nursing-note.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者。誤嚥性肺炎)の看護記録をフォーカスチャーティング(F-DAR)で書く。
// 撮影の前後に、撮影日の診療記録をカルテから削除する。
import { blur, dayGroup, deleteAllCards, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const FOCUS = {
  F: "#1 誤嚥の危険がある状態",
  D: "朝食時、汁物でむせ込みあり。SpO2 95%、湿性の咳が続く。",
  A: "食事を中断し、座位を保って咳嗽を促した。汁物にとろみを付けて再開した。",
  R: "むせは治まり、残りを全量摂取。SpO2 97%。",
};

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  await openKarte(page, NURSING_PATIENT);
  const notes = dayGroup(page, SHOOTING_DATE).locator(".karte-card--note");
  await deleteAllCards(page, notes);

  // 診療記録を開いて看護記録のタイトルを選ぶ
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "診療記録", exact: true }).click();
  const form = pane.locator("form").first();
  await form.waitFor();
  const field = (text) => form.locator("label").filter({ hasText: new RegExp(`^${text}`) }).first();
  await field("タイトル").locator("select").selectOption({ label: "看護記録(フォーカス)" });
  await field("対象プロブレム").locator("select").selectOption({ label: "#1 誤嚥性肺炎" });
  const focusSection = pane.locator(".qp-group__instance").first();
  await focusSection.waitFor();
  await focusSection.locator("input").first().fill(FOCUS.F);
  const areas = focusSection.locator("textarea");
  await areas.nth(0).fill(FOCUS.D);
  await areas.nth(1).fill(FOCUS.A);
  await areas.nth(2).fill(FOCUS.R);
  await blur(page);
  await form.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(form.getByRole("radio", { name: "テンプレート" }).locator(".."), { label: 1, place: "corner" });
  await mark(field("タイトル"), { label: 2, place: "corner" });
  await mark(field("対象プロブレム"), { label: 3, place: "corner" });
  await mark(focusSection.locator("input").first(), { label: 4, place: "corner" });
  await mark(areas.nth(0), { label: 5, place: "corner" });
  await shot("01-form", { target: [form.locator("fieldset").first(), areas.nth(2)] });
  await clearMarks();

  // 登録する
  const addFocus = pane.getByRole("button", { name: /追加/ }).last();
  const submit = pane.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(addFocus, { label: 1, place: "corner" });
  await mark(submit, { label: 2, place: "corner" });
  await shot("02-submit", { target: [areas.nth(2), submit] });
  await clearMarks();
  await submit.click();
  await submit.waitFor({ state: "detached" });

  const card = notes.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  // 日付の見出しが上に固定されるので、カードを画面の中ほどに置いてから撮る。
  await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot("03-card", { target: card });

  await deleteAllCards(page, notes);
}
