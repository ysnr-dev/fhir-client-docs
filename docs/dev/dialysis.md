# 透析オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/dialysis.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[透析オーダーの業務フロー](../flows/dialysis.md)にあります。

## リソースの構成

| もの | リソース | 要点 |
|---|---|---|
| オーダー | `ServiceRequest` | `category` = `order-type|dialysis` + `prescription-setting`、`code` = 浄化方法(`dialysis-modality`)、`occurrenceDateTime` = 開始日(日付のみ)、`reasonReference` = 対象プロブレム、拡張 `dialysis-order-end`(終了日。無ければ継続中)/ `dialysis-bedside` / `dialysis-schedule-pattern`(曜日 × シフト。シフトは `dialysis-shift` の coding)/ `dialysis-prescription`(透析条件)。明細は持たない |
| 進捗 | `Task`(`task-code|dialysis`、`focus` = オーダー) | **登録時には作らず**、Task が無いオーダーは依頼済。部門の受け入れ状態で、実施では動かさない |
| 透析室・ベッド | `Location`(`type` = `location-type|dialysis-unit`) | 透析室は `physicalType` = `ro`、ベッドは `bd` + `partOf` = 透析室。無効は `status` = `inactive`。病床ではないので入院の `Encounter.location` にはしない |
| 枠 | `Schedule` + `Slot` | 枠表は `serviceType` = `schedule-service-type|dialysis`、`actor` = ベッドの `Location`(無効なベッドは `active` = false)。1 日 × シフト × ベッドで 1 枠(定員 1) |
| 予約 | `Appointment`(`basedOn` = オーダー) | `participant` = 患者 + ベッドの `Location`、`slot`、`serviceType` = dialysis、拡張 `dialysis-shift`。シフトは枠の開始時刻から引き、拡張は枠が読めないときの代わり |
| 1 回の実施 | `Procedure` ハブ(`basedOn` = オーダー) | `category` = `order-type|dialysis`、`code` = 浄化方法、`status` = `preparation`(入室)/ `in-progress`(開始)/ `completed`(終了)、`performedPeriod` = 開始〜終了、`usedCode` = 血液浄化器(`blood-purifier`)と器材(`medical-material`)+ `dialysis-material-quantity`、拡張 `dialysis-appointment` = 予約 |
| 測定値 | `Observation`(`partOf` = ハブ) | `dialysis-measurement` の `pre-weight` / `post-weight`(kg)・`ultrafiltration`(L)・`actual-minutes`(min)・`qb` / `qd`(mL/min)、`category` = `order-type|dialysis` |
| 血圧 | `Observation`(`partOf` = ハブ) | LOINC 85354-9 + component、`category` = `vital-signs` + `order-type|dialysis`、拡張 `dialysis-measurement-timing` = `pre` / `post` |
| 薬剤 | `MedicationAdministration`(`partOf` = ハブ) | ロットは `medication-lot-number`、算定しない薬剤は `dialysis-bundled-medication` = true |
| 追加の手技 | `Procedure`(`partOf` = ハブ、`basedOn` = オーダー) | `code` = `dialysis-procedure-code`(レセ電算の診療行為コード) |
| ドライウェイト | `Observation`(`partOf` 無し) | `dialysis-measurement|dry-weight`(kg)。患者単位の状態値で、直近 1 件を読む |
| 患者メモ | `QuestionnaireResponse`(`encounter` 無し) | テンプレート `Questionnaire/dialysis-memo-01` の回答を患者 1 人に 1 件。`meta.tag` = `questionnaire-response-purpose|dialysis-memo` で引き(`_tag`、strict)、カルテの時系列からは `_tag:not` で外す |
| 透析経過表 | `Procedure` ハブ(`partOf` = 実施のハブ、`basedOn` 無し) | `category` = `order-type|dialysis-chart`、`status` = `in-progress` / `completed`(回の終了で閉じる)。打点は `Observation`(`partOf` = 経過表のハブ、`category` = `order-type|dialysis-chart`。血圧・脈拍・SpO2・体温は LOINC、装置の値は `dialysis-measurement`)、できごとは `dialysis-event` の `Observation`、透析中の薬剤は `MedicationAdministration`(`partOf` = 経過表のハブ、同じ `category`。会計には乗らない) |
| 代行入力 | `Provenance`(`target` = オーダー) | 種別共通 |

