// 撮影用の注釈。画面の上に赤枠と、その左外に番号の丸を重ね、撮ったあと clearMarks で外す。
// 色は写真の中だけで使うので、アプリのテーマに関わらず固定にする。
const COLOR = "#e5484d";
const PADDING = 4;

export async function mark(page, locator, { label } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`注釈を付ける場所が見つかりません: ${locator}`);
  await page.evaluate(
    ({ box, label, color, padding }) => {
      const left = box.x + window.scrollX - padding;
      const top = box.y + window.scrollY - padding;
      const frame = document.createElement("div");
      frame.dataset.shotMark = "";
      Object.assign(frame.style, {
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: `${box.width + padding * 2}px`,
        height: `${box.height + padding * 2}px`,
        border: `3px solid ${color}`,
        borderRadius: "6px",
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.body.append(frame);
      if (label == null) return;
      const badge = document.createElement("div");
      badge.dataset.shotMark = "";
      badge.textContent = label;
      Object.assign(badge.style, {
        position: "absolute",
        left: `${Math.max(0, left - 30)}px`,
        top: `${top + (box.height + padding * 2) / 2 - 12}px`,
        minWidth: "24px",
        height: "24px",
        padding: "0 6px",
        borderRadius: "12px",
        background: color,
        color: "#fff",
        font: "700 14px/24px sans-serif",
        textAlign: "center",
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.body.append(badge);
    },
    { box, label: label == null ? null : String(label), color: COLOR, padding: PADDING },
  );
}

export async function clearMarks(page) {
  await page.evaluate(() => document.querySelectorAll("[data-shot-mark]").forEach((el) => el.remove()));
}
