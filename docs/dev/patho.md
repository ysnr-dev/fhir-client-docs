# 病理検査オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/patho.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[病理検査オーダーの業務フロー](../flows/patho.md)にあります。

## リソースの構成

オーダーは 2 層です。ヘッダの `ServiceRequest`(`order-type|pathology`、`code` = 検査区分 LPATHO001)← `basedOn` ── 検体明細(contained `Specimen`)です。検査項目の層はありません(`fhir/pathoOrderHelpers.ts`)。
ヘッダは拡張 `patho-clinical-info`(臨床経過)・`patho-clinical-info-questionnaire-response`(テンプレートの回答)・`patho-report-due`(報告希望日)・`patho-operating-room`(手術室番号)・`patho-schema-image`(シェーマ、`Binary`)を持ちます。

| もの | リソース | 補足 |
|---|---|---|
| 進捗 | `Task`(`task-code|patho-exam`、`focus` = ヘッダ) | 下の表 |
| 採取の記録 | 検体明細の contained `Specimen` の `collection`(`collectedDateTime`・`quantity`・`bodySite`)と拡張 `patho-container-count` | 明細だけを PUT する(ヘッダを組み直すと依頼医が替わる)。来歴は付けない。`collector` は持たない |
| 容器の台帳 | `Specimen`(`request` = [ヘッダ, 検体明細]、`identifier` = `patho-container`、`accessionIdentifier` = ラベル番号) | `identifier` の値は「検体明細の id:明細内の順番」。発行 = 作成、到着 = `receivedTime` + `status: available`、取り下げ = `entered-in-error`。番号は検体検査の採取管と同じ採番 |
| 病理受付番号 | ヘッダの `identifier`(`IdSystem/patho-accession-number`) | 上流の `ServiceRequest/$next-identifier` で払い出す。編集でも元の値を引き継ぐ |
| 結果 | `DiagnosticReport`(`category` = v2-0074 `SP` / `CP`、`code` = LOINC `11526-1`、`basedOn` = ヘッダ、`status` = `registered` / `preliminary` / `final` / `amended` / `appended`)+ `Observation` | 所見は規約のセクション LOINC を `Observation.code` に使う(肉眼 `22634-0`・顕微鏡 `22635-7`・診断 `22637-3`・追加染色 `10157-6`)。細胞診の診断は `valueCodeableConcept`(判定)+ `component`(推定病変)。`Observation.status` に `appended` は無いので `amended` にする |
| レポートの補足 | `resultsInterpreter`(診断医)、拡張 `patho-report-importance`(重要度)・`patho-follow-up`(フォロー推奨)・`patho-report-image`(画像、`Binary`)・`patho-diagnosis-response`(診断のテンプレートの回答) | 回答はレポートと同じ transaction に積む |
| 結果の検体 | `Specimen`(`type` = 検体タイプ) | 結果側が所有する。ラベルの台帳とは別で、参照しない |
| 検査結果確認の通知 | `Task`(`task-code|result-review`、`focus` = 結果、`owner` = 依頼医) | 確定の報告のとき。重要度ありは `priority = stat`、印は `input` |
| 患者説明 | `Task`(`task-code|result-explanation`、`focus` = 結果、`owner` = 依頼医) | `completed` で記録済。対応と説明日は `output`。通知のレジストリには載せない |
| フォロー推奨 | `Task`(`task-code|followup-recommendation`、`focus` = 結果、`owner` = 依頼医) | 読影・所見レポートと同じ |
| 確認(既読) | `Provenance`(`target` = 結果、`agent.type = verifier`、`signature`) | 検体検査と同じ |
| 代行入力 | `Provenance`(`target` = ヘッダ、`activity` CREATE / UPDATE) | 明細は `target` に入れない |

## 進捗 Task(`patho-exam`)

Task は登録時には作りません。**Task が無いオーダーは依頼済**として扱い、最初の受付・中止で作ります(`fhir/pathoTaskHelpers.ts`)。
中止は同じ transaction でヘッダを `revoked` にし、中止取消で `active` に戻します(`orderCancelEntries`)。中止したオーダーを編集しても `revoked` のままです(`keepOrderRevoked`)。

| 状態 | `Task.status` | `executionPeriod` | 進めるもの |
|---|---|---|---|
| <span class="chip state-waiting">依頼済</span> | `requested`(または Task 無し) | なし | 受付の取消、中止取消 |
| <span class="chip state-active">受付済</span> | `accepted` | `start` | 病理受付、受付済にする、検査済の取消 |
| <span class="chip state-done">検査済</span> | `completed` | `start` / `end` | 一覧の「検査済」 |
| <span class="chip state-stop">中止</span> | `cancelled` | なし | 一覧の中止 |

検体検査・細菌検査と違い、レポートの保存・削除は Task に触りません。報告区分は `DiagnosticReport.status` が正本です。
外来の印(`fhir/outpatientOrderProgressHelpers.ts`)はレポートがあれば進捗より先にレポートの段階を見ます。`registered`(下書き)はレポートの段階に数えず、進捗で決めます。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。
例外はラベルの PDF で、backend(`PathoLabelReport`)が上流を直接読み書きします。こちらは batch Bundle です。

