# 生理検査・内視鏡・処置オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/physio-endoscopy-treatment.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[生理検査・内視鏡・処置オーダーの業務フロー](../flows/physio-endoscopy-treatment.md)にあります。

## リソースの構成

オーダーはヘッダの `ServiceRequest`(`order-type|physio` / `endoscopy` / `treatment`)と、項目 1 件ずつの明細 `ServiceRequest`(`basedOn` でヘッダを指す)です。セットの構成項目はさらに親の明細を `basedOn` で指します。
放射線との違いは、明細に JJ1017 のコードと `bodySite` が無いこと、実施記録に被曝線量の `Observation` が無いこと、処置の明細が `category`・`reason*`・`note`・拡張を持たないことです。

| もの | 生理検査 | 内視鏡 | 処置 |
|---|---|---|---|
| 明細の項目コード | `physio-order-item` | `endoscopy-order-item` | `treatment-order-item` |
| 明細の `category` | `physio-exam-type`(検査種別) | `endoscopy-exam-type`(検査種別) | なし |
| ヘッダの `priority` | `routine`(通常)/ `urgent`(至急)/ `asap`(事後) | 同じ | 書かない |
| 検査目的・特別指示 | GP の明細に拡張 `physio-exam-purpose` と `note`、テンプレート回答は拡張 `physio-exam-purpose-questionnaire-response` / `physio-remarks-questionnaire-response` | `endoscopy-*` の同名の拡張 | なし |
| 進捗 | `Task`(`task-code|physio-exam`、`focus` = ヘッダ) | `Task`(`task-code|endoscopy-exam`) | `Task`(`task-code|treatment`) |
| 予約 | `Appointment`(`basedOn` = ヘッダ)+ `Slot` | 同じ | 同じ |
| 実施記録 | ハブ `Procedure`(`category` = `order-type|physio`、`code` = 手技 1 件目の `physio-procedure-code`、`usedCode` = 器材 + 拡張 `physio-material-quantity`)← `partOf` ── `Procedure`(2 件目以降の手技)、`MedicationAdministration`(薬剤) | `endoscopy-*` の同じ形。薬剤にロット番号 | `treatment-*` の同じ形。薬剤にロット番号 |
| 所見レポート | `DiagnosticReport`(`category` = `order-type|physio` と v2-0074 `OTH`、`code` = `exam-report-code|physio`、`conclusion` = 判定)+ `Observation`(所見) | `DiagnosticReport`(`category` = `order-type|endoscopy` と `OTH`、`code` = LOINC `18751-8`) | なし |
| 重要所見の通知 | `Task`(`task-code|physio-critical-finding`、`focus` = レポート) | `Task`(`task-code|endoscopy-critical-finding`) | なし |
| 検査結果確認・フォロー推奨・確認(既読) | 放射線と同じ(`result-review`・`followup-recommendation`・`Provenance` verifier) | 同じ | なし |
| 代行入力・警告の確認 | `Provenance`(`target` = ヘッダ) | 同じ | 代行入力だけ |

所見レポートの部品は放射線と共用で、違いは `EXAM_REPORT_CONFIGS.physio` / `.endoscopy`(`fhir/examReportHelpers.ts`)の設定だけです。
`category` に v2-0074 の `OTH` を持つので、検体検査・細菌・病理の結果タブには混ざりません。

## 進捗 Task

状態と遷移は 3 種別で同じで、`fhir/examTaskHelpers.ts` の `examTaskActions` と `createExamTaskHelpers` を `Task.code` だけ変えて使います。
Task は登録時には作らず、**Task が無いオーダーは依頼済**です。即実施だけは登録と同じ transaction で `completed` の Task を作ります。
各状態で同じ transaction に書くものは放射線と同じです([放射線検査オーダーの業務フロー](../flows/rad.md)「進捗 Task」)。実施の取消で消す実施記録に `Observation` が無いことだけが違います(`performCancelEntries` の `observations: false`)。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。

生理検査と内視鏡の hook は `api/queries/examOrder.ts` の `createExamOrderQueries` が部門の設定から作ります(`api/queries/physio.ts`・`endoscopy.ts`)。処置は同じ形を `api/queries/treatment.ts` に直接持ちます。
下の図の `X` は `Physio` / `Endoscopy` / `Treatment` のどれかです。

