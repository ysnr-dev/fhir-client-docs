// シーンに渡す撮影の道具一式。画面の大きさ・倍率・テーマ・時刻帯・撮影日はここで固定する。
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { clearMarks, mark } from "./marks.mjs";

// 撮影日。ブラウザの時計をこの日の朝に合わせ、時は進むままにする。開発データの無い日なので、
// その日の一覧には撮影のデータだけが並び、写真の日付も撮り直しで変わらない。
// fhir-client の撮影用データ(frontend/src/demo-seed/manualShots.ts)の SHOOTING_DATE と揃える。
export const SHOOTING_DATE = "2027-02-01";
const SHOOTING_START = new Date(`${SHOOTING_DATE}T09:00:00+09:00`);

// 横幅は右ペインの医薬品名や用法名が折り返さない広さにする。
const VIEWPORT = { width: 1920, height: 1080 };
const SCALE = 2;
const CLIP_PADDING = 16;
const BASE_URL = process.env.SHOTS_BASE_URL || "http://localhost:5173";
const IMAGE_ROOT = new URL("../../docs/manual/img/", import.meta.url);

const ROLES = { doctor: "DOCTOR", resident: "RESIDENT", nurse: "NURSE", headNurse: "HEAD_NURSE", pharmacist: "PHARMACIST" };

export async function createSession(browser, scene) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    baseURL: BASE_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "dark",
  });
  await context.clock.install({ time: SHOOTING_START });
  const page = await context.newPage();
  const outDir = new URL(`${scene}/`, IMAGE_ROOT);
  await mkdir(outDir, { recursive: true });

  const api = {
    page,
    /** 役割(doctor / resident / nurse / headNurse / pharmacist)のアカウントでログインする。アカウントは .env。 */
    login: (role) => login(page, role),
    /** 操作する場所に赤枠と番号を重ねる。 */
    mark: (target, options) => mark(page, toLocator(page, target), options),
    clearMarks: () => clearMarks(page),
    /** 画面全体、または target(配列なら全部を囲む範囲)の周りだけを撮って <name>.webp に書き出す。 */
    shot: async (name, { target, padding = CLIP_PADDING, fullPage = false } = {}) => {
      const image = target
        ? await page.screenshot({ clip: await paddedBox(page, target, padding), animations: "disabled" })
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

// target が配列なら、すべてを囲む範囲にする。全部が画面に入る位置へのスクロールはシーンで済ませておく
// (注釈は文書に対して置くので、注釈を付けたあとに枠の中だけスクロールすると注釈がずれる)。
async function paddedBox(page, target, padding) {
  const locators = (Array.isArray(target) ? target : [target]).map((t) => toLocator(page, t));
  await locators[0].scrollIntoViewIfNeeded();
  const boxes = [];
  for (const locator of locators) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`撮影の範囲が見つかりません: ${locator}`);
    boxes.push(box);
  }
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  return {
    x,
    y,
    width: Math.min(VIEWPORT.width - x, right - left + padding * 2),
    height: Math.min(VIEWPORT.height - y, bottom - top + padding * 2),
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
