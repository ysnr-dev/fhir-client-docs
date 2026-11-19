# 検体検査オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/lab.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[検体検査オーダーの業務フロー](../flows/lab.md)にあります。

## リソースの構成

オーダーはヘッダの `ServiceRequest`(`order-type|lab`)と、検査項目 1 件ずつの明細 `ServiceRequest`(`basedOn` でヘッダを指す)です。パネルの構成項目はさらに明細を `basedOn` で指します。
明細はオーダー時点のマスタの内容(項目コード・名称・JLAC・検体・採取管)を写し、採る検体は contained の `Specimen` で `ServiceRequest.specimen` から指します(`fhir/labOrderHelpers.ts`)。

| もの | リソース | 補足 |
|---|---|---|
| 進捗 | `Task`(`task-code|lab-exam`、`focus` = ヘッダ) | 下の表 |
| 管(採取管)の台帳 | `Specimen`(`request` = ヘッダ、`accessionIdentifier` = ラベル番号) | 発行 = 作成、到着 = `receivedTime` + `status: available`、記録者は拡張 `lab-arrival-recorder` |
| 結果 | `DiagnosticReport`(`basedOn` = ヘッダ)+ `Observation`(`result`) | 報告区分は `status`(`preliminary` / `final` / `corrected`)、採取日は `effectiveDateTime`、報告日時は `issued` |
| 結果の検体 | `DiagnosticReport.specimen` | 材料の一致する管の `Specimen` を参照(書き換えない)。無い材料・紐付け無しの結果は結果側が `Specimen` を作って所有する |
| 緊急異常値の通知 | `Task`(`task-code|lab-panic`、`focus` = 結果、`owner` = 依頼医、`priority = stat`) | 項目は `input` に構造化 |
| 検査結果確認の通知 | `Task`(`task-code|result-review`、`focus` = 結果、`owner` = 依頼医) | 最終報告のときだけ |
| 確認(既読) | `Provenance`(`target` = 結果、`agent.type = verifier`、`signature`) | 正本。通知は宛先と未確認・確認済みだけ |
| 代行入力 | `Provenance`(`target` = ヘッダ、`activity` CREATE / UPDATE) | 明細は `target` に入れない |

## 進捗 Task(`lab-exam`)

Task は登録時には作りません。**Task が無いオーダーは依頼済**として扱い、最初のステータス変更で作ります(`fhir/labTaskHelpers.ts`)。
中止は同じ transaction でヘッダの `ServiceRequest` を `revoked` にし、中止取消で `active` に戻します(`orderCancelEntries`)。
中止したオーダーを編集しても `revoked` のままです(`keepOrderRevoked`)。

| 状態 | `Task.status` | `executionPeriod` |
|---|---|---|
| <span class="chip state-waiting">依頼済</span> | `requested`(または Task 無し) | なし |
| <span class="chip state-active">受付済</span> | `accepted` | `start` |
| <span class="chip state-done">実施済</span> | `completed` | `start` / `end` |
| <span class="chip state-stop">中止</span> | `cancelled`(ヘッダは `revoked`) | なし |

受付済へは行の「ラベル発行」と一括発行、実施済へは到着確認の全管到着が進めます。メニューの「受付」「実施」は同じ Task の書き込みを手で行う代替です。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。
例外はラベルの PDF で、backend(`LabLabelReport`)が上流を直接読み書きします。

## 登録・編集・削除

