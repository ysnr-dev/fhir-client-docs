# 手術オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/surgery.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[手術オーダーの業務フロー](../flows/surgery.md)にあります。

## リソースの構成

申込はヘッダの `ServiceRequest`(`order-type|surgery`)と、術式 1 件ずつの明細 `ServiceRequest`(`basedOn` でヘッダを指す。並び順 1 が主術式)です。
ヘッダに予定日時(`occurrenceDateTime`。未定なら出さない)・所要時間・手術室・執刀科・スタッフ・麻酔・輸血準備・特殊機器・検体提出予定・同意書・術前指示をローカル拡張で、明細に術式コード(`surgery-order-item`)・K コード・部位と左右(`bodySite`)・到達法・術前診断を持ちます。

| もの | リソース | 補足 |
|---|---|---|
| 進捗 | `Task`(`task-code|surgery`、`focus` = ヘッダ) | 下の表 |
| 術前指示(テンプレート記入) | `QuestionnaireResponse` | ヘッダの拡張 `surgery-preop-instruction-questionnaire-response` が指す。申込と同じ transaction で書き、削除で一緒に消す |
| 麻酔科術前診察 | `QuestionnaireResponse`(`basedOn` = ヘッダ、`SUR_ANESPRE_01`) | 1 手術 1 件。`in-progress`(記入中)/ `completed`(確定)。要点は linkId(`anes_asa` など)で読む |
| 実施記録 | ハブ `Procedure`(`order-type|surgery`、`status = completed`、`code` = 実施術式 1 件目の K コード、`performedPeriod` = 入室〜退室、`performer` = 役割つき複数、拡張 = 中間時刻・創分類・カウント)← `partOf` ── `Procedure`(2 件目以降の術式・麻酔 L)、`MedicationAdministration`(薬剤)、`Observation`(出血量・尿量・輸血量。`category` 無し) | 実施取消で記録ごと消す |
| 麻酔チャート | ハブ `Procedure`(`order-type|anesthesia-chart`、記録中 `in-progress` / 確定 `completed`)← `partOf` ── `Observation`(打点。`category` 無し)、`Observation`(イベント `anesthesia-event`)、`MedicationAdministration`(単回 / 持続) | 実施記録と別のツリー。振り分けは必ずハブの `category` で行う |
| NCD 症例登録 | `QuestionnaireResponse`(`partOf` = 実施記録ハブ、`NCD_CASE_01`) | 登録状況は回答の項目 |
| ブロックスケジュール | backend `master_surgery_room_blocks` | 曜日ごとの科割当。警告だけで止めない |

## 進捗 Task(`surgery`)

Task は申込時には作りません。**Task が無い申込は申込済**として扱い、最初のステータス変更で作ります(`fhir/surgeryTaskHelpers.ts`)。
中止は同じ transaction でヘッダを `revoked` にし、中止取消で `active` に戻します(`orderCancelEntries`)。中止した申込を編集しても `revoked` のままです(`keepOrderRevoked`)。

| 状態 | `Task.status` | `executionPeriod` | 同じ transaction で書くもの |
|---|---|---|---|
| <span class="chip state-waiting">申込済</span> | `requested`(または Task 無し) | なし | |
| <span class="chip state-active">受付済</span> | `accepted` | `start` | 日程確定ならヘッダ・明細の `occurrenceDateTime`・所要時間・手術室 |
| <span class="chip state-active">入室中</span> | `in-progress` | `start` | 緊急の入室ならヘッダ・明細の `occurrenceDateTime` |
| <span class="chip state-done">実施済</span> | `completed` | `start` / `end` | 実施記録(ハブ + 子) |
| <span class="chip state-stop">中止</span> | `cancelled` | なし | ヘッダ `revoked` |

