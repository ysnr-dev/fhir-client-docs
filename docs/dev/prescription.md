# 処方オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/prescription.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[処方オーダーの業務フロー](../flows/prescription.md)にあります。

## シーケンス図の前提

- **書き込みの経路**: `/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
- **上流**: 上流の FHIR サーバーです。図では「上流 FHIR」と書きます。
- **応答の中継**: 上流の応答も backend を通って画面へ戻ります。図では省いて、上流から画面へ直接返す矢印で描きます。
- **SS-MIX2**: 有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`)。
- **楽観ロック**: 版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。
- **ヘッダ**: 処方 1 件を表す `ServiceRequest` です。薬剤の行は `MedicationRequest` です。
- **進捗 Task・監査 Task**: 薬剤部の作業の状態を持つ Task(`rx-dispense`)と、処方監査を待つ Task(`rx-verification`)です。
- **CDS カード**: 外部の判断支援(CDS Hooks)が返す指摘です。カルテの処方カードとは別のものです。「運用フロー」節の「外部の判断支援」に当たります。
- **図の登場者**: 「運用フロー」節の部署(医師・薬剤部・病棟)に合わせています。薬剤部は薬剤師、病棟は看護師です。

## リソースの構成

- ヘッダ `ServiceRequest`(処方 1 件)
  - `MedicationRequest`(薬剤の行。`basedOn` でヘッダを指す)
    - `MedicationDispense`(調剤登録。`authorizingPrescription` で薬剤の行を指す)
  - 進捗 Task(`rx-dispense`。`focus` でヘッダを指す)
  - 監査 Task(`rx-verification`。院内の処方だけ)
  - 照会の Task(`rx-inquiry`)と回答の通知の Task(`rx-inquiry-answered`)
  - 与薬の記録のハブ `Procedure`(`basedOn` でヘッダを指す)
    - `MedicationAdministration`(与薬した薬剤。`partOf` でハブを指す)

| リソース | 要素 | 中身 |
|---|---|---|
| ヘッダ `ServiceRequest` | `category` | 先頭から、オーダー種別 `order-type|prescription`、入外区分(v3 ActCode の `IMP` / `AMB`)、処方区分(`prescription-category`) |
| ヘッダ `ServiceRequest` | `orderDetail` の拡張 | 薬剤の行への参照(`prescription-medication-request`) |
| ヘッダ `ServiceRequest` | `encounter` | 入院中に登録した処方の入院 |
| ヘッダ `ServiceRequest` | `status` | 中止で `revoked`、中止取消で `active` |
| `MedicationRequest` | `identifier` | RP の番号 |
| `MedicationRequest` | `status` | 中止で `cancelled`、中止取消で `active` |
| `Provenance` | `target` | ヘッダ。登録(CREATE)と編集(UPDATE)のたびに 1 件 |

## 進捗 Task(`rx-dispense`)

Task は登録時には作りません。**Task が無いオーダーは依頼済**として扱い、最初のステータス変更で作ります。
与薬では動きません。

| 状態 | `Task.status` |
|---|---|
| <span class="chip state-waiting">依頼済</span> | `requested`(または Task 無し) |
| <span class="chip state-active">受付済</span> | `accepted` |
| <span class="chip state-hold">照会中・処方変更待ち</span> | `on-hold` + `statusReason` |
| <span class="chip state-done">調剤済</span> | `in-progress` |
| <span class="chip state-done">実施済</span> (作る操作なし) | `completed` |
| <span class="chip state-stop">中止</span> | `cancelled` |

- `completed`(実施済)にする操作は、処方にはまだありません。一覧の表示だけが対応しています。
- 調剤済は `in-progress` です。注射の払出済と同じ値です。

## 部品

