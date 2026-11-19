# 栄養指導・服薬指導のシーケンス図

<!-- ../fhir-client/docs/order-flows/guidance.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[栄養指導・服薬指導の業務フロー](../flows/guidance.md)にあります。

## リソースの構成

| もの | リソース | 栄養指導 | 服薬指導 |
|---|---|---|---|
| オーダー(ヘッダ) | `ServiceRequest` | `category` = `order-type|nutrition-guidance` + `prescription-setting`、`code` = 指導形態(`nutrition-guidance-format`)、`occurrenceDateTime` = 開始日、`reasonCode` = 指導目的、`note` = 栄養部門への指示、`reasonReference` = 対象プロブレム | `category` = `order-type|medication-guidance` + `prescription-setting`、`code` = 指導区分(`medication-guidance-kind`)、`orderDetail[]` = 指導条件(`medication-guidance-condition`)、`occurrenceDateTime` = 開始日、`reasonCode` = 指導してほしいこと、`note` = 薬剤部への連絡事項、`reasonReference` = 対象プロブレム |
| 期間・対象 | ヘッダの拡張 | `nutrition-guidance-order-end`、`-target-disease`、`-target-condition`(写した元の Condition)、`-target-diet`(食種マスタの Coding、system は食事と共通の `meal-type`)、`-purpose-questionnaire-response` | `medication-guidance-order-end`、`-target-drugs` |
| 指導目的の記入内容 | `QuestionnaireResponse` | ヘッダの拡張から参照。ヘッダと同じ transaction で書き、テンプレートの解除・オーダーの削除で消す | – |
| 進捗 | `Task`(`focus` = ヘッダ) | `task-code|nutrition-guidance`。**登録時には作らず**、Task が無いオーダーは依頼済 | `task-code|medication-guidance`。`owner` = 担当薬剤師。担当だけ先に付けると依頼済のまま Task を作る |
| 実施記録 | `Procedure`(`basedOn` = ヘッダ) | `category` = `order-type|nutrition-guidance`、`code` = 指導種別(`nutrition-guidance-session-type`: initial / follow-up / group)、`performer` = 担当管理栄養士、拡張 `nutrition-guidance-performed-minutes`(分)・`nutrition-guidance-record`(指導記録の QR)、`note` = 指導内容 | `category` = `order-type|medication-guidance`、`code` = 指導種別(`medication-guidance-session-type`: standard / high-risk / discharge)、`performer` = 指導した薬剤師、拡張 `medication-guidance-understanding`(good / partial / poor)・`medication-guidance-record`、`note` = 指導内容 |
| 予約 | `Appointment`(`basedOn` = ヘッダ) + `Slot` | 枠表は `Schedule`(`serviceType` = `schedule-service-type|nutrition-guidance`)。定員は 1 に潰さない | – |
| 代行入力 | `Provenance`(`target` = ヘッダ) | 種別共通 | 種別共通 |

- 期間を開始日 + 終了日の拡張で持つ理由、上流の `order-period` 索引はリハビリと同じです([リハビリオーダーの業務フロー](../flows/rehab.md)「リソースの構成」)。
- 指導形態・指導種別・指導区分・指導条件・理解度は診療報酬上の固定の分類なので、DB マスタを持たずフロントの定数に置いています。

## 進捗 Task と status

**実施しても Task を動かしません。** リハビリと同じ逸脱で、初回の指導で終了扱いにならないようにするためです。実施ボタンを他部門と同じ形に揃えるリファクタをしないでください(`fhir/nutritionGuidanceTaskHelpers.ts`・`medicationGuidanceTaskHelpers.ts` の冒頭コメント)。

| Task | 表示 | `ServiceRequest.status` | ヘッダに書くもの |
|---|---|---|---|
| (無し)/ `requested` | 依頼済 | `active` | – |
| `accepted` | 実施中 | `active` | – |
| `completed` | 終了 | `active` のまま | `*-order-end`(終了日) |
| `cancelled` | 中止 | `revoked` | – |

