// fhir-client の業務フロー(docs/order-flows/*.md)から、冒頭の概要と「運用フロー」節を docs/flows/ に写す。
// 一覧(docs/flows/index.md)と mkdocs.yml の目次も、fhir-client の docs/order-flows/readme.md の表から作り直す。
// 写すときに、図の区画から拾った部署を冒頭に、状態の表(1 列目の見出しが「状態」)の状態を色付きのラベルにする。
// 使い方: npm run sync-flows(fhir-client の場所は FHIR_CLIENT_DIR、既定は ../fhir-client)
// 開発者向けの記述が残っていたら何も書かずに止まる。直すのは fhir-client 側の文書。
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = path.resolve(ROOT, process.env.FHIR_CLIENT_DIR || "../fhir-client", "docs/order-flows");
const OUT = path.join(ROOT, "docs/flows");
const MKDOCS = path.join(ROOT, "mkdocs.yml");

const OPS_HEADING = "## 運用フロー";
const DEV_HEADING = "## 開発者向け";
const DEV_PARAGRAPH = "医療機関の運用を検討する人は";
const NAV_BEGIN = "# sync-flows:begin";
const NAV_END = "# sync-flows:end";
const INDEX_LEAD = "オーダーの種別ごとに、登録から実施・結果の確認までの流れを図で示します。";