取消で戻すときに消すもの: 実施取消は実施記録(`category = surgery` のハブとその子だけ。麻酔チャートのツリーは残す)。受付取消・入室取消・中止取消は何も消しません。日程の移動(`buildSurgeryMoveBundle`)は Task に触りません。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`。手術は電文にしません)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。
麻酔チャートだけは 1 点ずつ書く(打点 1 時点の組が 1 transaction、イベント・薬剤は 1 件ずつ)ので、他の種別と保存の単位が違います。

## 申込・編集・削除

`components/SurgeryOrderForm.tsx`・`SurgeryOrderPanels.tsx`(カレンダーからは `SurgeryOrderModals.tsx` が同じパネルを包む)、`buildSurgeryOrderBundle` / `buildSurgeryOrderUpdateBundle` / `buildSurgeryOrderDeleteBundle`(`fhir/surgeryOrderHelpers.ts`)、
`hooks/useSurgeryConflictCheck.ts`、`useCreatePrescription`(全種別共通)/ `useUpdateSurgeryOrder` / `useDeleteSurgeryOrder`(`api/queries/surgery.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 主治医
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 申込
    UI->>BE: GET /master/surgery_items、GET /master/surgery_room_blocks
    BE-->>UI: 術式マスタ(既定の所要時間・到達法・体位・麻酔・術前指示テンプレート)、科の割当
    UI->>BE: GET /fhir(手術室の Location、医療従事者)
    BE->>FHIR: 検索
    FHIR-->>UI: 手術室・スタッフの候補
    Dr->>UI: 術式・部位と左右・スタッフ・麻酔・準備・同意書・術前指示・希望日を入力
    opt 日付と手術室を選んでいる
      UI->>BE: GET /fhir(その日の手術一覧。キャッシュを使わない)
      BE->>FHIR: 検索
      FHIR-->>UI: その日・その部屋の予定(重なりを表示)
    end
    Dr->>UI: 登録
    UI->>UI: 入力検証(術式・左右・執刀医・麻酔科医)
    opt 日付・手術室・入室時刻が揃う
      UI->>BE: GET /fhir(その日の手術一覧を引き直す)
      BE->>FHIR: 検索
      FHIR-->>UI: 同じ部屋の重なり
      opt 重なりがある・確かめられない
        UI-->>Dr: 確認モーダル
        Dr->>UI: 重なりを承知で登録
      end
    end
    UI->>UI: Bundle を組む
    Note over UI: ヘッダ ServiceRequest(fullUrl)+ 明細 ServiceRequest × 術式<br/>登録時の入院病棟を order-ward に<br/>術前指示: QuestionnaireResponse(POST)<br/>Provenance(CREATE)、代行・研修医: Task order-approval
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 編集
    UI->>BE: GET /fhir(ヘッダ + 明細 + 術前指示の回答)
    BE->>FHIR: 検索
    FHIR-->>UI: 申込一式
    Dr->>UI: 直して更新(日程を変えれば重なりの確認)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ(ifMatch、revoked なら保つ)<br/>明細は差分で POST / PUT / DELETE<br/>術前指示の回答は POST / PUT、外したものは DELETE<br/>Provenance(UPDATE)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 削除
    Dr->>UI: 削除
    UI->>BE: GET /fhir(ヘッダを指す明細・Task・Procedure)
    BE->>FHIR: 検索
    FHIR-->>UI: 明細・Task・実施記録・チャート
    alt 実施記録・麻酔チャート・術前診察がある
      UI-->>Dr: 削除できない
    else 無い
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: DELETE 明細 → ヘッダ<br/>DELETE Task、術前指示の回答
      BE->>BE: 削除の来歴を Bundle に足す
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  end
```

## 日程確定・移動・緊急の入室

`pages/SurgeryWorklistPage.tsx`、`components/SurgeryScheduleModal.tsx`・`SurgeryCalendar.tsx`・`SurgeryMoveConfirmModal.tsx`、`buildSurgeryScheduleBundle` / `buildSurgeryMoveBundle`(`fhir/surgeryOrderHelpers.ts`)、
`useConfirmSurgerySchedule` / `useMoveSurgerySchedule` / `useAdmitUnscheduledSurgery` / `useUpdateSurgeryTaskStatus`(`api/queries/surgery.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor OR as 手術部
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 受付(予定日別タブ)
    OR->>UI: 受付
    UI->>BE: POST /fhir(transaction、Task surgery = accepted)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 日程確定(日程未定タブ)
    UI->>BE: GET /fhir(occurrence:missing=true)
    BE->>FHIR: 検索
    FHIR-->>UI: 日程未定の申込(緊急 → 準緊急 → 予定、申込日の古い順)
    OR->>UI: 日程確定(日・入室時刻・所要時間・手術室)
    UI->>BE: GET /fhir(その日の手術一覧を引き直す)
    BE->>FHIR: 検索
    FHIR-->>UI: 同じ部屋の重なり(確認モーダル)
    UI->>BE: GET /fhir(明細 ServiceRequest)
    BE->>FHIR: 検索
    FHIR-->>UI: 術式の明細
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ(occurrenceDateTime・所要時間・手術室)<br/>PUT 明細 × 術式(occurrenceDateTime を揃える)<br/>Task surgery = accepted
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else カレンダーで移動・リサイズ
    OR->>UI: カードをドラッグ(5 分刻み)/ 縁を引く
    UI->>BE: GET /fhir(移動先の日の手術一覧を引き直す)
    BE->>FHIR: 検索
    FHIR-->>UI: 重なり・科の割当(確認モーダル)
    OR->>UI: 移動(重なりを承知で移動)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ・明細(occurrenceDateTime・所要時間・手術室だけ差し替え)<br/>Task は触らない
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 緊急の入室(日程未定タブ)
    OR->>UI: 入室
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ・明細(occurrenceDateTime = 押した日時)<br/>Task surgery = in-progress
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 麻酔科術前診察

`pages/AnesthesiaPreopPage.tsx`、`useAnesthesiaPreopList` / `useAnesthesiaPreop`(`api/queries/surgery.ts`)、`fhir/anesthesiaPreopHelpers.ts`、`fhir/populateSurgery.ts`(初期値の変数)。記入はカルテの右ペイン「テンプレート登録」(`?open=order-template:<オーダー id>@<テンプレートの url>`)です。

