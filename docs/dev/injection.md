# 注射オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/injection.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[注射オーダーの業務フロー](../flows/injection.md)にあります。

## 進捗 Task(`injection`)

Task は登録時には作りません。**Task が無いオーダーは依頼済**として扱い、最初のステータス変更で作ります。
日ごとのオーダーに 1 件です。

| 状態 | `Task.status` |
|---|---|
| <span class="chip state-waiting">依頼済</span> | `requested`(または Task 無し) |
| <span class="chip state-active">受付済</span> | `accepted` |
| <span class="chip state-hold">照会中・処方変更待ち</span> | `on-hold` + `statusReason` |
| <span class="chip state-active">払出済</span> | `in-progress` |
| <span class="chip state-done">実施済</span> | `completed` |
| <span class="chip state-stop">中止</span> | `cancelled` |

監査 Task(`rx-verification`)は束ね(`requisition`)に 1 件で、`groupIdentifier` に束ねの uuid、`focus` に束ねの最初の日を持ちます。
最初の日を削除すると残りの最初の日へ付け替えます(`rxVerificationDeleteEntries`)。

中止は同じ transaction で `ServiceRequest` を `revoked`、`MedicationRequest` を `cancelled` にします(`rxOrderCancelEntries`)。中止取消は `active` に戻します。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。

## 登録

`components/InjectionForm.tsx`・`InjectionPanels.tsx`、`buildInjectionBundle`(`fhir/injectionHelpers.ts`)、`useCreatePrescription`(`api/queries/labResult.ts`。全種別共通)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: 医薬品・用法・期間・実施パターンを入力
  UI->>UI: 薬剤の警告を判定して行に表示
  UI->>UI: 展開する日をプレビュー(injectionDates)
  Dr->>UI: 登録
  UI->>UI: 入力検証・止める警告の確認
  opt 確認を要する警告がある
    UI-->>Dr: 確認モーダル
    Dr->>UI: 理由を選んで登録
  end
  UI-)BE: POST /master/advisory_events(発火・無視の台帳)
  UI->>UI: Bundle を組む
  Note over UI: 日ごとに ServiceRequest + MedicationRequest × 薬剤数<br/>全日で同じ requisition と開始日<br/>Provenance(CREATE)<br/>Task rx-verification(束ねに 1 件)<br/>代行・研修医: Task order-approval<br/>警告の無視: Provenance<br/>特定抗菌薬: 届出の通知 Task(連日は 1 件)
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>BE: transaction-response
  BE-->>UI: 結果
  UI->>UI: 一覧・カード・通知を読み直す