- 期間を `occurrencePeriod` にせず開始日 + 拡張にするのは、上流が `occurrenceDateTime` を索引するため(リハビリ・食事と同じ判断)。上流は `order-period` で開始日と `dialysis-order-end` を合わせて索引しています。
- 入室のハブは `performed[x]` を持たないので日付で引けません。ボードは「期間に始めた回」と「`status=preparation,in-progress` の回」を別々に引いて束ねます(`fetchDialysisSessions`)。
- 予約と回の突き合わせはハブの `dialysis-appointment` を優先し、無ければ同じオーダー × 同じ日です(`dialysisSessionForAppointment`)。
- 実施取消は経過表 → 子 → ハブの順に DELETE し(entered-in-error で残さない)、予約を `booked` に戻します。ドライウェイトは消しません。
- 経過表のハブは `basedOn` を持たないので、カルテの詳細(`based-on` + `_revinclude:iterate`)に打点が乗りません。読むときは `Procedure?part-of=実施のハブ` で引きます。
- 透析室とベッドにローカルの `location-type|dialysis-unit` を与えるのは、病棟(`type=HU` 起点)・診察室(`LOCATION_TYPE_OPTIONS`)・病床の集計のどれにも混ざらないようにするためです。`LOCATION_TYPE_OPTIONS` には足しません。

## 進捗 Task と status

**実施しても Task を動かしません。** リハビリと同じ逸脱で、他部門と同じ「実施記録 + Task を completed に」にすると初日の実施で終了扱いになります(`fhir/dialysisTaskHelpers.ts`・`dialysisResultHelpers.ts` の冒頭コメント)。

| Task | 表示 | `ServiceRequest.status` | ヘッダに書くもの | 予約 |
|---|---|---|---|---|
| (無し)/ `requested` | 依頼済 | `active` | – | – |
| `accepted` | 実施中 | `active` | – | – |
| `on-hold` | 中断 | `active` のまま | – (`Task.statusReason.text` = 「中断 2026-11-12〜2026-11-20」) | 中断の期間の有効な予約を cancelled に |
| `completed` | 終了 | `active` のまま | `dialysis-order-end`(終了日) | 終了日の翌日以降を cancelled に |
| `cancelled` | 中止 | `revoked` | – | 今日以降を cancelled に |