| 操作 | 画面 | 組み立て | hook |
|---|---|---|---|
| 登録 | `components/PrescriptionForm.tsx`・`PrescriptionPanels.tsx` | `fhir/prescriptionHelpers.ts` | `useCreatePrescription` |
| 編集 | `PrescriptionEditPanel` | 同上 | `useUpdatePrescription` |
| 削除 | カルテのカード | `postOrderDeleteBundle`(`api/queries/orderDelete.ts`) | 同左 |
| 取消・中止・中止取消 | `pages/RxWorklistPage.tsx` | `buildRxTaskUpdate`・`rxOrderCancelEntries` | `useUpdateRxTaskStatus` |
| 処方監査 | `pages/RxVerificationPage.tsx`・`components/RxVerificationModal.tsx` | `fhir/rxVerificationHelpers.ts` | `useCompleteRxVerification` |
| 処方箋発行 | `pages/RxWorklistPage.tsx`・`components/RxBatchIssueModal.tsx` | backend の帳票 | `useUpdateRxTaskStatus`・`useIssuePrescriptions` |
| 疑義照会 | `components/RxInquiryModal.tsx`・`RxInquirySection.tsx` | `fhir/rxInquiryHelpers.ts` | `useWriteRxInquiry` |
| 調剤登録 | `components/RxDispenseModal.tsx` | `fhir/rxDispenseHelpers.ts` | `useRegisterRxDispense` |
| 与薬 | `components/OralPerformModal.tsx`・`VitalFlowsheetPanel.tsx` | `fhir/oralPerformHelpers.ts` | `useRegisterOralPerform`・`useCancelOralPerforms` |

hook の置き場所は名前と合っていません。

- `useCreatePrescription`・`useUpdatePrescription` は `api/queries/labResult.ts` にあります。名前は処方由来ですが、全種別の登録・編集が通ります。
- `useUpdateRxTaskStatus`・`useIssuePrescriptions`・`useRegisterRxDispense` は `api/queries/injection.ts` にあります。
- `useRegisterOralPerform`・`useCancelOralPerforms` は `api/queries/encounter.ts` にあります。

## 登録

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant CDS as 外部 CDS
  participant FHIR as 上流 FHIR

  Dr->>UI: 医薬品・用法・用量を入力
  UI->>UI: 薬剤の警告を判定して行に表示
  opt order-select のサービスがある
    UI->>BE: order-select を依頼(入力の 1 秒後)
    BE->>CDS: order-select
    CDS-->>BE: CDS カード
    BE-->>UI: CDS カード(失敗は空)
  end
  Dr->>UI: 登録
  UI->>UI: 入力検証
  opt order-sign のサービスがある
    UI->>BE: order-sign を依頼
    BE->>CDS: order-sign
    CDS-->>BE: CDS カード
    BE-->>UI: CDS カード(失敗は空)
  end
  opt 確認を要する警告か CDS カードがある
    UI-->>Dr: 確認モーダル
    Dr->>UI: 理由を選んで登録
    UI-)BE: CDS カードの無視を記録
  end
  UI-)BE: 警告の台帳に記録
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  UI->>UI: 一覧・カード・通知を読み直す
```

`-)` の矢印は応答を待たない送信です。失敗しても登録は続けます。

| backend への依頼 | パス |
|---|---|
| order-select | `POST /integrations/cds/order_select` |
| order-sign | `POST /integrations/cds/order_sign` |
| CDS カードの無視 | `POST /integrations/cds/feedback` |
| 警告の台帳(発火・無視) | `POST /master/advisory_events` |

| transaction で書くもの | 条件 |
|---|---|
| ヘッダ `ServiceRequest` + `MedicationRequest` × 薬剤数 | いつも |
| `Provenance`(CREATE) | いつも |
| 監査 Task `rx-verification`(未監査) | 院内の処方 |
| Task `order-approval` | 代行入力・研修医 |
| 警告の無視の `Provenance` | 確認モーダルで理由を選んだ |
| 届出の通知の Task | 特定抗菌薬を含む |
| `MedicationStatement` の更新 | 持参薬の継続 |

## 編集・削除

編集です。登録と同じ警告の判定と order-sign を通ります(図では省いています)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: カードの「編集」
  UI->>BE: GET /fhir(オーダー一式)
  BE->>FHIR: 検索
  FHIR-->>UI: ヘッダ・薬剤の行・Task
  Dr->>UI: 内容を変えて更新
  UI->>BE: GET /fhir(既存の監査 Task)
  BE->>FHIR: 検索
  FHIR-->>UI: Task rx-verification
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果(版違いは 412)
```

| transaction で書くもの | 条件 |
|---|---|
| PUT `ServiceRequest`・`MedicationRequest` | いつも |
| POST 追加した薬剤の行 / DELETE 消した薬剤の行 | 行を足した・消した |
| `Provenance`(UPDATE) | いつも |
| 監査 Task `rx-verification` を未監査へ | 監査 Task がある |
| 進捗 Task を受付済へ | 処方変更待ちのとき |

