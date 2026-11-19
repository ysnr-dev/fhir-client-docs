# CLAUDE.md

電子カルテ(`../fhir-client`)の利用者向けの資料。業務フローと、画面写真付きの操作マニュアルを MkDocs(Material)で
GitHub Pages に公開する。読み手は医療機関の利用者と運用を検討する人。院内の開発者向けの「シーケンス図」の部も同じサイトに置く。

## 構成

```
docs/                 公開する文書(MkDocs の docs_dir)
  index.md            はじめに
  flows/              業務フロー(scripts/sync-flows.mjs が ../fhir-client から写す。直接編集しない)
  dev/                シーケンス図(同じく写す。直接編集しない)
  manual/             操作マニュアル(画面・業務ごと)
    img/<シーン名>/   画面写真(shots/ が書き出す。手で置かない)
  stylesheets/extra.css
shots/                画面写真の撮影(Playwright)
  run.mjs             npm run shots -- <シーン名>
  lib/session.mjs     画面の大きさ・倍率・テーマ・ログイン・撮影
  lib/marks.mjs       赤枠と番号の注釈
  scenes/<シーン名>.mjs  1 ページぶんの撮影手順
scripts/sync-flows.mjs  業務フローの取り込み
mkdocs.yml            サイトの設定と目次(nav。業務フローの部分は sync-flows が作り直す)
.github/workflows/pages.yml  main への push で Pages に公開
```

## 書き方

- 業務フローと操作マニュアルは業務の言葉で書く。FHIR のリソース名・API のパス・ソースのファイル名・設定のキー・
  テンプレートのコードなど、開発者向けの内容は載せない。開発者向けの内容は「シーケンス図」の部(`docs/dev/`)にだけ置く。
- 画面の文言(ボタン・項目・メニュー)は画面の表記どおりに「」で囲む。
- 操作マニュアルは「写真 → 番号付きの手順」の順に書き、写真の番号の丸と手順の番号をそろえる。
- 操作マニュアルのページを足したら `mkdocs.yml` の `nav` と `manual/index.md` の一覧の両方に 1 行足す。
- 画面の仕様の正典は `../fhir-client/docs/features/*.md`。書く前に該当節を読み、実際の画面で確かめる。

## 業務フロー

- `docs/flows/` は `npm run sync-flows` で `../fhir-client/docs/order-flows/*.md` から作る。写すのは冒頭の概要の段落と
  「運用フロー」節だけで、「医療機関の運用を検討する人は」で始まる段落と「開発者向け」節は落とす。
  一覧(`flows/index.md`)と `mkdocs.yml` の目次(`# sync-flows:begin` 〜 `end`)は `readme.md` の表から作る。
- 中身を直すときは fhir-client 側の文書を直してから写し直す。こちらの `docs/flows/` を手で直さない。
- 開発者向けの記述(ほかの設計文書へのリンク・URL のパス・テンプレートのコード・seed・「開発者」)が残っていると、
  何も書かずに止まる。fhir-client 側の書き方の決まりは `../fhir-client/docs/order-flows/readme.md`。
- 「開発者向け」節は `docs/dev/` に写す。fhir-client の設計文書を出典として示す記述(開発者向けの案内の段落と、本文の
  「([設計文書](../x.md) §1)」の括弧書き)は載せない。それ以外の形で設計文書を指していると止まる。
  業務フローの文書へのリンクは、先が「開発者向け」節の見出しならシーケンス図のページへ、それ以外は `../flows/` へ向ける。
- 写すときに、図の区画(`subgraph`)の名前から部署のラベルを冒頭に並べ、1 列目の見出しが「状態」の表の状態を色付きのラベルにする。
  色は `sync-flows.mjs` の `ROLE_TONES`(部署)と `STATE_TONES`(状態)。一覧に無い状態が出たら止まるので、`STATE_TONES` に足す。
- 図は本文の幅に縮めて描き、クリックで画面全体に元の大きさで拡大する(`docs/javascripts/mermaid-config.js`)。
  Mermaid は `mkdocs.yml` の `extra_javascript` で版を固定して読み込んでいる。

## 画面写真

- 撮影は `../fhir-client` の開発環境(docker compose)を起動してから行う。既定の撮影先は `http://localhost:5173`。
- 写すのは架空の患者・職員・医療機関だけ。リポジトリは公開なので、写真に写るものはすべて誰でも見られる。
  撮影に使う患者はシーンの中で名前を明示して開き、検索結果や一覧に別の患者が写り込まないようにする。
- 撮影のアカウントは役割ごと(doctor / nurse / pharmacist)に `.env` に書く(`.env.example` 参照、`.env` は git 管理外)。
- 写真は手で加工しない。直すときはシーンを直して撮り直す。画面が変わったら、そのページのシーンを流し直す。
- 画面の大きさ 1440×900・倍率 2・ダークテーマ・Asia/Tokyo は `lib/session.mjs` で固定している。変えると全写真の撮り直しになる。
- 写真は WebP(品質 85)。範囲は `shot(name, { target })` で必要な部分に絞り、画面全体は必要なときだけにする。

## 確認コマンド

```bash
docker compose up -d docs                                   # http://localhost:8000/fhir-client-docs/ でプレビュー
npm run sync-flows                                          # 業務フローを fhir-client から写し直す
docker compose run --rm docs build --strict                 # 公開と同じビルド(リンク切れで失敗する)
npm run shots -- <シーン名>                                   # 画面写真を撮り直す
```

- `npm install` のあと、初回だけ `npx playwright install chromium` が要る。
- 業務フローの Mermaid 図はプレビューで描画を確かめる。

## 作業の進め方

- **ユーザーの指示があるまで git commit しない。**
- コミットメッセージは日本語で `feat:` / `fix:` / `change:` / `style:` / `refactor:` / `chore:` / `docs:` / `remove:` 接頭辞のワンライナー。
- `../fhir-client` の画面や文書の不備に気づいたら、こちらで言い換えて済ませず、ユーザーに伝える。