- 遷移の表は `nutritionGuidanceTaskActions` / `medicationGuidanceTaskActions`、書き込みの入口は `useUpdateNutritionGuidanceTaskStatus` / `useUpdateMedicationGuidanceTaskStatus` です。中止・中止取消は `orderCancelEntries` でヘッダの status を揃えます。
- 終了で終了日を書くのは、部門一覧が `order-period` で引くので、終了日が無いと基準日に永久にヒットし続けるためです(`build*GuidanceOrderCloseEntry`)。終了取消では消しません(意図した非対称)。
- 栄養指導の終了・中止・退院は、もう来ない日の有効な予約の取消を同じ transaction に積みます(`fetchOrderAppointmentCancelEntries` の `from`。strict で全ページを読み、欠けたら書き込みを止める)。
- 担当薬剤師の変更(`useAssignMedicationGuidancePharmacist` / `buildMedicationGuidanceAssignment`)は Task だけを書きます。状態の変更(`buildTaskUpdate`)は元の Task を引き継ぐので担当は残ります。
- カルテのタイムラインは、`accepted` / `completed` のときに実施履歴を出します(`karteTimeline.ts`。リハビリと同じ)。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`。どちらもメッセージになりません)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。編集フォームは `useEditSnapshot` で開いた時点の版に固定します(`hooks/use*GuidanceOrderInitialValues.ts`)。

| 部品 | 栄養指導 | 服薬指導 |
|---|---|---|
| オーダーのフォーム | `components/NutritionGuidanceOrderForm.tsx`・`NutritionGuidanceOrderPanels.tsx`、詳細 `NutritionGuidanceOrderDetailPanel.tsx`、カード `karteCardBodies/NutritionGuidanceOrderCardBody.tsx` | `components/MedicationGuidanceOrderForm.tsx`・`MedicationGuidanceOrderPanels.tsx`、詳細 `MedicationGuidanceOrderDetailPanel.tsx`、カード `karteCardBodies/MedicationGuidanceOrderCardBody.tsx` |
| 組み立て | `fhir/nutritionGuidanceOrderHelpers.ts`・`nutritionGuidanceTaskHelpers.ts`・`nutritionGuidanceResultHelpers.ts`、予約 `fhir/appointmentHelpers.ts` の `buildNutritionGuidanceAppointmentBundle` | `fhir/medicationGuidanceOrderHelpers.ts`・`medicationGuidanceTaskHelpers.ts`・`medicationGuidanceResultHelpers.ts` |
| 部門の画面 | `pages/NutritionGuidanceWorklistPage.tsx`(依頼・予約の 2 ビュー、終了のモーダル) | `pages/MedicationGuidanceWorklistPage.tsx`(終了・担当のモーダル) |
| モーダル | 実施入力 `components/NutritionGuidancePerformModal.tsx`、次回予約・日時変更 `NutritionGuidanceBookModal.tsx`(`AppointmentSlotPicker` の `scheduleType="nutrition-guidance"`) | 実施入力 `components/MedicationGuidancePerformModal.tsx` |
| hook | `api/queries/nutritionGuidance.ts`、予約の取消・日時変更は `api/queries/appointment.ts` | `api/queries/medicationGuidance.ts` |
| 退院・パス | `components/DischargeModal.tsx`・`api/queries/encounter.ts`(`build*GuidanceOrderStopEntries`)、`components/PathwayOrderModal.tsx`(`acceptTask`) | 同左 |

## 登録・編集・削除

`buildNutritionGuidanceOrderBundle` / `buildNutritionGuidanceOrderUpdateBundle`、`buildMedicationGuidanceOrderBundle` / `buildMedicationGuidanceOrderUpdateBundle`、`useCreatePrescription`(`api/queries/labResult.ts`。全種別共通)、`useUpdate*GuidanceOrder`、`delete*GuidanceOrderRequest` / `postOrderDeleteBundle`(`api/queries/orderDelete.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 主治医
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 登録・編集
    UI->>BE: GET /fhir(患者の Condition、入院中の Encounter、栄養指導は食事オーダー)
    BE->>FHIR: 検索
    FHIR-->>UI: 病名・対象プロブレムの候補、入外区分の初期値、いまの食種
    opt 栄養指導の指示食種
      UI->>BE: GET /master/meal_diets
      BE-->>UI: 食種マスタ
    end
    Dr->>UI: 項目を入れて登録
    UI->>UI: 入力検証(validate*GuidanceOrderForm)
    alt 登録
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: 栄養指導の指導目的をテンプレートで書いた: POST QuestionnaireResponse(urn:uuid)<br/>POST ヘッダ ServiceRequest(fullUrl)<br/>Provenance(CREATE)、代行・研修医: Task order-approval
    else 編集
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: 記入内容の PUT / POST、解除した記入内容の DELETE(栄養指導)<br/>PUT ヘッダ(ifMatch。開いた時点の版)<br/>元が revoked なら revoked のまま(keepOrderRevoked)<br/>Provenance(UPDATE)
    end
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Dr->>UI: 削除
    opt 栄養指導
      UI->>BE: GET /fhir(ServiceRequest/id、Appointment?based-on=オーダー&status=有効)
      BE->>FHIR: 検索(予約は strict、complete: true)
      FHIR-->>UI: 指導目的の記入内容の参照と、取ってある予約
    end
    UI->>BE: GET /fhir(ServiceRequest?_id&_revinclude=Task:focus,Procedure:based-on,…)
    BE->>FHIR: 検索
    FHIR-->>UI: オーダー・進捗・実施記録
    UI->>UI: 実施記録があれば止める
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: 栄養指導: PUT Appointment cancelled + Slot free(予約ごと)、DELETE QuestionnaireResponse<br/>DELETE Task、DELETE ヘッダ
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 部門の一覧・進捗・担当