| 部品 | 生理検査 | 内視鏡 | 処置 |
|---|---|---|---|
| フォーム | `components/PhysioOrderForm.tsx`・`PhysioOrderPanels.tsx` | `EndoscopyOrderForm.tsx`・`EndoscopyOrderPanels.tsx` | `TreatmentOrderForm.tsx`・`TreatmentOrderPanels.tsx` |
| オーダーの組み立て | `fhir/physioOrderHelpers.ts` | `fhir/endoscopyOrderHelpers.ts` | `fhir/treatmentOrderHelpers.ts` |
| 実施記録の組み立て | `fhir/physioResultHelpers.ts` | `fhir/endoscopyResultHelpers.ts` | `fhir/treatmentResultHelpers.ts` |
| 部門一覧 | `pages/PhysioWorklistPage.tsx` → `ExamWorklistPage.tsx` | `pages/EndoscopyWorklistPage.tsx` → `ExamWorklistPage.tsx` | `pages/TreatmentWorklistPage.tsx` |
| 実施入力 | `components/PhysioPerformModal.tsx` | `EndoscopyPerformModal.tsx` | `TreatmentPerformModal.tsx` |
| 警告 | `useInfectionAdvisory`・`useAdvisoryRuleAdvisories(…, "physio")` | 同じ(`"endoscopy"`) | なし |

## 登録・編集・削除

`buildXOrderBundle` / `buildXOrderUpdateBundle` / `buildXOrderDeleteBundle`、`buildXOrderWithPerformBundle`(即実施)、`useCreatePrescription`(`api/queries/labResult.ts`。全種別共通)、`useUpdateXOrder` / `useDeleteXOrder`。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 登録
    UI->>BE: GET /master/...(伝票・項目・セットの構成・検査種別)
    BE-->>UI: マスタ
    opt 生理・内視鏡
      UI->>BE: GET /master/advisory_rules、GET /fhir(感染症の記録・規則が読む記録)
      BE-->>UI: 施設の規則とカルテの記録
      UI->>UI: 警告を判定して表示
    end
    Dr->>UI: 項目・実施日時または枠・(生理・内視鏡は至急区分・依頼病名など)を入力して登録
    UI->>UI: 入力検証
    opt 確認を要する警告がある(生理・内視鏡)
      UI-->>Dr: 確認モーダル
      Dr->>UI: 理由を選んで登録
    end
    opt 生理・内視鏡
      UI-)BE: POST /master/advisory_events(発火・無視の台帳)
    end
    UI->>UI: splitXOrderValues で単独の項目を別オーダーに分ける
    UI->>UI: Bundle を組む
    Note over UI: オーダーごとにヘッダ ServiceRequest(fullUrl)+ 明細 × 項目<br/>生理・内視鏡: テンプレート回答 QuestionnaireResponse<br/>予約: Appointment(basedOn = ヘッダ)+ Slot busy<br/>即実施: 実施記録一式 + Task = completed<br/>登録時の入院病棟を order-ward に<br/>Provenance(CREATE)<br/>代行・研修医: Task order-approval
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 編集
    UI->>BE: GET /fhir(ヘッダ + 明細、Appointment?based-on)
    BE->>FHIR: 検索
    FHIR-->>UI: オーダー一式と予約
    Dr->>UI: 直して更新
    opt 枠を選び直した
      UI->>BE: GET /fhir(元の Slot)
      BE->>FHIR: 読む
      FHIR-->>UI: 元の枠
    end
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ(ifMatch)・明細(差分で POST / PUT / DELETE)<br/>外したテンプレート回答は DELETE(生理・内視鏡)<br/>枠の変更: Appointment の日時 + 元の Slot free + 新しい Slot busy<br/>Provenance(UPDATE)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Dr->>UI: 削除
    UI->>BE: GET /fhir(ServiceRequest?_id + 明細・Appointment・DiagnosticReport)
    BE->>FHIR: 検索
    FHIR-->>UI: オーダー一式
    UI->>UI: 所見レポートがあれば止める(生理・内視鏡)
    UI->>BE: GET /fhir(オーダーを指す Task・Procedure・DiagnosticReport ほか)
    BE->>FHIR: 検索
    FHIR-->>UI: 依存リソース(実施記録・結果があれば止める)
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE ヘッダ・明細・Task<br/>生理・内視鏡はテンプレート回答も DELETE<br/>有効な予約は Appointment cancelled + Slot free
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 日付未定の予約(生理検査・内視鏡)

放射線と同じ書き込みです([放射線検査オーダーの業務フロー](../flows/rad.md)「シーケンス図: 日付未定の予約」)。`ExamWorklistPage.tsx` の日付未定タブ(`UNSCHEDULED_WORKLIST_DATE` で `occurrence:missing=true` を引く)から `components/ExamBookingModal.tsx`、`useScheduleExamOrder`(`api/queries/worklist.ts`)、`buildExamScheduleBundle`(`fhir/appointmentHelpers.ts`)を通ります。枠表と所要時間は、オーダーの項目のうち枠表を持つ最初の項目のマスタ値を初期値にします。

## 受付・実施・取消・中止