- 遷移の表は `dialysisTaskActions`、書き込みの入口は `useUpdateDialysisTaskStatus`(`api/queries/dialysis.ts`)です。中止・中止取消は `orderCancelEntries` でヘッダの status を揃えます。
- 終了で `dialysis-order-end` を書くのは、部門一覧・患者帯が `order-period` で引くので、終了日が無いと status=active のまま基準日に永久にヒットし続けるためです(`buildDialysisOrderCloseEntry`)。終了取消では消しません(意図した非対称)。
- 中断の期間は `Task.statusReason.text` に決まった書式で残し、`dialysisTaskHold` が読み戻して一覧のステータスの下に出します。再開(`accepted`)で消します。
- 終了・中断・中止・退院は、もう来ない日の有効な予約の取消(`PUT Appointment cancelled` + `PUT Slot free`)を同じ transaction に積みます(`fetchOrderAppointmentCancelEntries` の `from` / `to`)。取り消す対象の検索は strict で全ページを読み(条件が効かずに全件を拾うと、関係ない予約まで取り消すため)、欠けたら書き込みを止めます。
- `executionPeriod` は受付で `start`、終了で `end` が入ります(`createTaskHelpers` の `buildTaskUpdate`)。
- カルテのタイムラインは、`accepted` / `on-hold` / `completed` で実施情報を出します(`karteTimeline.ts` の dialysis 分岐)。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`。透析はメッセージになりません)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。編集フォームは `useEditSnapshot` で開いた時点の版に固定します(`hooks/useDialysisOrderInitialValues.ts`)。
予約の展開・変更・入れ替えは、検索で読んだ `Slot` / `Appointment` をそのまま PUT するので、別の端末が先に動かしていれば 412 で全体が落ちます。部分成功は作りません。

| 部品 | 場所 |
|---|---|
| オーダー | `components/DialysisOrderForm.tsx`・`DialysisOrderPanels.tsx`、詳細 `DialysisOrderDetailPanel.tsx`、カード `karteCardBodies/DialysisOrderCardBody.tsx` |
| 組み立て | `fhir/dialysisOrderHelpers.ts`(オーダー・終了日・退院の打ち切り)・`dialysisTaskHelpers.ts`(進捗)・`dialysisShiftHelpers.ts`(シフト)・`dialysisAppointmentHelpers.ts`(予約・展開の計画・変更・入れ替え)・`dialysisUnitHelpers.ts`(透析室・ベッド・枠)・`dialysisResultHelpers.ts`(実施)・`dialysisChartHelpers.ts`(経過表。器は `timeSeriesChartHelpers.ts`)・`bloodPurifierHelpers.ts`(血液浄化器の行) |
| 部門の画面 | `pages/DialysisWorklistPage.tsx`(ボード・週・オーダー・患者・統計。終了・中断のモーダルもここ)、`components/DialysisBoard.tsx`、`pages/DialysisUnitPage.tsx`、経過表 `pages/DialysisChartPage.tsx`(`/dialysis-sessions/:sessionId/chart`)・`components/DialysisChartPanel.tsx`・`DialysisChartModal.tsx`・印刷 `pages/DialysisChartPrintPage.tsx`(`/dialysis-chart-print/:sessionId`)(器は `components/timeSeriesChart/`) |
| 患者一覧・統計 | `components/DialysisPatientTable.tsx`・`fhir/dialysisPatientListHelpers.ts`(`useDialysisPatientData`)、`components/DialysisMonthlyStats.tsx`・`fhir/dialysisStatsHelpers.ts`(`useDialysisMonth`) |
| 患者メモ | `components/DialysisMemo.tsx`(詳細の区画・ボードのモーダル)、`fhir/dialysisMemoHelpers.ts`、雛形 `docs/report-mappings/dialysis-memo-01.questionnaire.json` |
| モーダル | 実施 `components/DialysisPerformModal.tsx`、展開 `DialysisExpandModal.tsx`、臨時・変更 `DialysisBookModal.tsx`、空き枠から `DialysisCellBookModal.tsx` |
| マスタ・設定 | 血液浄化器 `pages/BloodPurifierPage.tsx`(`/blood-purifiers`、backend `master/blood_purifiers`)、施設設定 `dialysis_shifts` / `dialysis_lab_items` / `receipt_codes.dialysis`(`backend/app/models/facility_settings.rb`) |
| hook | `api/queries/dialysis.ts`(`useDialysisWorklist`・`useDialysisBoard`・`useDialysisSlots`・`useDialysisSessions`・`useDialysisPerform`・`useCancelDialysisPerform`・`useLatestDryWeight`・`usePatientDialysisOrders`・`useBookDialysisAppointments`・`useRescheduleDialysisAppointment`・`useSwapDialysisAppointments`・`useUpdateDialysisTaskStatus`・`useDialysisChart`・`useDialysisChartWrite`・`useDialysisMemo` ほか)、予約の取消は `api/queries/appointment.ts` |
| 退院 | `components/DischargeModal.tsx`、`api/queries/encounter.ts`(`buildDialysisOrderStopEntries` を退院の transaction に積む) |
| ホーム | `components/homeCards/HomeWorklistCard.tsx` の `DialysisCard`(`useDialysisWorklist` を当日で読む) |

## 登録・編集・削除

`buildDialysisOrderBundle` / `buildDialysisOrderUpdateBundle`、`useCreatePrescription`(`api/queries/labResult.ts`。全種別共通)、`useUpdateDialysisOrder`、`deleteDialysisOrderRequest` / `postOrderDeleteBundle`(`api/queries/orderDelete.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 主治医
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 登録・編集
    UI->>BE: GET /facility_settings、GET /master/blood_purifiers、GET /master/medicines(選んだとき)
    BE-->>UI: シフト・血液浄化器・透析液などの候補
    UI->>BE: GET /fhir(患者の Condition、入院中の Encounter)
    BE->>FHIR: 検索
    FHIR-->>UI: 対象プロブレムの候補・入外区分の初期値
    Dr->>UI: 浄化方法・期間・曜日 × シフト・透析条件を入れて登録
    UI->>UI: 入力検証(validateDialysisOrderForm)
    alt 登録
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: POST ヘッダ ServiceRequest(fullUrl)<br/>Provenance(CREATE)、代行・研修医: Task order-approval
    else 編集
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: PUT ヘッダ(ifMatch。開いた時点の版)<br/>元が revoked なら revoked のまま(keepOrderRevoked)<br/>Provenance(UPDATE)
    end
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Dr->>UI: 削除
    UI->>BE: GET /fhir(Appointment?based-on=オーダー&status=有効)
    BE->>FHIR: 検索(strict、complete: true)
    FHIR-->>UI: 取ってある予約
    UI->>BE: GET /fhir(ServiceRequest?_id&_revinclude=Task:focus,Procedure:based-on,…)
    BE->>FHIR: 検索
    FHIR-->>UI: オーダー・進捗・実施記録
    UI->>UI: 実施記録があれば止める
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Appointment cancelled + Slot free(予約ごと)<br/>DELETE Task、DELETE ヘッダ
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 透析一覧と進捗の変更

