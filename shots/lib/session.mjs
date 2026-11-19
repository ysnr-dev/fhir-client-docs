// シーンに渡す撮影の道具一式。画面の大きさ・倍率・テーマ・時刻帯はここで固定する。
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { clearMarks, mark } from "./marks.mjs";

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
const CLIP_PADDING = 16;
const BASE_URL = process.env.SHOTS_BASE_URL || "http://localhost:5173";
const IMAGE_ROOT = new URL("../../docs/manual/img/", import.meta.url);

const ROLES = { doctor: "DOCTOR", nurse: "NURSE", pharmacist: "PHARMACIST" };

export async function createSession(browser, scene) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    baseURL: BASE_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const outDir = new URL(`${scene}/`, IMAGE_ROOT);
  await mkdir(outDir, { recursive: true });

  const api = {
    page,
    /** 役割(doctor / nurse / pharmacist)のアカウントでログインする。アカウントは .env。 */
    login: (role) => login(page, role),
    /** 操作する場所に赤枠と番号を重ねる。 */
    mark: (target, options) => mark(page, toLocator(page, target), options),
    clearMarks: () => clearMarks(page),
    /** 画面全体、または target の周りだけを撮って <name>.webp に書き出す。 */
    shot: async (name, { target, padding = CLIP_PADDING, fullPage = false } = {}) => {
      const image = target
        ? await page.screenshot({ clip: await paddedBox(page, toLocator(page, target), padding), animations: "disabled" })
        : await page.screenshot({ fullPage, animations: "disabled" });
      const file = fileURLToPath(new URL(`${name}.webp`, outDir));
      await sharp(image).webp({ quality: 85 }).toFile(file);
      console.log(file);
    },
  };

  return { api, close: () => context.close() };
}

function toLocator(page, target) {
  return typeof target === "string" ? page.locator(target) : target;
}

async function paddedBox(page, locator, padding) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`撮影の範囲が見つかりません: ${locator}`);
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  return {
    x,
    y,
    width: Math.min(VIEWPORT.width - x, box.width + padding * 2),
    height: Math.min(VIEWPORT.height - y, box.height + padding * 2),
  };
}

async function login(page, role) {
  const key = ROLES[role];
  if (!key) throw new Error(`役割は ${Object.keys(ROLES).join(" / ")} のどれかです: ${role}`);
  const loginId = process.env[`SHOTS_${key}_LOGIN`];
  const password = process.env[`SHOTS_${key}_PASSWORD`];
  if (!loginId || !password) {
    throw new Error(`.env に SHOTS_${key}_LOGIN と SHOTS_${key}_PASSWORD を書いてください`);
  }
  await page.goto("/");
  await page.getByLabel("ログインID").fill(loginId);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.getByLabel("ログインID").waitFor({ state: "detached" });
}
