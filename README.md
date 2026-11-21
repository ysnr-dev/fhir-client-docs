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

`npm run shots -- all` で全シーンを撮り直せます。写真は `docs/manual/img/<シーン名>/` に書き出されます。写っている患者・職員・医療機関はすべて架空です。

## 撮影用のデータ

写真に写す架空の患者・職員・病棟は、fhir-client のデモ投入ツールのシナリオ `manualShots` で開発環境に作ります。
何度流しても二重にはなりません。撮影はブラウザの時計を 2027-02-01 に合わせて行うので、入院などの日付はこの日が基準です。

```bash
cd ../fhir-client
docker compose exec frontend npx vite build --config scripts/demo-seed.vite.config.ts
cd frontend
set -a; . ../../fhir-client-docs/.env; set +a
DEMO_SEED_LOGIN=$SHOTS_DOCTOR_LOGIN DEMO_SEED_PASSWORD=$SHOTS_DOCTOR_PASSWORD \
MANUAL_SHOTS_PASSWORD=$SHOTS_PHARMACIST_PASSWORD \
  node scripts/dist/demo-seed.mjs --target dev --only manualShots
```

`MANUAL_SHOTS_PASSWORD` は撮影用の職員(薬剤師など)のログインのパスワードです。先に `.env` の `SHOTS_PHARMACIST_PASSWORD` に決めておきます。