`useDialysisWorklist`(`fetchWorklistBundles` で 500 件ずつ)、`useUpdateDialysisTaskStatus`。一覧か予約が上限で欠けたら `truncated` を出します。ホームのカードも同じ読み込みです。

```mermaid
sequenceDiagram
  autonumber
  actor Dept as 透析室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(ServiceRequest?category=order-type|dialysis&status=active,revoked)
  Note over UI,BE: order-period=ge基準日&order-period=le基準日<br/>based-on:missing=true、_include 患者、_revinclude Task:focus
  BE->>FHIR: 検索
  FHIR-->>UI: 基準日に効いているオーダー
  UI->>BE: GET /fhir(Appointment?date=ge基準日&service-type=…|dialysis&status=有効&_sort=date)
  BE->>FHIR: 検索
  FHIR-->>UI: 「次回予約」「予約(件数と最終日)」の列
  alt 受付・受付取消・再開・中止・中止取消・終了取消
    Dept->>UI: 行のボタン / ケバブ
    opt 中止
      UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge今日&status=有効)
      BE->>FHIR: 検索(strict、complete: true)
      FHIR-->>UI: 取り消す予約と枠
    end
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task を新しい状態に(無ければ POST。statusReason は消す)<br/>中止: PUT ヘッダ status=revoked + 予約の取消、中止取消: active(ifMatch)
  else 終了
    Dept->>UI: ケバブ「終了」→ 終了日
    UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge終了日の翌日&status=有効)
    BE->>FHIR: 検索(strict、complete: true)
    FHIR-->>UI: 取り消す予約と枠
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Task completed(executionPeriod.end)<br/>PUT ヘッダ dialysis-order-end = 終了日(ifMatch)<br/>PUT Appointment cancelled + Slot free(予約ごと)
  else 中断
    Dept->>UI: ケバブ「中断」→ 中断開始日・再開予定日
    UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge開始日&date=lt再開予定日の翌日&status=有効)
    BE->>FHIR: 検索(strict、complete: true)
    FHIR-->>UI: 取り消す予約と枠
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Task on-hold(statusReason.text = 「中断 from〜to」)<br/>PUT Appointment cancelled + Slot free(予約ごと)。ヘッダは触らない
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 予約の展開・臨時・空き枠・変更・入れ替え・取消

`planDialysisExpansion` / `buildDialysisAppointmentBatchBundle`(`useBookDialysisAppointments`)、`buildDialysisAppointmentBundle`、`buildDialysisRescheduleBundle`(`useRescheduleDialysisAppointment`)、`buildDialysisSwapBundle`(`useSwapDialysisAppointments`)、取消は `useCancelAppointment`。オーダーの登録とは独立した単独の transaction です。

```mermaid
sequenceDiagram
  autonumber
  actor Dept as 透析室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(Location?type=…|dialysis-unit、Schedule?service-type=…|dialysis)
  BE->>FHIR: 検索(complete: true)
  FHIR-->>UI: 透析室・ベッド・枠表
  alt 展開
    Dept->>UI: オーダーの行の「展開」→ 週数・ベッド
    UI->>BE: GET /fhir(Appointment?based-on=オーダー&status=有効,fulfilled&_sort=date)
    BE->>FHIR: 検索(strict、complete: true)
    FHIR-->>UI: 既予約(開始日・除外・前回のベッドの初期値)
    UI->>BE: GET /fhir(Slot?schedule=a,b,c&start=ge…&start=lt…)
    BE->>FHIR: 検索(カンマ OR、complete: true)
    FHIR-->>UI: 期間の枠(空き・埋まり)
    UI->>UI: 曜日 × シフトから日を起こし、枠あり / 枠なし / 既に予約あり を表に(上限 40 件)
    Dept->>UI: 「予約」
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: [POST Appointment(basedOn、患者 + ベッド、slot、dialysis-shift)<br/>+ PUT Slot busy(読んだ版の ifMatch)] × 件数
  else 臨時・空き枠から
    Dept->>UI: 「臨時」(日付・シフト・ベッド) / ボードの「空き」(患者)
    UI->>BE: GET /fhir(Slot?schedule=…&start=ge当日&start=lt翌日)
    BE->>FHIR: 検索
    FHIR-->>UI: その日 × シフトの枠の空き
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST Appointment + PUT Slot busy(1 件)
  else 予約変更・ドラッグ(空き枠へ)
    Dept->>UI: ケバブ「予約変更」/ カードを空き枠へ落とす
    UI->>BE: GET /fhir(Appointment が押さえている Slot)
    BE->>FHIR: 検索
    FHIR-->>UI: 前の枠
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Appointment(日時・slot・ベッドの participant・description・dialysis-shift)<br/>前の Slot free、新しい Slot busy
  else ドラッグ(別のカードへ)
    Dept->>UI: カードを同じ日 × シフトの別のカードへ落とす
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 2 件の Appointment の slot・ベッド・時刻・名前を交換する 2 PUT(ifMatch)<br/>Slot は busy のまま
  else 予約取消
    Dept->>UI: セルのケバブ「予約取消」(実施記録の無い予約だけ)
    UI->>BE: GET /fhir(Appointment が押さえている Slot)
    BE->>FHIR: 検索
    FHIR-->>UI: 押さえている枠
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Appointment cancelled、Slot free
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果(先に変わっていれば 412。枠の空きを読み直す)
```

## 各回の実施

`buildDialysisArrivalBundle` / `buildDialysisStartBundle` / `buildDialysisFinishBundle`(`useDialysisPerform`)、`buildDialysisPerformDeleteBundle`(`useCancelDialysisPerform`)。ボードは予約(`useDialysisBoard`)・枠(`useDialysisSlots`)・回(`useDialysisSessions`)を別々に読んで束ねます。

```mermaid
sequenceDiagram
  autonumber
  actor CE as 臨床工学技士・看護師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  par 期間に始めた回
    UI->>BE: GET /fhir(Procedure?category=order-type|dialysis&date=ge…&date=lt…)
  and 終わっていない回
    UI->>BE: GET /fhir(Procedure?category=…|dialysis&status=preparation,in-progress)
  end
  Note over UI,BE: どちらも _revinclude=Observation:part-of,<br/>MedicationAdministration:part-of, Procedure:part-of
  BE->>FHIR: 検索
  FHIR-->>UI: 回(ハブと子)。予約と突き合わせてセルに出す
  alt 入室
    CE->>UI: セルの「入室」
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST Procedure preparation(dialysis-appointment)<br/>PUT Appointment arrived(ifMatch)
  else 開始
    UI->>BE: GET /fhir(Observation?code=…|dry-weight&_sort=-date&_count=1)
    BE->>FHIR: 検索
    FHIR-->>UI: 直近のドライウェイト
    CE->>UI: 開始時刻・透析前の体重・血圧
    UI->>UI: validateDialysisPerformForm(start)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ハブ in-progress + performedPeriod.start(無ければ POST)<br/>POST Observation(体重・血圧)、Appointment arrived
  else 終了・一括記録
    UI->>BE: GET /fhir(Procedure?part-of=ハブ&category=…|dialysis-chart + 子)
    BE->>FHIR: 検索
    FHIR-->>UI: 経過表(透析後血圧・累積除水・薬剤の初期値)
    CE->>UI: 終了時刻・透析後の値・薬剤・器材・手技・DW
    UI->>UI: validateDialysisPerformForm(finish)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ハブ completed + performedPeriod + usedCode(無ければ POST)<br/>POST Observation・MedicationAdministration・子 Procedure<br/>DW を変えたら POST Observation dry-weight<br/>経過表のハブがあれば PUT completed<br/>PUT Appointment fulfilled
  else 実施取消
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE 経過表の子とハブ → DELETE 薬剤・測定値・子の手技 → DELETE ハブ<br/>PUT Appointment booked
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果(版違いは 412)
```

## 経過表・患者メモ・患者一覧・統計

経過表の書き込みは `useDialysisChartWrite`(1 点ずつ)、患者メモは `QuestionnaireResponseCreatePanel` / 編集パネル(`tag` を渡す)、患者一覧は `useDialysisPatientData`、統計は `useDialysisMonth`。

```mermaid
sequenceDiagram
  autonumber
  actor User as 透析室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 経過表
    UI->>BE: GET /fhir(Procedure?part-of=実施のハブ&category=…|dialysis-chart&_revinclude=Observation:part-of,MedicationAdministration:part-of)
    BE->>FHIR: 検索
    FHIR-->>UI: 経過表のハブと打点・できごと・薬剤
    User->>UI: 血圧・装置の値・できごと・薬剤を 1 点足す
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 初回は POST 経過表のハブ in-progress(partOf = 実施のハブ。urn:uuid で結ぶ)<br/>POST Observation / MedicationAdministration(partOf = 経過表のハブ)<br/>持続の「終了」は PUT MedicationAdministration(終了時刻。終わった回では回の終了が初期値)
  else 患者メモ
    UI->>BE: GET /fhir(QuestionnaireResponse?patient=…&_tag=…|dialysis-memo&_sort=-authored&_count=1&_include=questionnaire)
    BE->>FHIR: 検索(strict。_tag が効かないと別の回答を出すため)
    FHIR-->>UI: メモ(無ければ雛形 HD_MEMO_01 の有効な版)
    User->>UI: 記入・編集(シェーマの描き込み)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 初回 POST QuestionnaireResponse(meta.tag = dialysis-memo、encounter 無し)<br/>以後 PUT(ifMatch。版の履歴は _history)
  else 患者一覧
    UI->>BE: GET /fhir(Observation?code=…|dry-weight&subject=Patient/a,b,…&date=lt翌日&_sort=-date)× 50 人ずつ
    UI->>BE: GET /fhir(Observation?code=結果項目コード,…&subject=…&date=ge90日前&date=lt翌日&_sort=-date)× 20 人ずつ
    UI->>BE: GET /fhir(Procedure … 基準日までの 3 週間の回。ボードと同じ)
    BE->>FHIR: 検索
    FHIR-->>UI: DW の推移・採血・直近と前回の透析(欠けたら TruncatedNotice)
  else 月間統計
    UI->>BE: GET /fhir(Procedure?category=…|dialysis&date=ge月初&date=lt翌月初&_include=Procedure:based-on)
    UI->>BE: GET /fhir(Appointment?service-type=…|dialysis&date=…、Slot?schedule=…&start=…)
    BE->>FHIR: 検索(complete: true。1 か月 5,000 件まで)
    FHIR-->>UI: 実施・予約・枠 → 回数・稼働率・日別(CSV)
  end