## 登録・編集・削除

`components/PathoOrderForm.tsx`・`PathoOrderPanels.tsx`、`buildPathoOrderBundle` / `buildPathoOrderUpdateBundle` / `buildPathoOrderDeleteBundle`(`fhir/pathoOrderHelpers.ts`)、
`useCreatePrescription` / `useUpdatePrescription`(`api/queries/labResult.ts`。全種別共通)、`useDeletePathoOrder`(`api/queries/patho.ts`)、`postOrderDeleteBundle`(`api/queries/orderDelete.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 登録
    UI->>BE: GET /master/...(臓器・検査材料、採取法)
    BE-->>UI: マスタ
    Dr->>UI: 検査区分・採取(予定)日時・検体・臨床情報を入力して登録
    UI->>UI: 入力検証
    UI->>UI: Bundle を組む
    Note over UI: 画像 Binary・テンプレートの回答(ヘッダより先)<br/>ヘッダ ServiceRequest(fullUrl)<br/>検体明細 × 検体(contained Specimen)<br/>登録時の入院病棟を order-ward に<br/>Provenance(CREATE)<br/>代行・研修医: Task order-approval
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 編集
    UI->>BE: GET /fhir(ヘッダ + 明細)
    BE->>FHIR: 検索
    FHIR-->>UI: ServiceRequest 一式
    Dr->>UI: 直して更新
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ(ifMatch、identifier を引き継ぐ)<br/>明細は差分で POST / PUT / DELETE<br/>採取の記録はフォーム値に持ち回って保つ<br/>外した回答は DELETE、Binary は消さない<br/>Provenance(UPDATE)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Dr->>UI: 削除
    UI->>BE: GET /fhir(ヘッダ + 明細)
    BE->>FHIR: 検索
    FHIR-->>UI: オーダー一式
    UI->>BE: GET /fhir(Task・DiagnosticReport ほか)
    BE->>FHIR: 検索
    FHIR-->>UI: 従属リソース(レポートがあれば止める)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE ヘッダ・明細・回答・Task<br/>台帳の Specimen は残す
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 採取の記録とラベル発行

`components/PathoCollectionModal.tsx`、`buildPathoCollectionBundle`(`fhir/pathoOrderHelpers.ts`)、`useRecordPathoCollection`(`api/queries/patho.ts`)、
`Reports::PathoLabelPdfsController`、`PathoLabelReport`。保存の前に空のタブを開くのはポップアップブロックを避けるためで、PDF は保存の後に差し替えます(保存前に刷ると直す前の容器数になる)。

```mermaid
sequenceDiagram
  autonumber
  actor Staff as 医師・看護師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Staff->>UI: カードの「採取」、日時・個数・容器数を入力して保存
  UI->>UI: 入力検証、ラベル発行なら空のタブを開く
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: PUT 検体明細 × 検体(ifMatch)<br/>ヘッダは書かない
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  opt ラベル発行
    UI->>BE: GET /reports/patho_labels/:order_id/pdf
    BE->>FHIR: GET /ServiceRequest?_id + 患者・明細・台帳の Specimen
    FHIR-->>BE: オーダー一式
    BE->>BE: いまの容器(明細 × 容器数)と台帳を突き合わせる
    opt 台帳と差がある
      BE->>FHIR: POST /(batch)
      Note over BE,FHIR: 無い容器を作成(ifNoneExist)<br/>外れた容器を entered-in-error<br/>戻した容器を復帰
      FHIR-->>BE: 採番された番号
    end
    BE-->>UI: PDF(1 ページ = 容器 1 つ)
  end
```

カードのメニューと一覧のメニューの「ラベル発行」は、`opt ラベル発行` の部分だけを新しいタブで行います。

## 病理受付

`pages/PathoReceptionPage.tsx`、`expectedPathoContainers` / `buildPathoReceptionBundle`(`fhir/pathoReceptionHelpers.ts`)、
`fetchPathoReceptionContext` / `fetchContainerByLabelNumber` / `useReceivePathoOrder`(`api/queries/pathoReception.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 病理部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  loop 容器ごと
    Tech->>UI: ラベルを読む
    UI->>BE: GET /fhir(Specimen をラベル番号で検索)
    BE->>FHIR: 検索
    FHIR-->>UI: 台帳の Specimen
    opt 照合の対象がまだ無い、または別のオーダー
      UI->>BE: GET /fhir(ServiceRequest?_id + 患者・明細・Specimen・Task)
      BE->>FHIR: 検索
      FHIR-->>UI: オーダー文脈
    end
    UI->>UI: 容器の鍵で照合(合わなければ警告)
  end
  Tech->>UI: 受付
  opt 病理受付番号がまだ無い
    UI->>BE: GET /fhir(ServiceRequest/$next-identifier)
    BE->>FHIR: 採番
    FHIR-->>UI: 番号
  end
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: Task patho-exam = accepted<br/>PUT ヘッダ(identifier に受付番号、ifMatch)<br/>PUT Specimen × 容器(receivedTime・status available)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果(版違いは 412)
```

## 一覧・検査済・中止

`pages/PathoWorklistPage.tsx`、`usePathoWorklist` / `useUpdatePathoTaskStatus`(`api/queries/patho.ts`)、`makeUpdateTaskStatusHook`(`api/queries/worklist.ts`)、`findPathoOrderIdByNumber`(`api/queries/pathoReception.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 病理部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(ServiceRequest?category=pathology&occurrence=採取日&based-on:missing=true)
  Note over UI,BE: _include 患者<br/>_revinclude 明細(iterate)・Task・DiagnosticReport
  BE->>FHIR: 検索
  FHIR-->>UI: オーダー一式
  alt 受付済にする(照合なし)
    Tech->>UI: メニューの「受付済にする」
    UI->>BE: GET /fhir($next-identifier)、POST /fhir(transaction)
    Note over UI,BE: Task = accepted、PUT ヘッダ(受付番号)<br/>容器の到着は書かない
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 検査済・取消
    Tech->>UI: 検査済 / 取消
    UI->>BE: POST /fhir(Task patho-exam = completed / accepted / requested)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 中止・中止取消
    Tech->>UI: 中止 / 中止取消
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task patho-exam = cancelled / requested<br/>PUT ヘッダ revoked / active
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## レポートの登録・編集・削除

`components/KartePathoResultTab.tsx`・`PathoResultForm.tsx`・`PathoResultDetailPanel.tsx`、`buildPathoResultBundle` / `buildPathoResultUpdateBundle` / `buildPathoResultDeleteBundle` / `nextReportStatus`(`fhir/pathoResultHelpers.ts`)、
`useCreatePathoResult` / `useUpdatePathoResult` / `useDeletePathoResult` / `withPathoReportTasks`(`api/queries/patho.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 病理部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 保存
    Tech->>UI: 所見・診断・診断医・重要度・報告区分を入力して保存
    UI->>UI: 入力検証・Bundle を組む
    Note over UI: 画像 Binary・テンプレートの回答<br/>Specimen × 検体<br/>Observation × 所見<br/>DiagnosticReport(registered / preliminary / final / amended / appended)<br/>編集は差分で POST / PUT / DELETE
    opt 確定の報告
      UI->>BE: GET /fhir(依頼医、このレポートの Task)
      BE->>FHIR: 検索
      FHIR-->>UI: 宛先と既存の通知・台帳
      UI->>UI: result-review・result-explanation・followup-recommendation を足す
    end
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Tech->>UI: 削除
    UI->>BE: GET /fhir(DiagnosticReport、このレポートの Task)
    BE->>FHIR: 読む
    FHIR-->>UI: レポートと通知・台帳
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE レポート → Observation → 結果側の Specimen → 回答<br/>requested の Task を cancelled に<br/>Task patho-exam には触らない
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

結果確認の書き込みは [検体検査オーダーの業務フロー](../flows/lab.md)「シーケンス図: 結果確認」のカルテからの経路と同じです(`ResultReviewAction`、`useMarkResultReviewed`)。

## 患者説明の記録

`components/ResultExplanationAction.tsx`・`ResultExplanationModal.tsx`、`recordExplanationEntry`(`fhir/resultExplanationHelpers.ts`)、`useRecordExplanation` / `useReopenExplanation`(`api/queries/resultFollowup.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: 「患者説明」で対応・説明日・メモを入力
  UI->>BE: GET /fhir(このレポートの result-review)
  BE->>FHIR: 検索
  FHIR-->>UI: 通知
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: Task result-explanation = completed(output に対応・説明日)<br/>未確認なら Provenance(verifier)と Task result-review = completed
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 医事会計と SS-MIX2

病理検査は検体検査と同じくオーダーで集める種別です(`BillingClaimBuilder` の `:order` 経路)。実施入力を持たないので、進捗 Task は見ず、**オーダーの採取(予定)日**で集めます。採取の記録の日時は使いません。中止は `ServiceRequest.status` で判定します。
レセ電算コードは検査項目マスタではなく施設設定の「病理検査(検査区分ごと)」から検査区分で引きます(`Resolvers::Pathology`)。数量は検体明細の数です。判断料・診断料は日レセが自動算定します。
SS-MIX2 の電文は持ちません。`OmlO33` は `order-type|lab`、`OmgO19` は放射線・内視鏡・生理、`OulR22` は v2-0074 `LAB`、`OruR01` は `physio` だけを対象にします。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集 | 採取(予定)日のオーダーを検査区分のコードで送る。コードが未設定なら「送れない項目」に出す | なし |
| 採取・ラベル発行・受付・検査済 | なし | なし |
| レポートの保存・訂正・追加・削除 | なし | なし |
| 中止 | 対象から外れる(`ServiceRequest` が `revoked`) | なし |
| 削除 | 対象から外れる | なし |
