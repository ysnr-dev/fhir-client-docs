# 化学療法のシーケンス図

<!-- ../fhir-client/docs/order-flows/chemotherapy.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[化学療法の業務フロー](../flows/chemotherapy.md)にあります。

## リソースの構成

適用 1 件はヘッダの `ServiceRequest`(`order-type|chemo-regimen`、`intent = plan`)です。投与日のオーダー(日オーダー)は通常の注射・処方で、`requisition` にヘッダと同じ `regimen-instance` の uuid、`regimen-order` 拡張にクール・Day・体格を持ちます。
日オーダーはヘッダを `basedOn` で指しません(`basedOn` を持つと明細として扱われ、一覧から消えます)。

| 適用の状態 | ヘッダの `status` | 記録 |
|---|---|---|
| 適用中 | `active` | |
| 休止 | `on-hold` | |
| 完了 | `completed` | `regimen` 拡張の `completedOn` |
| 中止 | `revoked` | `regimen` 拡張の `discontinuationReason`・`discontinuationNote`・`discontinuedOn` |

日オーダーの進捗は注射の `injection`、処方の `rx-dispense` の Task で、状態の対応はそれぞれの文書のとおりです。

## 投与可否 Task(`chemo-go`)

日オーダー 1 件に 1 件で、確認し直しは同じ Task を書き直します。ヘッダの版を動かさないので、受付・払出では無効になりません。

| 印 | 判定(`regimenDecisionOf`) |
|---|---|
| 未確認 | Task が無い、または `status = cancelled` |
| 実施可 | `status = completed` で、`input` の版が日オーダーの `meta.versionId` と一致 |
| 要再確認 | `status = completed` で、版が一致しない |

版が読めないときは投与日の一致だけで判定します。日オーダーのヘッダを PUT する処理を足すと、実施可は要再確認に落ちます。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。

## 適用・次クール登録

`components/RegimenApplyPanel.tsx`、`buildRegimenApplicationBundle`・`buildRegimenCycleBundle`(`fhir/regimenOrderHelpers.ts`)、`useCreatePrescription`(`api/queries/labResult.ts`。全種別共通)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: レジメンを選ぶ(次クールはレジメン詳細から)
  UI->>BE: GET /master/...(レジメン・投与量換算・用量規則)
  BE-->>UI: マスタ
  UI->>BE: GET /fhir(体格・検査結果・アレルギー・適用と日オーダー)
  BE->>FHIR: 検索
  FHIR-->>UI: 患者の記録
  UI->>UI: 投与量を計算(planDrugDose)
  UI->>UI: 投与前チェック・累積投与量・警告を判定
  Dr->>UI: 開始日・クール数・区分・投与量を確かめて登録
  UI->>UI: 入力検証(validateRegimenApply)
  opt 確認を要する警告がある
    UI-->>Dr: 確認モーダル
    Dr->>UI: 理由を選んで登録
  end
  UI-)BE: POST /master/advisory_events(発火・無視の台帳)
  UI->>UI: Bundle を組む
  Note over UI: 適用: POST ヘッダ ServiceRequest<br/>次クール: 体格か入外区分が変わればヘッダを PUT<br/>(身長・体重が揃わないクールは前の体格を残す)<br/>投与日ごと: 注射と内服の ServiceRequest<br/>+ MedicationRequest × 薬剤数<br/>Provenance(CREATE)<br/>注射・内服(院外を除く): Task rx-verification<br/>代行・研修医: Task order-approval<br/>警告の無視: Provenance
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>BE: transaction-response
  BE-->>UI: 結果
  UI->>UI: 暦・一覧・通知を読み直す
```

## 投与可否

`RegimenDecisionFields`(`components/RegimenDecision.tsx`)、`useSaveRegimenDecision`、`fhir/regimenDecisionHelpers.ts`。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: 暦の投与日を押す
  UI->>BE: GET /master/regimens/:id(適応基準)
  BE-->>UI: レジメン
  UI->>BE: GET /fhir(検査結果・体格)
  BE->>FHIR: 検索
  FHIR-->>UI: Observation
  UI->>UI: 投与日までの結果で投与前チェック(checkLabCriteria)
  alt 実施可
    Dr->>UI: コメントを入れて実施可
    opt 基準外がある
      UI-->>Dr: 確認ダイアログ
      Dr->>UI: OK
    end
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task chemo-go × その日の未実施の日オーダー<br/>status = completed、owner に医師<br/>input に投与日・オーダーの版・レジメン<br/>output に投与前チェックの結果
  else 取消
    Dr->>UI: 取消
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task chemo-go を status = cancelled
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 化学療法室の予約

`RegimenDayBooking`(`components/RegimenPanels.tsx`)、`ChemoBookModal`、`useBookChemoAppointment`、`buildChemoAppointmentBundle`。

```mermaid
sequenceDiagram
  autonumber
  actor Us as 利用者
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Us->>UI: 投与日パネルの予約
  UI->>BE: GET /fhir(投与日の Slot)
  BE->>FHIR: 検索
  FHIR-->>UI: Schedule・Slot(service-type = chemo)
  Us->>UI: 枠を選ぶ
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: POST Appointment<br/>basedOn はその日の注射の ServiceRequest
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

予約はオーダーと別の transaction です。適用時に取らないので、枠が空いていなくても適用は止まりません。