```

## 退院での打ち切り

`usePatientDialysisOrders`(患者の有効なオーダーを全件読む)、`dialysisOrderNeedsStop`、`buildDialysisOrderStopEntries`(`api/queries/encounter.ts` の退院の transaction に積む)。

```mermaid
sequenceDiagram
  autonumber
  actor Ward as 病棟
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(ServiceRequest?subject=患者&category=order-type|dialysis&status=active)
  BE->>FHIR: 検索(complete: true。欠けた結果は使わない)
  FHIR-->>UI: 有効なオーダー
  UI->>UI: 入外区分が入院で、退院日より後まで続くものを選ぶ(dialysisOrderNeedsStop)
  Ward->>UI: 「入院の透析オーダーを退院日で終了する」にチェックのまま退院
  UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge退院日の翌日&status=有効)× 選んだオーダー
  BE->>FHIR: 検索(strict、complete: true)
  FHIR-->>UI: 取り消す予約と枠
  UI->>BE: POST /fhir(退院の transaction)
  Note over UI,BE: Encounter・ベッドの更新、食事・リハビリの打ち切りと一緒に<br/>PUT ヘッダ dialysis-order-end = 退院日(Task は動かさない)<br/>PUT Appointment cancelled + Slot free(予約ごと)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 医事会計と SS-MIX2

