# fhir-client-docs

電子カルテ(fhir-client)の業務フローと操作マニュアルです。MkDocs(Material)で GitHub Pages に公開します。

公開先: https://ysnr-dev.github.io/fhir-client-docs/

## プレビュー

```bash
docker compose up -d docs
```

http://localhost:8000/fhir-client-docs/ で確認できます。

## 業務フローの取り込み

業務フローは fhir-client の `docs/order-flows/` から写します。fhir-client を隣のディレクトリに置いて次を実行します。

```bash
npm run sync-flows
```

## 画面写真の撮影

fhir-client の開発環境を起動しておき、次を実行します。

```bash
npm install
npx playwright install chromium   # 初回だけ
cp .env.example .env              # 撮影に使うアカウントを書く
npm run shots -- login
```

写真は `docs/manual/img/<シーン名>/` に書き出されます。写っている患者・職員・医療機関はすべて架空です。