`useNutritionGuidanceWorklist` / `useMedicationGuidanceWorklist`(`fetchWorklistBundles` で 500 件ずつ)。一覧・実施・予約のどれかが上限で欠けたら `truncated` を出します。

```mermaid
sequenceDiagram
  autonumber
  actor Dept as 管理栄養士 / 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(ServiceRequest?category=order-type|種別&status=active,revoked)
  Note over UI,BE: order-period=ge基準日&order-period=le基準日<br/>based-on:missing=true、_include 患者、_revinclude Task:focus
  BE->>FHIR: 検索
  FHIR-->>UI: 基準日に効いているオーダー(Task の owner = 担当薬剤師)
  par 基準日の実施
    UI->>BE: GET /fhir(Procedure?category=order-type|種別&date=基準日)
    BE->>FHIR: 検索
    FHIR-->>UI: 「本日」の列
  and 基準日以降の予約(栄養指導)
    UI->>BE: GET /fhir(Appointment?date=ge基準日&service-type=…|nutrition-guidance&status=有効&_sort=date)
    BE->>FHIR: 検索
    FHIR-->>UI: 「次回予約」の列と「予約」ビュー
  end
  alt 受付・受付取消・中止取消・終了取消
    Dept->>UI: 行のボタン / ケバブ
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task を新しい状態に(無ければ POST)<br/>中止取消: PUT ヘッダ status=active(ifMatch)
  else 中止
    Dept->>UI: ケバブ「中止」
    opt 栄養指導
      UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge今日&status=有効)
      BE->>FHIR: 検索(strict、complete: true)
      FHIR-->>UI: 取り消す予約と枠
    end
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Task cancelled、PUT ヘッダ status=revoked(ifMatch)<br/>栄養指導: PUT Appointment cancelled + Slot free(予約ごと)
  else 終了
    Dept->>UI: ケバブ「終了」→ 終了日
    opt 栄養指導
      UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge終了日の翌日&status=有効)
      BE->>FHIR: 検索(strict、complete: true)
      FHIR-->>UI: 取り消す予約と枠
    end
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT Task completed(executionPeriod.end)<br/>PUT ヘッダ *-order-end = 終了日(ifMatch)<br/>栄養指導: PUT Appointment cancelled + Slot free(予約ごと)
  else 担当(服薬指導)
    Dept->>UI: ケバブ「担当」→ 薬剤師を選ぶ / 解除
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task の owner を書き換え(無ければ requested で POST)
  end
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

予約・日時変更・取消のシーケンスはリハビリと同じです(`useBookNutritionGuidanceAppointment` / `buildNutritionGuidanceAppointmentBundle`、`useRescheduleAppointment`、`useCancelAppointment`。[リハビリオーダーの業務フロー](../flows/rehab.md)「シーケンス図: 予約・日時変更・取消」)。

## 実施・実施の取消・退院での打ち切り

`build*GuidancePerformBundle`、`useRegister*GuidancePerform`、`useDelete*GuidancePerform`、退院は `build*GuidanceOrderStopEntries`(`usePatient*GuidanceOrders` で患者の有効なオーダーを全件読む)。

```mermaid
sequenceDiagram
  autonumber
  actor Staff as 管理栄養士 / 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 実施
    Staff->>UI: 行の「実施」
    UI->>BE: GET /fhir(Practitioner)
    BE->>FHIR: 検索
    FHIR-->>UI: 担当の候補
    opt 指導内容をテンプレートで書く
      UI->>BE: GET /fhir(Questionnaire)
      BE->>FHIR: 検索
      FHIR-->>UI: テンプレート
    end
    Staff->>UI: 指導種別・実施時間 / 理解度・担当・指導内容を入れて登録
    UI->>UI: validate*GuidancePerformForm
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST QuestionnaireResponse(urn:uuid。テンプレートで書いたとき)<br/>POST Procedure(basedOn = オーダー)<br/>進捗 Task は動かさない<br/>パスから依頼済のオーダーを実施: Task accepted も同じ transaction に
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施の取消
    Staff->>UI: 行の「表示」→ 実施履歴の「取消」
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE Procedure、DELETE QuestionnaireResponse(指導記録があれば)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(entered-in-error では残さない)
  else 退院での打ち切り
    UI->>BE: GET /fhir(ServiceRequest?subject=患者&category=order-type|種別&status=active)
    BE->>FHIR: 検索(complete: true。欠けた結果は使わない)
    FHIR-->>UI: 有効なオーダー
    UI->>UI: 退院日より後まで続くものを選ぶ(*GuidanceOrderNeedsStop)
    opt 栄養指導
      UI->>BE: GET /fhir(Appointment?based-on=オーダー&date=ge退院日の翌日&status=有効)× 選んだオーダー
      BE->>FHIR: 検索(strict、complete: true)
      FHIR-->>UI: 取り消す予約と枠
    end
    UI->>BE: POST /fhir(退院の transaction)
    Note over UI,BE: Encounter・ベッドの更新、食事・リハビリの打ち切りと一緒に<br/>PUT ヘッダ *-order-end = 退院日(Task は動かさない)<br/>栄養指導: PUT Appointment cancelled + Slot free(予約ごと)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 医事会計と SS-MIX2

栄養指導は実施記録から集めます(`BillingClaimBuilder` の `:procedure` 経路、`Resolvers::NutritionGuidance`)。実施 1 件 = 1 剤で、コードは施設設定の `receipt_codes.nutrition_guidance`(初回 / 2 回目以降 / 集団)から指導種別で引き、数量は 1 です。期間継続型(`continuous`)なので、実施記録の無い日のヘッダは報告しません。日レセの診療種別区分は 130 です。
服薬指導は送り方が未実装です(`OrderCatalog::PENDING`)。薬剤管理指導料・退院時薬剤情報管理指導料の区分を実施の指導種別から引く形にはしてありますが、コードの持ち方を決めていません。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集・削除 | 栄養指導はなし。服薬指導はオーダーの開始日の送信で「この種別はまだ医事会計へ送りません」と送れない項目に出す | なし(`OMG^O19` の対象外) |
| 受付・終了・中止・担当・退院での打ち切り | なし | なし |
| 予約・日時変更・取消(栄養指導) | なし | なし |
| 実施 | 栄養指導は実施日に送る。指導種別が無い、施設設定にコードが無いときは「送れない項目」に出す。服薬指導は送らない | なし |
| 実施の取消 | 対象から外れる(DELETE) | なし |