透析は実施記録から集めます(`BillingClaimBuilder` の `:procedure` 経路、`Resolvers::Dialysis`)。完了したハブ 1 件 = 1 剤で、日レセの診療種別区分は 400 です。
期間継続型(`continuous`)なので、実施記録の無い日のヘッダは報告しません。

- 手技: 維持透析(hd / hdf / i-hdf)は `performedPeriod` の分数で 4 時間未満 / 4〜5 時間 / 5 時間以上に分け、施設設定 `receipt_codes.dialysis` の浄化方法 × 時間区分のコードを引きます。急性血液浄化(chdf / chd / pe / dfpp / dhp)は浄化方法ごとに 1 つのコードです。追加の手技(子の Procedure)はそのコードのまま並べます(resolver を持つ種別では `PerformedItemBuilder` が子の手技を拾わないので、`Resolvers::Dialysis` が自分で並べます)。
- 薬剤: `dialysis-bundled-medication` の付いた薬剤は送りません。それ以外は処置と同じく医薬品コードと使用量で送ります。経過表の薬剤は送りません(終了の入力で実施記録の行にしたものだけ)。
- 器材: 血液浄化器は施設マスタ(`master_blood_purifiers`)の製品に紐付けた特定器材コード(`receipt_material_code`)に読み替えます(放射線の器材マスタと同じ解決。`PerformedItemBuilder::LOCAL_MATERIALS`)。紐付けの無い製品・手入力の製品は「送れない項目」に出します。
- 開始・終了の時刻が無い維持透析、施設設定にコードが無い浄化方法 × 時間区分、診療行為コードの無い追加の手技は「送れない項目」に理由つきで出します。
- 送らないもの: 慢性維持透析患者外来医学管理料・導入期加算・障害者等加算・時間外加算(患者属性や月次の判定が要るため医事側で付けます)。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集・削除 | なし | なし(`OMG^O19` の対象外) |
| 受付・終了・中断・中止・退院での打ち切り | なし | なし |
| 予約の展開・臨時・変更・入れ替え・取消 | なし | なし |
| 入室・開始 | なし(完了していないハブは集めない) | なし |
| 終了・一括記録 | 開始日に送る。時刻・コードが無いときは「送れない項目」に出す | なし |
| 実施取消 | 対象から外れる(DELETE) | なし |
| 経過表・患者メモ・ドライウェイト | なし | なし |