// 写した文書に残っていてはいけない記述。
const FORBIDDEN = [
  [/開発者/, "開発者向けの節を指している"],
  [/\]\(\.\.\//, "docs/ のほかの文書へのリンク"],
  [/`\/[\w-]/, "画面の URL のパス"],
  [/`[A-Z][A-Z0-9]*_[A-Z0-9_]+`/, "テンプレートなどのコード"],
  [/\bseed\b|db:seed/, "seed"],
];

const readme = await readFile(path.join(SOURCE, "readme.md"), "utf8");
const entries = [...readme.matchAll(/^\| \[([\w-]+\.md)\]\(\1\) \| (.+?) \|$/gm)].map(([, file, summary]) => {
  const match = summary.match(/^(.+?)\((.+)\)$/);
  return { file, name: match ? match[1] : summary, summary: match ? match[2] : "" };
});
if (entries.length === 0) throw new Error(`${SOURCE}/readme.md に文書の表が見つかりません`);

// 状態のラベルの色。表に一覧に無い状態が出たら止まるので、ここに足す。
const STATE_TONES = {
  waiting: ["依頼済", "申込済", "予約済", "入院予定", "下書き", "処方済"],
  active: ["受付済", "対応中", "介入中", "実施中", "適用中", "進行中", "入室中", "診察中", "入院中", "計画中", "治療中", "承認済", "払出済", "出庫済"],
  hold: ["照会中・処方変更待ち", "中断", "休止", "一時終了"],
  done: ["調剤済", "実施済", "回答済", "報告済", "検査済", "終了", "完了", "診療済", "退院"],
  stop: ["中止", "取消", "却下", "廃止", "未来院", "入院予定取消", "入院取消"],
};
const STATE_TONE = new Map(Object.entries(STATE_TONES).flatMap(([tone, words]) => words.map((w) => [w, tone])));

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

const docs = new Map();
for (const entry of entries) {
  docs.set(entry.file, parse(entry.file, await readFile(path.join(SOURCE, entry.file), "utf8")));
}

const problems = [];
const outputs = new Map();
for (const [file, doc] of docs) outputs.set(file, render(file, doc, problems));
if (problems.length > 0) {
  console.error(`開発者向けの記述が残っています(${problems.length} 件)。fhir-client 側の文書を直してください。`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

for (const file of await readdir(OUT)) {
  if (file.endsWith(".md") && file !== "index.md" && !docs.has(file)) await rm(path.join(OUT, file));
}
for (const [file, body] of outputs) await writeFile(path.join(OUT, file), body);
await writeFile(path.join(OUT, "index.md"), renderIndex());
await writeFile(MKDOCS, renderNav(await readFile(MKDOCS, "utf8")));
console.log(`${outputs.size} 件の業務フローを ${path.relative(ROOT, OUT)}/ に写しました`);

function parse(file, text) {
  const lines = text.split("\n").map((value, i) => ({ n: i + 1, value }));
  if (!lines[0].value.startsWith("# ")) throw new Error(`${file}: 1 行目が見出しではありません`);
  const ops = lines.findIndex((l) => l.value === OPS_HEADING);
  if (ops < 0) throw new Error(`${file}: 「${OPS_HEADING}」がありません`);
  const dev = lines.findIndex((l) => l.value === DEV_HEADING);
  return {
    title: lines[0].value.slice(2).trim(),
    intro: paragraphs(lines.slice(1, ops)).filter((p) => !p[0].value.startsWith(DEV_PARAGRAPH)),
    body: lines.slice(ops + 1, dev < 0 ? lines.length : dev),
  };
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

function render(file, doc, problems) {
  // 注記は見出しの後に置く(先頭に置くと MkDocs が見出しを題名として拾わない)。
  const out = [
    `# ${doc.title}`,
    "",
    `<!-- ../fhir-client/docs/order-flows/${file} から scripts/sync-flows.mjs で作る。直接編集しない。 -->`,
    "",
  ];
  for (const paragraph of doc.intro) {
    for (const line of paragraph) out.push(rewrite(file, line, problems));
    out.push("");
  }
  const roles = rolesOf(doc.body);
  if (roles.length > 0) {
    const chips = roles.map((role) => `<span class="chip role-${roleTone(role)}">${role}</span>`);
    out.push(`<p class="roles" aria-label="登場する部署">${chips.join(" ")}</p>`, "");
  }
  const body = trimBlank(doc.body);
  let fenced = false;
  let stateTable = false;
  body.forEach((line, i) => {
    if (line.value.startsWith("```")) fenced = !fenced;
    let value = rewrite(file, line, problems);
    if (!fenced) {
      if (isStateTableHeader(line.value, body[i + 1]?.value)) stateTable = true;
      else if (!line.value.startsWith("|")) stateTable = false;
      else if (stateTable && !isTableSeparator(line.value)) value = stateChip(file, line, value, problems);
    }
    // 「運用フロー」節の中の見出しを 1 段上げる(### → ##)。
    out.push(!fenced && /^#{3,6} /.test(value) ? value.slice(1) : value);
  });
  return `${out.join("\n").trimEnd()}\n`;
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

function stateChip(file, line, value, problems) {
  return value.replace(/^\|\s*([^|]+?)\s*\|/, (whole, state) => {
    const tone = STATE_TONE.get(state);
    if (!tone) {
      problems.push(`${file}:${line.n}: 状態の色が決まっていない(sync-flows.mjs の STATE_TONES に足す): ${state}`);
      return whole;
    }
    return `| <span class="chip state-${tone}">${state}</span> |`;
  });
}

function rewrite(file, line, problems) {
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(line.value)) problems.push(`${file}:${line.n}: ${reason}: ${line.value.trim().slice(0, 80)}`);
  }
  return line.value.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, text, target) => {
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

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].value.trim() === "") start += 1;
  while (end > start && lines[end - 1].value.trim() === "") end -= 1;
  return lines.slice(start, end);
}

function renderIndex() {
  const rows = entries.map((e) => `| [${e.name}](${e.file}) | ${e.summary} |`);
  return [
    "# 業務フロー",
    "",
    "<!-- scripts/sync-flows.mjs が ../fhir-client/docs/order-flows/readme.md から作る。直接編集しない。 -->",
    "",
    INDEX_LEAD,
    "",
    "| 業務フロー | 内容 |",
    "|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function renderNav(yaml) {
  const lines = yaml.split("\n");
  const begin = lines.findIndex((l) => l.trim() === NAV_BEGIN);
  const end = lines.findIndex((l) => l.trim() === NAV_END);
  if (begin < 0 || end < begin) throw new Error(`mkdocs.yml に「${NAV_BEGIN}」「${NAV_END}」の目印がありません`);
  const indent = lines[begin].match(/^\s*/)[0];
  const nav = entries.map((e) => `${indent}- ${e.name}: flows/${e.file}`);
  return [...lines.slice(0, begin + 1), ...nav, ...lines.slice(end)].join("\n");
}
