// fhir-client の業務フロー(docs/order-flows/*.md)をサイトに写す。
// - 業務フロー(docs/flows/): 冒頭の概要と「運用フロー」節。開発者向けの記述が残っていたら何も書かずに止まる。
// - シーケンス図(docs/dev/): 「開発者向け」節。fhir-client の設計文書を出典として示す記述(開発者向けの案内の段落と、
//   本文の「([設計文書](../x.md) §1)」の括弧書き)は載せない。設計文書へのリンクが残っていたら止まる。
// 一覧のページと mkdocs.yml の目次も、fhir-client の docs/order-flows/readme.md の表から作り直す。
// 写すときに、図の区画から拾った部署を冒頭に、状態の表(1 列目の見出しが「状態」)の状態を色付きのラベルにする。
// 使い方: npm run sync-flows(fhir-client の場所は FHIR_CLIENT_DIR、既定は ../fhir-client)
// 直すのは fhir-client 側の文書。
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = path.resolve(ROOT, process.env.FHIR_CLIENT_DIR || "../fhir-client", "docs/order-flows");
const FLOWS_OUT = path.join(ROOT, "docs/flows");
const DEV_OUT = path.join(ROOT, "docs/dev");
const MKDOCS = path.join(ROOT, "mkdocs.yml");

const OPS_HEADING = "## 運用フロー";
const DEV_HEADING = "## 開発者向け";
const DEV_PARAGRAPH = "医療機関の運用を検討する人は";
const FLOWS_NAV = ["# sync-flows:begin", "# sync-flows:end"];
const DEV_NAV = ["# sync-dev:begin", "# sync-dev:end"];
const FLOWS_LEAD = "オーダーの種別ごとに、登録から実施・結果の確認までの流れを図で示します。";
const DEV_LEAD =
  "院内の開発者向けに、業務フローの操作ごとに画面・backend・上流の FHIR サーバーの間で何が起きるかを示します。" +
  "運用の流れは[業務フロー](../flows/index.md)を読みます。";
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
// 本文の出典の括弧書き。「([設計文書](../x.md))」「([設計文書](../x.md) §1)」。
const CITATION = /\(\[[^\]]*\]\(\.\.\/[^)]*\)[^()]*\)/g;

