// 操作マニュアル「他科依頼・チーム依頼」(docs/manual/consult-team.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)について、皮膚科への他科依頼と、栄養サポートチームへのチーム依頼を登録して撮る。
// 撮影の前後に、この患者の依頼のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";

const PATIENT = "見本 太郎";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const requestCards = page.locator(".karte-card").filter({ hasText: /他科依頼|チーム依頼/ });
  await deleteAllCards(page, requestCards);

  const pane = page.locator(".karte-right");
  const consultButton = pane.getByRole("button", { name: "他科依頼", exact: true });
  const teamButton = pane.getByRole("button", { name: "チーム依頼", exact: true });
  await mark(consultButton, { label: 1 });
  await mark(teamButton, { label: 2 });
  await shot("01-open");
  await clearMarks();

  // ---- 他科依頼 ----
  await consultButton.click();
  let form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  let destination = fieldset("依頼先");
  await destination.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(destination, "診療科").locator("select").selectOption({ label: "皮膚科" });
  let content = fieldset("依頼内容");
  await labeled(content, "依頼種別").locator("select").selectOption({ label: "診察依頼" });
  await content.getByLabel("依頼目的").fill("仙骨部に発赤があります。褥瘡の有無と処置の方針についてご相談します。");
  await blur(page);
  await mark(labeled(destination, "診療科"), { label: 1 });
  await mark(labeled(destination, "医師"), { label: 2, place: "corner" });
  await mark(labeled(content, "依頼種別"), { label: 3 });
  await mark(labeled(content, "緊急度"), { label: 4, place: "corner" });
  await mark(labeled(content, "希望日"), { label: 5, place: "corner" });
  await mark(content.locator(".consult-form__wide").filter({ hasText: "依頼目的" }), { label: 6 });
  await mark(content.getByRole("button", { name: "テンプレート" }), { label: 7, place: "corner" });
  await mark(labeled(content, "対象プロブレム"), { label: 8 });
  await shot("02-consult", { target: [destination, content], padding: 40 });
  await clearMarks();

  let submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await form.waitFor({ state: "detached" });
  const consultCard = requestCards.filter({ hasText: "他科依頼" }).first();
  await consultCard.waitFor();
  await page.waitForLoadState("networkidle");
  await consultCard.getByRole("button", { name: /の操作$/ }).click();
  let menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(consultCard.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("03-consult-card", { target: [consultCard, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // ---- チーム依頼 ----
  await teamButton.click();
  form = pane.locator(".prescription-form");
  destination = fieldset("依頼先");
  await destination.waitFor();
  await labeled(destination, "チーム").locator("select").selectOption({ label: "栄養サポートチーム" });
  content = fieldset("依頼内容");
  await content.getByLabel("依頼目的").fill("食事の摂取量が 5 割程度です。栄養評価と介入をお願いします。");
  await blur(page);
  await mark(labeled(destination, "チーム"), { label: 1 });
  await mark(labeled(content, "緊急度"), { label: 2 });
  await mark(labeled(content, "希望日"), { label: 3, place: "corner" });
  await mark(content.locator("[class*=__wide]").filter({ has: page.getByLabel("依頼目的") }).first(), { label: 4 });
  await shot("04-team", { target: [destination, content], padding: 40 });
  await clearMarks();
  submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await form.waitFor({ state: "detached" });
  const teamCard = requestCards.filter({ hasText: "チーム依頼" }).first();
  await teamCard.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("05-team-card", { target: teamCard });

  await deleteAllCards(page, requestCards);
}