`components/LabOrderForm.tsx`・`LabOrderPanels.tsx`、`buildLabOrderBundle` / `buildLabOrderUpdateBundle` / `buildLabOrderDeleteBundle`(`fhir/labOrderHelpers.ts`)、
`useCreatePrescription` / `useUpdatePrescription`(`api/queries/labResult.ts`。全種別共通)、`useDeleteLabOrder`(`api/queries/lab.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 登録
    UI->>BE: GET /master/...(検査伝票・項目・パネルの構成)
    BE-->>UI: マスタ
    Dr->>UI: 検査項目・検査日・至急・入外・コメントを入力して登録
    UI->>UI: 入力検証(項目 1 件以上・検査日)
    UI->>UI: Bundle を組む
    Note over UI: ヘッダ ServiceRequest(fullUrl)+ 明細 ServiceRequest × 項目<br/>パネルの構成項目も明細<br/>登録時の入院病棟を order-ward に<br/>Provenance(CREATE)<br/>代行・研修医: Task order-approval
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 編集
    UI->>BE: GET /fhir(ヘッダ + 明細)
    BE->>FHIR: 検索
    FHIR-->>UI: ServiceRequest 一式
    Dr->>UI: 直して更新
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ(ifMatch)<br/>明細は差分で POST / PUT / DELETE<br/>Provenance(UPDATE)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 削除
    Dr->>UI: 削除
    UI->>BE: GET /fhir(ヘッダを指す明細・Task・結果)
    BE->>FHIR: 検索
    FHIR-->>UI: 明細・Task・DiagnosticReport
    alt 結果がある
      UI-->>Dr: 削除できない(結果を削除する)
    else 結果が無い
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: DELETE 明細 → ヘッダ<br/>DELETE Task(進捗・承認待ち)<br/>ラベルの Specimen は残す
      BE->>BE: 削除の来歴を Bundle に足す
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  end
```

## ラベル発行

`pages/LabWorklistPage.tsx`、`components/LabLabelBatchModal.tsx`、`useUpdateLabTaskStatus` / `useIssueLabLabels`(`api/queries/lab.ts`)、`LabLabelReport`(backend)。
番号は上流が `Specimen` の作成時に採番します(連番 10 桁 + チェックデジット)。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 採血室・病棟
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(検査日 1 日ぶん)
  BE->>FHIR: 検索
  FHIR-->>UI: ServiceRequest・Task・Specimen・DiagnosticReport・患者
  alt 行の「ラベル発行」
    Tech->>UI: ラベル発行
    par 別タブ /reports/lab_labels/:order_id/pdf
      UI->>BE: GET
      BE->>FHIR: GET ServiceRequest?_id(患者・明細・発行済み Specimen)
      FHIR-->>BE: オーダー一式
      opt 未発行の管がある
        BE->>FHIR: batch Bundle(POST Specimen × 管、If-None-Exist)
        FHIR-->>BE: 採番された Specimen
      end
      BE-->>UI: ラベル PDF(管 1 本 1 ページ)
    and 依頼済なら受付済へ
      UI->>BE: POST /fhir(transaction、Task lab-exam = accepted)
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  else 一括発行(病棟)
    Tech->>UI: 病棟を選んで発行(未発行)/ 再発行(発行済・未到着)
    UI->>BE: GET /fhir(一覧を読み直す)
    BE->>FHIR: 検索
    FHIR-->>UI: 最新の行
    UI->>BE: POST /reports/lab_labels/pdf(order_ids・scope)
    BE->>FHIR: GET ServiceRequest?_id(100 件ずつ)
    FHIR-->>BE: オーダー一式
    opt 未発行の管がある
      BE->>FHIR: batch Bundle(POST Specimen、オーダーをまたいで 1 回)
      FHIR-->>BE: 採番された Specimen
    end
    BE-->>UI: ラベル PDF(Blob → 新規タブ)
    UI->>BE: POST /fhir(transaction、依頼済の行の Task を accepted)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

Task の書き込みに失敗しても `Specimen` は残るので、再発行で同じ番号を刷れます。

## 到着確認

`pages/LabArrivalPage.tsx`、`fetchLabelSpecimenByNumber` / `fetchLabArrivalContext`(`api/queries/injection.ts`)、`buildSpecimenArrival` / `buildSpecimenArrivalCancel`(`fhir/labSpecimenHelpers.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 検査室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Tech->>UI: ラベルを読む(キーボード入力 + Enter)
  UI->>UI: 11 桁 + チェックデジットを検証
  UI->>BE: GET /fhir(Specimen?accession=番号)
  BE->>FHIR: 検索
  FHIR-->>UI: 管の Specimen(無ければ「発行していない番号」)
  UI->>BE: GET /fhir(ServiceRequest?_id + 明細・Task・Specimen・患者)
  BE->>FHIR: 検索
  FHIR-->>UI: オーダー文脈
  UI->>UI: 全部の管に receivedTime が付くかを判定
  alt 到着
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Specimen(receivedTime・status available・記録者)<br/>全管揃えば Task lab-exam = completed
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 記録済み(二重読み)
    UI-->>Tech: 記録済みの時刻を表示
    opt 進捗だけ遅れている
      UI->>BE: POST /fhir(Task を completed)
      BE->>FHIR: POST /
    end
  else 取消
    Tech->>UI: 行の「取消」
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Specimen(receivedTime・status を外す)<br/>実施済なら Task を accepted
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
  UI-->>Tech: フィードに患者・検体・結果を積む
```

## 結果登録・訂正

`components/LabResultEntryModal.tsx`(一覧)・`KarteLabResultTab.tsx`・`LabResultForm.tsx`、`buildLabResultBundle` / `buildLabResultUpdateBundle` / `buildLabResultDeleteBundle`(`fhir/labResultHelpers.ts`)、
`useCreateLabResult` / `useUpdateLabResult` / `useDeleteLabResult`(`api/queries/labResult.ts`)。通知の組み立ては `fhir/labPanicHelpers.ts`・`fhir/resultReviewHelpers.ts`。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 検査室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 新規
    UI->>BE: GET /master/...(結果項目・オーダー項目→結果項目・基準値)
    BE-->>UI: マスタ
    Tech->>UI: 値・コメント・報告区分を入力して保存
    UI->>UI: 基準値で H / L・HH / LL を判定
    UI->>BE: GET /fhir(オーダーの Specimen:request)
    BE->>FHIR: 検索
    FHIR-->>UI: ラベルの Specimen
    UI->>UI: Bundle を組む
    Note over UI: DiagnosticReport(status・issued・performer)<br/>Observation × 項目(referenceRange・interpretation・method)<br/>材料の一致する管は参照、無い材料は Specimen を作る<br/>パニック値: Task lab-panic(依頼医)<br/>最終報告かつ緊急が無い: Task result-review(依頼医)
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 編集(確定・訂正)
    UI->>BE: GET /fhir(DiagnosticReport?_id + result・specimen)
    BE->>FHIR: 検索
    FHIR-->>UI: 結果一式
    Tech->>UI: 直して保存
    UI->>BE: GET /fhir(この結果の Task lab-panic・result-review)
    BE->>FHIR: 検索
    FHIR-->>UI: 既存の通知
    UI->>UI: 確定済みなら status = corrected
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT DiagnosticReport(ifMatch)<br/>Observation は差分で POST / PUT / DELETE<br/>パニック値: 通知を PUT(直れば cancelled、出れば requested)<br/>result-review を requested に戻す(訂正)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Tech->>UI: 削除
    UI->>BE: GET /fhir(DiagnosticReport?_id + result・specimen)
    BE->>FHIR: 検索
    FHIR-->>UI: 結果一式
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE DiagnosticReport → Observation → 結果側が所有する Specimen<br/>ラベルの Specimen は残す
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 結果取込

`pages/LabResultImportPage.tsx`・`LabResultImportDetailPage.tsx`、`hooks/useLabImportGroupContext.ts`、`fhir/labImportHelpers.ts`、backend の `LabImport::*`。
上流への登録は手入力と同じ `useCreateLabResult` / `useUpdateLabResult` を通ります。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 検査室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Tech->>UI: ファイルを選んで取込
  UI->>BE: POST /master/lab_result_imports(multipart)
  BE->>BE: 文字コード判定 → HL7 解析 → JLAC で結果項目を引き当て → 行を保存
  BE-->>UI: バッチ(行の状態: 保留 / 登録待ち / 対象外)
  loop 候補(レポート 1 件)ごと
    opt ラベル番号がある
      UI->>BE: GET /fhir(Specimen?accession)→ オーダー文脈
      BE->>FHIR: 検索
      FHIR-->>UI: 管・オーダー・患者
      UI->>UI: 管の患者 ≠ ファイルの患者なら番号を使わない
    end
    opt オーダーが決まらない
      UI->>BE: GET /fhir(患者番号 → 患者、採取日の検体検査オーダー)
      BE->>FHIR: 検索
      FHIR-->>UI: 候補(0 件なら紐付けなし、複数なら選ぶ)
    end
    opt 保留の行がある
      Tech->>UI: 結果項目・値を選ぶ
      UI->>BE: PATCH /master/lab_result_import_rows/:id(write_to_master・apply_to_same_code)
      BE-->>UI: 更新した全行
    end
    Tech->>UI: 登録(候補ごと、または全件)
    UI->>UI: 行 → フォーム値。H/L を施設の基準値で付け直す
    alt オーダーに結果が無い
      UI->>BE: POST /fhir(結果登録と同じ transaction)
    else 結果がある
      UI->>BE: GET /fhir(既存の結果)→ 項目を差し替え・追加
      UI->>BE: POST /fhir(訂正と同じ transaction)
    end
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
    UI->>BE: PATCH /master/lab_result_import_rows/bulk_update(report_fhir_id → registered)
    BE-->>UI: 更新した行
  end
```

## 結果確認

`pages/NotificationPage.tsx`(`components/notifications/notificationRegistry.tsx`)、`useMarkResultReviewed`(`api/queries/notification.ts`)、`urgentConfirmationEntries`(`api/notificationActions.ts`)、
`buildReviewProvenance`(`fhir/provenanceHelpers.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 通知の一覧から(緊急異常値)
    UI->>BE: GET /fhir(Task lab-panic、自分あて・未確認)
    BE->>FHIR: 検索
    FHIR-->>UI: 通知(項目・値・判定は input)
    Dr->>UI: 確認
    UI->>BE: GET /fhir(結果の DiagnosticReport、同じ結果の result-review)
    BE->>FHIR: 検索
    FHIR-->>UI: 結果と通知
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Task lab-panic = completed(確認者を note に)<br/>最終報告なら Provenance(verifier)<br/>未確認の result-review を completed
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else カルテの検査結果タブから
    UI->>BE: GET /fhir(結果 + Provenance)
    BE->>FHIR: 検索
    FHIR-->>UI: 結果と確認の来歴(確認の時刻 < lastUpdated なら未確認)
    Dr->>UI: 確認
    UI->>BE: GET /fhir(この結果の Task result-review・lab-panic)
    BE->>FHIR: 検索
    FHIR-->>UI: 通知
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Provenance(target = 結果、verifier、signature)<br/>未確認の通知をすべて completed
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 医事会計と SS-MIX2

検体検査は実施入力を持たないので、医事会計はオーダーの検査日で集めます(`BillingClaimBuilder` の `:order` 経路)。進捗 Task は見ず、中止は `ServiceRequest.status` で判定します。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集 | 検査日のオーダーの項目を `receipt_code` で送る。血液の検体があれば採血料を最初の剤に 1 回足す。`receipt_code` の無い項目は「送れない項目」に出す | OML^O33(OML-01)。ヘッダを書くと出す。編集も INS |
| 削除 | 対象から外れる | OML^O33 の `CA`(DEL) |
| 中止 | 対象から外れる(`ServiceRequest` が `revoked`)。送ったあとの中止は医事が送り直す | OML^O33 の `CA`(DEL)。中止取消は `NW`(INS) |
| 受付・到着 | なし | なし(Specimen の作成・更新はメッセージにしない) |
| 結果の登録・確定・訂正 | なし | OUL^R22(OML-11)。訂正も INS(前の有効ファイルは過去履歴になる) |
| 結果の削除 | なし | OUL^R22 の `CA`(DEL) |

外来迅速検体検査加算は「当日結果説明」を判定できないので送りません。