削除です。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: カードの「削除」と理由
  UI->>BE: GET /fhir(オーダーを指す記録)
  BE->>FHIR: 検索
  FHIR-->>UI: Task・調剤の記録・与薬の記録
  alt 与薬の記録がある
    UI-->>Dr: 削除できない(与薬を取り消す)
  else 与薬の記録が無い
    UI->>BE: POST /fhir(transaction)
    BE->>BE: 削除の来歴を Bundle に足す
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

transaction は `ServiceRequest`・`MedicationRequest`・Task・`MedicationDispense` の DELETE です。

## 中止・中止取消

処方一覧の行のメニューの「取消」「中止」「中止取消」は、同じ hook(`useUpdateRxTaskStatus`)で書きます。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 行のメニューの「中止」
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果(版違いは 412)
```

| 操作 | 進捗 Task | `ServiceRequest` | `MedicationRequest` |
|---|---|---|---|
| 中止 | `cancelled` | `revoked` | `cancelled` |
| 中止取消 | `requested` | `active` | `active` |
| 取消 | 1 つ前の状態 | 変えない | 変えない |

- オーダーの `status` を揃えるのは `rxOrderCancelEntries` です。
- 化学療法の投与日の内服は、中止・中止取消だけ別の書き込みになります([化学療法のシーケンス図](chemotherapy.md)「[投与日の中止・中止取消](chemotherapy.md#投与日の中止中止取消)」)。

## 処方監査

処方一覧の「監査」からも同じモーダルが開きます。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 処方監査の未監査タブ
  UI->>BE: GET /fhir(未監査の監査 Task)
  BE->>FHIR: 検索
  FHIR-->>UI: 未監査の Task
  Ph->>UI: 監査を開く
  UI->>BE: GET /fhir(処方・患者の状態)
  BE->>FHIR: 検索
  FHIR-->>UI: 処方・照会の履歴・患者の状態
  UI-->>Ph: 内容と登録時と同じ警告
  Ph->>UI: 問題なし、または介入あり
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

- 未監査の検索は Task `rx-verification` の `requested` です。患者の状態はアレルギーと検査値です。
- 介入ありでは、介入の種別・内容・処方医の対応を入れます。
- transaction は監査 Task の PUT です。`status = completed`、`owner` = 薬剤師、`output` = 監査結果を書きます。
- 問題なしでも介入ありでも監査済になり、進捗 Task は動きません。

## 処方箋発行

PDF の生成は上流を読むだけです。再発行は同じ PDF を刷り、進捗を動かしません。

行の「処方箋発行」です。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 処方箋発行
  par PDF を新しいタブで開く
    UI->>BE: GET 処方箋の PDF
    BE->>FHIR: batch Bundle(オーダー一式と自院)
    FHIR-->>BE: 処方一式
    BE-->>UI: PDF
  and 進捗を受付済へ
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

- PDF は `GET /reports/prescriptions/:order_id/pdf` です。
- transaction は進捗 Task `rx-dispense` を `accepted` にします。

「処方箋一括発行」(病棟)です。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 病棟を選んで発行
  UI->>BE: GET /fhir(1 日ぶんを読み直す)
  BE->>FHIR: 検索
  FHIR-->>UI: 最新の一覧
  UI->>BE: POST 処方箋の PDF(一括)
  BE->>FHIR: batch Bundle
  FHIR-->>BE: 処方一式
  BE-->>UI: PDF
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

- PDF は `POST /reports/prescriptions/pdf`(`order_ids`)です。
- transaction は、依頼済の行の進捗 Task をまとめて `accepted` にします。

## 疑義照会

照会です。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 疑義照会(照会内容)
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

回答です。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: 通知かカードから回答
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  UI-->>Ph: 回答の通知(ベル)
  opt 回答が「処方を変更する」
    Dr->>UI: 右ペインで処方を編集して保存
    Note over UI,FHIR: 編集の transaction(「編集・削除」の表)
  end
```

取下げは、薬剤部が同じ「疑義照会」から行います。流れは照会と同じで、transaction の中身だけが違います。