```mermaid
sequenceDiagram
  autonumber
  actor An as 麻酔科医
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(期間内と日程未定の手術 + 明細・Task + QuestionnaireResponse:based-on)
  BE->>FHIR: 検索
  FHIR-->>UI: 手術と術前診察の状況
  An->>UI: 記入(カルテの右ペインが開く)
  UI->>BE: GET /master/facility_settings(テンプレート)、GET /fhir(Questionnaire、初期値の元)
  BE->>FHIR: 検索
  FHIR-->>UI: テンプレート・手術の予定・身長体重・既往歴・アレルギー・内服薬
  An->>UI: 評価・気道・指示を入れて保存(記入中 / 確定)
  alt 新規
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST QuestionnaireResponse(basedOn = ヘッダ、status = in-progress / completed)
  else 続き・訂正
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT QuestionnaireResponse(ifMatch)
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  Note over UI: 手術一覧の列・手術カード・手術の詳細・麻酔チャートの帯は basedOn で引く<br/>麻酔記録 SUR_ANES_01・NCD_CASE_01 の ASA-PS は %preopAsa で初期値
```

## 入室・麻酔チャート・実施・実施取消

`pages/AnesthesiaChartPage.tsx`・`components/AnesthesiaChartPanel.tsx`、`useAnesthesiaChart` / `useAnesthesiaChartWrite`(`api/queries/anesthesia.ts`)、`fhir/anesthesiaChartHelpers.ts`、
`components/SurgeryPerformModal.tsx`、`buildSurgeryPerformBundle` / `buildSurgeryPerformDeleteEntries`(`fhir/surgeryResultHelpers.ts`)、`useRegisterSurgeryPerform` / `useUpdateSurgeryTaskStatus`。

```mermaid
sequenceDiagram
  autonumber
  actor OR as 手術室
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  OR->>UI: 入室
  UI->>BE: POST /fhir(transaction、Task surgery = in-progress)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  opt 麻酔チャート
    OR->>UI: 麻酔チャート(行メニュー)
    UI->>BE: GET /fhir(Procedure?based-on + 子を part-of でページング)
    BE->>FHIR: 検索
    FHIR-->>UI: チャート(無ければ「開始」)
    OR->>UI: 開始
    UI->>BE: POST /fhir(Procedure ハブ、anesthesia-chart、in-progress)
    BE->>FHIR: POST /
    loop 術中
      OR->>UI: 打点(1 時点の組)/ イベント / 薬剤(単回・持続の開始と終了)
      UI->>BE: POST /fhir(transaction、Observation × 項目 / MedicationAdministration)
      BE->>FHIR: POST /
    end
    OR->>UI: 確定
    UI->>BE: PUT /fhir/Procedure(completed、performedPeriod.end)
    BE->>FHIR: PUT
  end
  alt 実施入力
    OR->>UI: 実施(退室後)
    UI->>BE: GET /fhir(Procedure?based-on + 子)
    BE->>FHIR: 検索
    FHIR-->>UI: 既存の記録(初期値は申込の術式・スタッフ・予定入室時刻)
    OR->>UI: 時刻・実施術式(K・L)・スタッフ・測定値・記録・薬剤・材料を入れて登録
    UI->>UI: 入力検証(時刻の順・執刀医・カウント不一致のコメント)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST Procedure(ハブ、code = K、performedPeriod、performer × 役割、拡張)<br/>POST Procedure × 2 件目以降の術式・麻酔(partOf・basedOn)<br/>POST MedicationAdministration × 薬剤<br/>POST Observation × 測定値<br/>Task surgery = completed
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施取消
    OR->>UI: 行メニュー「実施取消」
    UI->>BE: GET /fhir(Procedure?based-on + 子)
    BE->>FHIR: 検索
    FHIR-->>UI: 実施記録とチャートのツリー
    UI->>UI: category = surgery のハブと子だけを選ぶ
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE Observation・MedicationAdministration → 子 Procedure → ハブ<br/>Task surgery = in-progress
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 医事会計と SS-MIX2

手術は実施記録から集めます(`BillingClaimBuilder` の `:procedure` 経路)。ハブと子の `Procedure.code`(K 章・L 章)が手技、薬剤・材料は直前の手技の剤に付きます。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 申込・編集・受付・日程の移動・入室 | なし | なし(手術の電文は持たない) |
| 実施 | 当日の実施記録から、K 章の手技とその薬剤・材料を 500 の剤、L 章(麻酔)とその薬剤を 540 の剤として送る。麻酔時間の加算は実施入力で足す | なし |
| 麻酔チャート | 拾わない(チャートの薬剤は算定しない) | なし |
| 実施記録の無い当日の申込 | 「実施記録がありません(未実施のため送りません)」と報告 | なし |
| 実施取消 | 対象から外れる | なし |
| 中止 | 対象から外れる(`ServiceRequest` が `revoked`) | なし |
| 削除 | 対象から外れる | なし |

看護必要度の C 項目は実施記録の K コードから推します。DPC の様式 1・NCD は K コード・到達法・創分類・合併症を起点にするので、構造化を崩さないでください。