## 移動

`RegimenMoveModal`・`RegimenDayPanel`(`components/RegimenPanels.tsx`)、`useMoveRegimenDays`、`buildRegimenMoveBundle`、`regimenStartDateEntries`。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: 暦のマスを別の日に落とす、または日付を入れて移動
  UI-->>Dr: 範囲の確認(進捗が進んだ日があれば件数)
  Dr->>UI: この日のみ / この日以降すべて
  UI->>BE: GET /fhir(対象の日の監査 Task と予約)
  BE->>FHIR: 検索
  FHIR-->>UI: Task rx-verification・Appointment
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: 実施済を除く日の ServiceRequest・MedicationRequest を PUT<br/>印と投与量の拡張は写す<br/>最初の投与日が変われば、ヘッダの開始日も PUT<br/>Task rx-verification を未監査へ<br/>Provenance(UPDATE)<br/>予約を取消
  BE->>FHIR: POST /
  FHIR-->>UI: 結果(版違いは 412)
```

日オーダーを PUT するので投与可否は要再確認になります。進捗の Task は変えません。

## 投与日の中止・中止取消

`RegimenDayPanel`、`useRegimenDayStopEntries`(`api/queries/regimen.ts`)、`taskBeforeCancel`。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 中止
    Dr->>UI: 範囲と理由を入れて中止
    UI->>BE: GET /fhir(対象の日の予約)
    BE->>FHIR: 検索
    FHIR-->>UI: Appointment
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 進捗 Task を cancelled(理由は statusReason)<br/>ServiceRequest revoked + MedicationRequest cancelled<br/>予約を取消<br/>Provenance(CANCEL。対象は日オーダー)
  else 中止取消
    Dr->>UI: 中止取消
    UI->>BE: GET /fhir/Task/_history(_id のカンマ OR)
    BE->>FHIR: 型レベルの履歴
    FHIR-->>UI: 進捗 Task の版
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 進捗 Task を中止前の版の内容へ(無ければ requested)<br/>ServiceRequest・MedicationRequest を active<br/>Provenance(REACTIVATE)
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

カルテのカードと注射一覧の `useUpdateInjectionTaskStatus`、処方一覧の `useUpdateRxTaskStatus` も、日オーダーの中止・中止取消(`isRegimenDayStop`)では同じ `useRegimenDayStopEntries` で書きます。

## 休止・再開・完了・レジメン中止・クール取消

`RegimenDetailView`、`RegimenRevokeModal`、`useUpdateRegimenStatus`・`useDeleteRegimenCycle`(`api/queries/adverseEvent.ts`)、`useRevokeRegimen`(`api/queries/regimen.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 休止・再開
    Dr->>UI: 休止 / 再開
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: ヘッダを on-hold / active で PUT<br/>Provenance(SUSPEND / RESUME)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 完了・レジメン中止
    Dr->>UI: 完了 / レジメン中止(理由)
    UI->>BE: GET /fhir(未実施の日の予約)
    BE->>FHIR: 検索
    FHIR-->>UI: Appointment
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: ヘッダを completed / revoked で PUT<br/>未実施の日: 進捗 Task cancelled<br/>ServiceRequest revoked + MedicationRequest cancelled<br/>予約を取消<br/>Provenance(COMPLETE / CANCEL。対象はヘッダ)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else クール取消
    Dr->>UI: クール一覧の取消
    UI->>UI: canDeleteCycle(依頼済か中止の日だけ)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE ServiceRequest・MedicationRequest<br/>DELETE 進捗 Task・投与可否 Task<br/>予約を取消
    BE->>BE: 削除の来歴を Bundle に足す
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 払出・調剤・実施

日オーダーは通常の注射・処方なので、[注射箋発行](injection.md#注射箋発行)、[払出登録](injection.md#払出登録)、[実施](injection.md#実施)、[処方箋発行](prescription.md#処方箋発行)、[調剤登録](prescription.md#調剤登録)、[与薬](prescription.md#与薬)と同じです。
違いは表示だけで、`regimenOrderOf` で印を読み、`useHeldRegimenIds` で休止中を判定します。

## 医事会計と SS-MIX2

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 適用・休止・再開・完了・レジメン中止(ヘッダ) | 対象外(`OrderCatalog::IGNORED`) | 出さない |
| 日オーダーの登録・編集・移動 | 注射はなし。内服は投与日の会計に載る | RDE^O11(注射 OMP-02、内服 OMP-01) |
| 投与日の中止、完了・中止で止めた日 | 対象から外れる。実施済みの施用は送る | RDE^O11 の `CA`(DEL) |
| 中止取消 | 対象に戻る | RDE^O11 の `NW`(INS) |
| クール取消・日オーダーの削除 | 対象から外れる | RDE^O11 の `CA`(DEL) |
| 注射の実施 | 通常の注射に、その日の最初の注射の剤へ外来化学療法加算(15 歳未満は別コード)と無菌製剤処理料を 1 回足す | RAS^O17(OMP-12) |
| 投与可否・有害事象 | なし | 出さない |

外来化学療法加算のコードが施設設定に無いときは、送れなかった項目として報告します。無菌製剤処理料はコードがあるときだけ足します。

化学療法の日オーダーかどうかは `requisition` の system(`regimen-instance`)で判定します。