`useXWorklist` / `useUpdateXTaskStatus` / `useRegisterXPerform`、`makeUpdateTaskStatusHook`(`api/queries/worklist.ts`。`releaseAppointments` と `cancelPerform` を有効にして使う)、`buildXPerformBundle` / `buildXPerformDeleteEntries`。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(ServiceRequest?category=order-type|X&occurrence=実施日&based-on:missing=true)
  Note over UI,BE: _include 患者、_revinclude 明細・Task<br/>生理・内視鏡は DiagnosticReport も
  BE->>FHIR: 検索
  FHIR-->>UI: 1 日ぶんのオーダー
  UI->>BE: GET /master/X_items(実施入力の有無・枠表)
  BE-->>UI: 項目マスタ
  alt 受付
    Tech->>UI: 受付
    UI->>BE: POST /fhir(Task = accepted)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施(実施入力あり)
    Tech->>UI: 実施
    UI->>BE: GET /master/X_datasets(項目のデータセット)
    BE-->>UI: 初期行と候補
    opt 内視鏡・処置
      UI->>BE: GET /master(薬剤付加情報のロット管理)
      BE-->>UI: ロットを記録する薬
    end
    Tech->>UI: 手技・薬剤・器材を確かめて実施登録
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST ハブ Procedure + 子 Procedure<br/>MedicationAdministration(薬剤)<br/>Task = completed
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施(実施入力なし)
    Tech->>UI: 実施
    UI->>BE: POST /fhir(Task = completed)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施の取消
    Tech->>UI: 取消
    opt 生理・内視鏡
      UI->>BE: GET /fhir(DiagnosticReport?based-on&_summary=count)
      BE->>FHIR: 検索
      FHIR-->>UI: 件数(1 件以上なら止める)
    end
    UI->>BE: GET /fhir(Procedure?based-on + 子)
    BE->>FHIR: 検索
    FHIR-->>UI: 実施記録一式
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE 子(薬剤・手技)→ ハブ<br/>Task = accepted
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 中止・中止取消
    Tech->>UI: 中止 / 中止取消
    opt 中止
      UI->>BE: GET /fhir(Appointment?based-on + 有効な予約、Slot)
      BE->>FHIR: 検索
      FHIR-->>UI: 予約と枠
    end
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task = cancelled / requested<br/>PUT ヘッダ revoked / active<br/>中止なら Appointment cancelled + Slot free
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 所見レポートと結果確認(生理検査・内視鏡)

放射線の読影レポートと同じ書き込みです([放射線検査オーダーの業務フロー](../flows/rad.md)「シーケンス図: 読影レポート」「シーケンス図: 結果確認」)。
部品は `components/ExamReportEntryModal.tsx`・`ExamReportForm.tsx`・`KarteExamReportTab.tsx`、`buildExamReportBundle`(`fhir/examReportHelpers.ts`)、`useSaveExamReport` / `useDeleteExamReport`(`api/queries/examReport.ts`)で、
読み替えるのは `DiagnosticReport` の `category` と `code`、重要所見の `Task.code`(`physio-critical-finding` / `endoscopy-critical-finding`)、拡張の接頭辞(`physio-` / `endoscopy-`)です。

## 医事会計と SS-MIX2

3 種別とも放射線と同じく実施記録から集めます(`BillingClaimBuilder` の `:procedure` 経路、`OrderCatalog`)。手技はハブと子の `Procedure.code` で、オーダー項目の `receipt_code` は使いません。
薬剤・器材・実施コメントと一緒に 1 剤にし、剤の区分は手技の点数表の章から決めます。放射線にある部位のコメントは付きません。日付は実施時刻の日です。
実施入力のない項目だけのオーダーに限り、オーダーの実施日と項目の `receipt_code` で組みます。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集・予約 | なし | 生理は OMG^O19(OMG-03)、内視鏡は OMG^O19(OMG-02)。ヘッダを書くと出す。OBR-4 は検査種別・項目のローカルコード。処置はなし |
| 受付 | なし | なし(進捗 Task はメッセージにしない) |
| 実施(実施入力あり) | 実施記録から手技・薬剤・器材・コメントを送る。コードの無い行(手入力の器材など)は「送れない項目」に出す | 内視鏡は OMI^Z23(OMG-12)。生理・処置はなし |
| 実施(実施入力なし) | 部門が実施済にしたオーダーの項目を `receipt_code` で送る | なし |
| 当日の未実施 | 実施入力ありは「実施記録がありません(未実施のため送りません)」、なしは「部門で実施済になっていません」と報告 | なし |
| 実施の取消 | 対象から外れる | 内視鏡は OMI^Z23 の `CA`(DEL) |
| 中止 | 対象から外れる(`ServiceRequest` が `revoked`)。送ったあとの中止は医事が送り直す | 生理・内視鏡は OMG^O19 の `CA`(DEL)。中止取消は `NW`(INS) |
| 削除 | 対象から外れる | 生理・内視鏡は OMG^O19 の `CA`(DEL) |
| 所見レポートの保存・訂正・削除 | なし | 生理は ORU^R01(OMG-13)。所見と判定を OBX の TX に置き、訂正も INS、削除は DEL。内視鏡はなし |