```

## 編集・継続・削除

`InjectionEditPanel`、`InjectionContinueModal`、`InjectionDeleteModal`、`useInjectionSeriesLater`(後続日)、`deleteInjectionSeriesRequest`、`postOrderDeleteBundle`(`api/queries/orderDelete.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(requisition と occurrence で後続日)
  BE->>FHIR: 検索
  FHIR-->>UI: 後続日の ServiceRequest・MedicationRequest・Task
  alt 編集
    Dr->>UI: 反映範囲を選び、内容を変えて更新
    Note over UI,FHIR: 登録と同じ警告の判定を通る
    UI->>BE: GET /fhir(既存の監査 Task)
    BE->>FHIR: 検索
    FHIR-->>UI: Task rx-verification
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: この日のみ: PUT ServiceRequest・MedicationRequest<br/>POST 追加した薬剤行 / DELETE 消した薬剤行<br/>この日以降: 後続日の PUT ServiceRequest<br/>後続日の MedicationRequest は差し替え<br/>Provenance(UPDATE)<br/>Task rx-verification を未監査へ<br/>処方変更待ちなら進捗を受付済へ
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 継続
    Dr->>UI: 終了日を選んで継続
    UI->>UI: 束ねのパターンで足す日を計算(injectionExtensionDates)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 足す日の ServiceRequest + MedicationRequest<br/>requisition・開始日・パターンは同じ<br/>Provenance(CREATE)<br/>Task rx-verification を未監査へ
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 削除
    Dr->>UI: 範囲と理由を選んで削除
    UI->>BE: GET /fhir(オーダーを指す記録)
    BE->>FHIR: 検索
    FHIR-->>UI: Task・MedicationDispense・実施記録
    alt 実施記録がある
      UI-->>Dr: 削除できない(実施を取り消す)
    else 実施記録が無い
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: DELETE ServiceRequest・MedicationRequest<br/>DELETE Task・MedicationDispense<br/>監査 Task は残る日があれば付け替え<br/>予約があれば取消
      BE->>BE: 削除の来歴を Bundle に足す
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  end
```

## 中止・中止取消

`InjectionCancelModal`、`useUpdateInjectionTaskStatus`(`api/queries/outpatient.ts`)。注射一覧のメニューは範囲を選ばず、同じ hook でその日だけを書きます。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Dr->>UI: 中止(または中止取消)
  UI->>BE: GET /fhir(requisition と occurrence で後続日)
  BE->>FHIR: 検索
  FHIR-->>UI: 後続日の ServiceRequest・Task
  Dr->>UI: この日のみ / この日以降
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: 選んだ日ぶんの Task injection<br/>中止: cancelled + ServiceRequest revoked + MedicationRequest cancelled<br/>中止取消: requested + ServiceRequest・MedicationRequest active
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 処方監査・疑義照会

処方と同じ画面・hook を使います([処方監査](prescription.md#処方監査)、[疑義照会](prescription.md#疑義照会))。
注射一覧の「監査」「疑義照会」から開き、進捗の組み立てだけを `progressBuilderOf("injection")` で切り替えます。

## 注射箋発行

`pages/InjectionWorklistPage.tsx`・`InjectionPrintPage.tsx`、`useUpdateInjectionTaskStatus`、`InjectionReport`。
PDF の生成は読むだけで、再発行と注射ラベル単独の発行は同じ PDF を刷り進捗を動かしません。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 注射一覧の注射日を選ぶ
  UI->>BE: GET /fhir(注射日 1 日ぶん)
  BE->>FHIR: 検索
  FHIR-->>UI: ServiceRequest・MedicationRequest・Task・患者
  UI->>BE: GET /fhir(束ねの監査 Task)
  BE->>FHIR: 検索
  FHIR-->>UI: Task rx-verification
  Ph->>UI: 注射箋発行
  par 別タブ /injection-print/:order_id
    UI->>BE: GET /reports/injections/:order_id/pdf
    BE->>FHIR: batch Bundle(オーダー一式と自院)
    FHIR-->>BE: 注射一式
    BE-->>UI: 注射箋 PDF
    UI->>BE: GET /reports/injection_labels/:order_id/pdf
    BE->>FHIR: batch Bundle(オーダー一式と自院)
    FHIR-->>BE: 注射一式
    BE-->>UI: 注射ラベル PDF
  and 進捗を受付済へ
    UI->>BE: POST /fhir(transaction、Task injection = accepted)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 払出登録

`components/InjectionDispenseModal.tsx`、`fhir/injectionDispenseHelpers.ts`、`useRegisterInjectionDispense`。受付済の行にだけ出ます。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 払出登録
  UI->>BE: GET /fhir(focus の Task)
  BE->>FHIR: 検索
  FHIR-->>UI: 照会の履歴・未確認の回答の通知
  UI->>BE: GET /master/...(投与量換算)
  BE-->>UI: 換算マスタ
  UI-->>Ph: 数量の初期値を表示(投与量 × その日の施用回数を製剤数へ換算)
  Ph->>UI: 銘柄・数量を確かめて登録
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: POST MedicationDispense × 薬剤数<br/>進捗 Task を in-progress(払出済)<br/>回答の通知を completed
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

払出取消は進捗を受付済へ戻すだけで、`MedicationDispense` は残ります。

## 実施

`components/InjectionPerformModal.tsx`・`InjectionVerifyStep.tsx`、`fhir/injectionPerformHelpers.ts`、`useRegisterInjectionPerform`・`useCancelInjectionPerforms`。
払出済かどうかに関わらず記録できます。

```mermaid
sequenceDiagram
  autonumber
  actor Ns as 看護師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 実施入力
    Ns->>UI: 実施入力
    opt 3点認証が有効、または注射バーコード実施
      Ns->>UI: 患者番号と RP バーコードを読む(またはスキップ)
      UI->>UI: 患者の identifier とオーダーの RP に照合
    end
    opt スケールのインスリン
      UI->>BE: GET /fhir(血糖・主食の Observation、血糖の看護指示)
      BE->>FHIR: 検索
      FHIR-->>UI: 測定値
    end
    Ns->>UI: 結果・時刻・薬剤ごとの実施量を入力して登録
    alt 実施・途中で中止
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: POST Procedure(completed / stopped、照合は拡張)<br/>POST MedicationAdministration × 施用した薬剤<br/>手入力の血糖値: POST Observation<br/>予定回数に達したら Task injection を completed
    else 実施せず
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: POST Procedure(not-done、理由)
    end
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施取消
    Ns->>UI: カードの「実施取消」
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE MedicationAdministration → Procedure(記録すべて)<br/>実施済なら Task injection を requested
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 医事会計と SS-MIX2

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集 | なし | RDE^O11(OMP-02)。`ServiceRequest` を書くと出す |
| 削除 | 対象から外れる | RDE^O11 の `CA`(DEL) |
| 中止 | 対象から外れる。実施済みの施用は送る | RDE^O11 の `CA`(DEL) |
| 中止取消 | 対象に戻る | RDE^O11 の `NW`(INS) |
| 実施 | 薬剤行を 1 施用 1 剤で送る。剤区分は手技・用法種別・経路から決まり、手技料は日レセが算定 | RAS^O17(OMP-12)。実施ごとに採番 |
| 途中で中止・実施せず | 請求せず理由を報告 | RAS^O17 |
| 実施取消 | 対象から外れる | RAS^O17 の DEL |