// 業務フローに残っていてはいけない記述。
const FORBIDDEN = [
  [/開発者/, "開発者向けの節を指している"],
  [/\]\(\.\.\//, "docs/ のほかの文書へのリンク"],
  [/`\/[\w-]/, "画面の URL のパス"],
  [/`[A-Z][A-Z0-9]*_[A-Z0-9_]+`/, "テンプレートなどのコード"],
  [/\bseed\b|db:seed/, "seed"],
];

// 状態のラベルの色。表に一覧に無い状態が出たら止まるので、ここに足す。
const STATE_TONES = {
  waiting: ["依頼済", "申込済", "予約済", "入院予定", "下書き", "処方済"],
  active: ["受付済", "対応中", "介入中", "実施中", "適用中", "進行中", "入室中", "診察中", "入院中", "計画中", "治療中", "承認済", "払出済", "出庫済"],
  hold: ["照会中・処方変更待ち", "中断", "休止", "一時終了"],
  done: ["調剤済", "実施済", "回答済", "報告済", "検査済", "終了", "完了", "診療済", "退院"],
  stop: ["中止", "取消", "却下", "廃止", "未来院", "入院予定取消", "入院取消"],
};
const STATE_TONE = new Map(Object.entries(STATE_TONES).flatMap(([tone, words]) => words.map((w) => [w, tone])));
// 長い語から当てる(「入院予定取消」を「入院予定」と取り違えない)。
const STATE_WORDS = [...STATE_TONE.keys()].sort((a, b) => b.length - a.length);

// 部署のラベルの色。図の区画の名前を上から順に当てはめ、どれにも当たらなければ部門の色にする。
const ROLE_TONES = [
  ["office", /医事|受付|患者|担当者/],
  ["dept", /^部門/],
  ["doctor", /医師|主治医|依頼医|記載医|読影医|治療医|麻酔科/],
  ["nurse", /病棟|看護|外来/],
  ["pharmacy", /薬剤/],
];
// 図の区画のうち、部署ではなく段階を表すもの。
const NOT_ROLES = new Set(["術後"]);

const readme = await readFile(path.join(SOURCE, "readme.md"), "utf8");
const entries = [...readme.matchAll(/^\| \[([\w-]+\.md)\]\(\1\) \| (.+?) \|$/gm)].map(([, file, summary]) => {
  const match = summary.match(/^(.+?)\((.+)\)$/);
  return { file, name: match ? match[1] : summary, summary: match ? match[2] : "" };
});
if (entries.length === 0) throw new Error(`${SOURCE}/readme.md に文書の表が見つかりません`);

const docs = new Map();
for (const entry of entries) {
  docs.set(entry.file, parse(entry, await readFile(path.join(SOURCE, entry.file), "utf8")));
}

const problems = [];
const flowPages = new Map();
const devPages = new Map();
for (const [file, doc] of docs) {
  flowPages.set(file, renderFlow(file, doc, problems));
  devPages.set(file, renderDev(file, doc, problems));
}
if (problems.length > 0) {
  console.error(`写せない記述があります(${problems.length} 件)。fhir-client 側の文書を直してください。`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await writePages(FLOWS_OUT, flowPages, renderIndex("業務フロー", FLOWS_LEAD, entries));
await writePages(DEV_OUT, devPages, renderIndex("シーケンス図", DEV_LEAD, entries));
let yaml = await readFile(MKDOCS, "utf8");
yaml = renderNav(yaml, FLOWS_NAV, entries.map((e) => [e.name, `flows/${e.file}`]));
yaml = renderNav(yaml, DEV_NAV, entries.map((e) => [e.name, `dev/${e.file}`]));
await writeFile(MKDOCS, yaml);
console.log(`業務フロー ${flowPages.size} 件・シーケンス図 ${devPages.size} 件を写しました`);

function parse(entry, text) {
  const { file } = entry;
  const lines = text.split("\n").map((value, i) => ({ n: i + 1, value }));
  if (!lines[0].value.startsWith("# ")) throw new Error(`${file}: 1 行目が見出しではありません`);
  const ops = lines.findIndex((l) => l.value === OPS_HEADING);
  if (ops < 0) throw new Error(`${file}: 「${OPS_HEADING}」がありません`);
  const dev = lines.findIndex((l) => l.value === DEV_HEADING);
  const intro = paragraphs(lines.slice(1, ops));
  return {
    name: entry.name,
    title: lines[0].value.slice(2).trim(),
    intro: intro.filter((p) => !p[0].value.startsWith(DEV_PARAGRAPH)),
    body: lines.slice(ops + 1, dev < 0 ? lines.length : dev),
    devBody: dev < 0 ? [] : lines.slice(dev + 1),
    devAnchors: devAnchorsOf(dev < 0 ? [] : lines.slice(dev + 1)),
  };
}

// 「開発者向け」節の見出しのアンカー(元の文書での名前 → シーケンス図のページでの名前)。
function devAnchorsOf(lines) {
  const anchors = new Map();
  let fenced = false;
  for (const { value } of lines) {
    if (value.startsWith("```")) fenced = !fenced;
    const match = !fenced && value.match(/^#{2,6} (.+)$/);
    if (match) anchors.set(slug(match[1]), slug(devHeading(match[1])));
  }
  return anchors;
}

// GitHub と pymdownx.slugs の見出しのアンカー。記号を落とし、空白をハイフンにする。
function slug(text) {
  return text
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

// ページの題名がシーケンス図なので、見出しの「シーケンス図: 」は外す。
function devHeading(text) {
  return text.replace(/^シーケンス図: /, "");
}

function paragraphs(lines) {
  const result = [];
  let current = [];
  for (const line of lines) {
    if (line.value.trim() === "") {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function renderFlow(file, doc, problems) {
  const rewrite = (line) => rewriteFlowLine(file, line, problems);
  // 注記は見出しの後に置く(先頭に置くと MkDocs が見出しを題名として拾わない)。
  const out = [`# ${doc.title}`, "", `<!-- ../fhir-client/docs/order-flows/${file} から scripts/sync-flows.mjs で作る。直接編集しない。 -->`, ""];
  for (const paragraph of doc.intro) out.push(...paragraph.map(rewrite), "");
  const roles = rolesOf(doc.body);
  if (roles.length > 0) {
    const chips = roles.map((role) => `<span class="chip role-${roleTone(role)}">${role}</span>`);
    out.push(`<p class="roles" aria-label="登場する部署">${chips.join(" ")}</p>`, "");
  }
  out.push(...renderBody(file, doc.body, rewrite, problems));
  return `${out.join("\n").trimEnd()}\n`;
}

function renderDev(file, doc, problems) {
  if (doc.devBody.length === 0) throw new Error(`${file}: 「${DEV_HEADING}」がありません`);
  const rewrite = (line) => rewriteDevLine(file, line, problems);
  const out = [`# ${doc.name}のシーケンス図`, "", `<!-- ../fhir-client/docs/order-flows/${file} から scripts/sync-flows.mjs で作る。直接編集しない。 -->`, ""];
  out.push(`運用の流れは[${doc.title}](../flows/${file})にあります。`, "");
  out.push(...renderBody(file, doc.devBody, rewrite, problems).map((v) => v.replace(/^(#{2,6} )(.+)$/, (_, h, text) => h + devHeading(text))));
  return `${out.join("\n").trimEnd()}\n`;
}

// 節の中身。見出しを 1 段上げ(### → ##)、状態の表にラベルを付ける。
function renderBody(file, lines, rewrite, problems) {
  const body = trimBlank(lines);
  const out = [];
  let fenced = false;
  let stateTable = false;
  body.forEach((line, i) => {
    if (line.value.startsWith("```")) fenced = !fenced;
    let value = rewrite(line);
    if (!fenced) {
      if (isStateTableHeader(line.value, body[i + 1]?.value)) stateTable = true;
      else if (!line.value.startsWith("|")) stateTable = false;
      else if (stateTable && !isTableSeparator(line.value)) value = stateChip(file, line, value, problems);
    }
    out.push(!fenced && /^#{3,6} /.test(value) ? value.slice(1) : value);
  });
  return out;
}

function rolesOf(lines) {
  const roles = [];
  for (const { value } of lines) {
    const match = value.match(/^\s*subgraph\s+\w+\s*\["?([^"\]]+)"?\]/);
    if (match && !NOT_ROLES.has(match[1]) && !roles.includes(match[1])) roles.push(match[1]);
  }
  return roles;
}

function roleTone(role) {
  return ROLE_TONES.find(([, pattern]) => pattern.test(role))?.[0] ?? "dept";
}

function isTableSeparator(value) {
  return /^\|[-| :]+\|$/.test(value.trim());
}

function isStateTableHeader(value, next) {
  return /^\|\s*状態\s*\|/.test(value) && next !== undefined && isTableSeparator(next);
}

// 1 列目の先頭の状態をラベルにする。後ろの補足(「(作る操作なし)」など)は残す。
function stateChip(file, line, value, problems) {
  return value.replace(/^\|\s*([^|]+?)\s*\|/, (whole, cell) => {
    const state = STATE_WORDS.find((word) => cell.startsWith(word));
    if (!state) {
      problems.push(`${file}:${line.n}: 状態の色が決まっていない(sync-flows.mjs の STATE_TONES に足す): ${cell}`);
      return whole;
    }
    const rest = cell.slice(state.length).trim();
    return `| <span class="chip state-${STATE_TONE.get(state)}">${state}</span>${rest ? ` ${rest}` : ""} |`;
  });
}

function rewriteFlowLine(file, line, problems) {
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(line.value)) problems.push(`${file}:${line.n}: ${reason}: ${line.value.trim().slice(0, 80)}`);
  }
  return line.value.replace(LINK, (whole, text, target) => {
    if (/^https?:/.test(target)) return whole;
    const [targetFile] = target.split("#");
    const linked = docs.get(targetFile);
    if (!linked) {
      problems.push(`${file}:${line.n}: 業務フロー以外へのリンク: ${target}`);
      return whole;
    }
    // ファイル名のままのリンクの文字は、リンク先の文書の題名にする。
    return `[${text.endsWith(".md") ? linked.title : text}](${target})`;
  });
}

// 出典の括弧書きを落とし、業務フローの文書どうしのリンクは、先が「開発者向け」節の見出しならシーケンス図のページへ、
// それ以外は業務フローのページへ向ける。
function rewriteDevLine(file, line, problems) {
  if (/`(docs\/)?[\w./-]+\.md`/.test(line.value)) {
    problems.push(`${file}:${line.n}: 文書の名前(出典は「([設計文書](../x.md) §1)」の括弧書きにする): ${line.value.trim().slice(0, 80)}`);
  }
  return line.value.replace(CITATION, "").replace(LINK, (whole, text, target) => {
    if (/^https?:/.test(target)) return whole;
    const [targetFile, anchor] = target.split("#");
    const linked = docs.get(targetFile);
    if (linked) {
      const label = text.endsWith(".md") ? linked.title : text;
      if (anchor && linked.devAnchors.has(anchor)) return `[${label}](${targetFile}#${linked.devAnchors.get(anchor)})`;
      return `[${label}](../flows/${targetFile}${anchor ? `#${anchor}` : ""})`;
    }
    problems.push(`${file}:${line.n}: 設計文書へのリンク(出典は「([設計文書](../x.md) §1)」の括弧書きにする): ${target}`);
    return whole;
  });
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].value.trim() === "") start += 1;
  while (end > start && lines[end - 1].value.trim() === "") end -= 1;
  return lines.slice(start, end);
}

async function writePages(dir, pages, index) {
  await mkdir(dir, { recursive: true });
  for (const file of await readdir(dir)) {
    if (file.endsWith(".md") && file !== "index.md" && !pages.has(file)) await rm(path.join(dir, file));
  }
  for (const [file, body] of pages) await writeFile(path.join(dir, file), body);
  await writeFile(path.join(dir, "index.md"), index);
}

function renderIndex(title, lead, rows) {
  return [
    `# ${title}`,
    "",
    "<!-- scripts/sync-flows.mjs が ../fhir-client/docs/order-flows/readme.md から作る。直接編集しない。 -->",
    "",
    lead,
    "",
    "| 業務フロー | 内容 |",
    "|---|---|",
    ...rows.map((e) => `| [${e.name}](${e.file}) | ${e.summary} |`),
    "",
  ].join("\n");
}

function renderNav(yaml, [beginMark, endMark], items) {
  const lines = yaml.split("\n");
  const begin = lines.findIndex((l) => l.trim() === beginMark);
  const end = lines.findIndex((l) => l.trim() === endMark);
  if (begin < 0 || end < begin) throw new Error(`mkdocs.yml に「${beginMark}」「${endMark}」の目印がありません`);
  const indent = lines[begin].match(/^\s*/)[0];
  const nav = items.map(([name, file]) => `${indent}- ${name}: ${file}`);
  return [...lines.slice(0, begin + 1), ...nav, ...lines.slice(end)].join("\n");
}