| 操作 | 照会の Task `rx-inquiry` | 進捗 Task | ほかに書くもの |
|---|---|---|---|
| 照会 | POST(`owner` = 処方医) | `on-hold`(照会中) | |
| 回答(処方どおり・薬剤部で変更してよい) | `completed`(`output` に回答) | `accepted` | POST Task `rx-inquiry-answered`(宛先 = 薬剤師) |
| 回答(処方を変更する) | `completed`(`output` に回答) | `on-hold`(処方変更待ち) | POST Task `rx-inquiry-answered`(宛先 = 薬剤師) |
| 取下げ | `cancelled` | `accepted` | |

「処方を変更する」のあとの編集の transaction が、進捗 Task を `accepted` に、監査 Task を未監査に戻します。

## 調剤登録

「調剤登録」は受付済の行にだけ出ます。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 調剤登録
  UI->>BE: GET /fhir(オーダーを指す Task)
  BE->>FHIR: 検索
  FHIR-->>UI: 照会の履歴・未確認の回答の通知
  UI->>BE: GET /master/...(投与量換算)
  BE-->>UI: 換算マスタ
  UI-->>Ph: 処方の内容を初期値に表示
  Ph->>UI: 銘柄・数量を確かめて登録
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

- Task の検索は `focus` がこのオーダーの Task で、照会の履歴と未確認の回答の通知を取り出します。
- 初期値では、力価の量を換算マスタで製剤数に直します。

| transaction で書くもの | 条件 |
|---|---|
| POST `MedicationDispense` × 薬剤数 | いつも |
| 進捗 Task を `in-progress`(調剤済) | いつも |
| 回答の通知を `completed` | 未確認の回答の通知がある |

## 与薬

調剤済かどうかに関わらず記録でき、進捗 Task は動きません。

与薬入力です。

```mermaid
sequenceDiagram
  autonumber
  actor Ns as 病棟
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ns->>UI: 経過表を開く
  UI->>BE: GET /fhir(入院の処方・与薬の記録)
  BE->>FHIR: 検索
  FHIR-->>UI: 処方・Procedure・進捗 Task
  UI->>UI: 用法と施設の時刻から予定枠を出す
  Ns->>UI: 予定枠の「与薬入力」
  Ns->>UI: 与薬、または与薬せずで登録
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

予定枠は、用法コードと施設設定の時刻から展開します。

| 結果 | transaction で書くもの |
|---|---|
| 与薬 | POST `Procedure`(`completed`、予定枠の拡張)+ POST `MedicationAdministration` × 与薬した薬剤 |
| 与薬せず | POST `Procedure`(`not-done`、理由) |

与薬取消です。

```mermaid
sequenceDiagram
  autonumber
  actor Ns as 病棟
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ns->>UI: 記録済みの枠の「与薬取消」
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

transaction は `MedicationAdministration`、`Procedure` の順の DELETE です。

## 医事会計と SS-MIX2

医事会計(`BillingClaimBuilder`)は、処方を実施記録からではなくオーダーから送ります。SS-MIX2 の括弧内はデータ種別、INS / DEL は処理区分です。

| 起きたこと | 医事会計 | SS-MIX2 |
|---|---|---|
| 登録・編集 | オーダーの日付(`occurrenceDateTime`)の会計で、RP 1 つを 1 剤で送る | RDE^O11(OMP-01) |
| 削除 | 対象から外れる | RDE^O11 の `CA`(DEL) |
| 中止 | 対象から外れる(`ServiceRequest` が `revoked`) | RDE^O11 の `CA`(DEL) |
| 中止取消 | 対象に戻る | RDE^O11 の `NW`(INS) |
| 与薬・与薬せず | 送らない | RAS^O17(OMP-11) |
| 与薬取消 | 送らない | RAS^O17 の `CA`(DEL) |

- 剤の区分は内服・頓用・外用で、内服は投与日数、頓用は投与回数を送ります。外用は日数を送りません。
- 院内・院外の区別を付けて送ります。
- 処方区分が持参の処方は送りません(送れない項目にも出しません)。
- 注射・注入の用法の RP と、レセプト電算コードを引けない薬剤は「送れない項目」に出します。一般名処方は、代表の銘柄のコードに一般名の印を付けて送ります。
- 会計を送ったあとの中止・編集は、医事課が送り直します。
- 処方監査・疑義照会・調剤登録は、医事会計にも SS-MIX2 にも出しません(Task と `MedicationDispense` はメッセージにしません)。
