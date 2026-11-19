# 輸血オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/transfusion.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[輸血オーダーの業務フロー](../flows/transfusion.md)にあります。

## リソースの構成

ヘッダの `ServiceRequest`(`order-type|transfusion`)と、製剤 1 種類ずつの明細 `ServiceRequest`(`basedOn` でヘッダを指す)です。
ヘッダに検査区分(`code`)・投与予定日時(`occurrenceDateTime`)・緊急度(`priority`)・使用場所(`locationReference`)・使用目的・患者の型(`transfusion-abo` / `transfusion-rhd`。不明は `unknown`)・同意書の確認(`transfusion-consent`)、明細に製剤(`code`)・単位数(`quantityQuantity`)・製剤の型を持ちます。

| もの | リソース | 補足 |
|---|---|---|
| 進捗 | `Task`(`task-code|transfusion`、`focus` = ヘッダ) | 下の表 |
| 出庫記録 | ハブ `Procedure`(`procedure-category|transfusion-dispense`、`basedOn` = ヘッダ)← `partOf` ── `MedicationDispense` × バッグ | 製剤番号は `identifier`(`blood-product-number`)、型・有効期限・照射・交差適合試験・抗原陰性は拡張。出庫者と適合試験者は `performer.function` |
| 実施記録 | ハブ `Procedure`(`order-type|transfusion`、`performedPeriod`、`performer` = 実施者・確認者、拡張 `transfusion-verification`)← `partOf` ── `MedicationAdministration` × バッグ(未実施・返却は `not-done` + `statusReason`)、`Observation`(副作用。症状は `component`、`transfusion-reaction-timing` = immediate / delayed)、`Observation`(観察のバイタル。`vital-signs` + `transfusion-observation-point`) | 製剤番号は `MedicationAdministration` の拡張 `transfusion-lot-number` |
| 自己血の採血予定 | `Appointment`(`basedOn` = ヘッダ、`serviceType` = `autologous`、予定量は拡張) | booked → fulfilled / cancelled。枠(Schedule/Slot)は使わない |
| 自己血の採血記録 | ハブ `Procedure`(`procedure-category|autologous-collection`、拡張 `autologous-appointment` = 予定)← `partOf` ── `MedicationDispense`(`status = preparation`、製剤番号・型・有効期限) | 出庫で本人の記録から選ぶ |
| 血液型・不規則抗体 | 検体検査の `Observation`(結果項目コード + JLAC11 K1001 / K1006、不規則抗体は結果項目コード) | 2 検体一致で確定(`fhir/bloodTypeHelpers.ts`) |
| 不規則抗体の特異性・移植後の型 | `Observation`(`category = exam`、`transfusion-profile|…`) | プロファイルタブで手入力 |
| 警告の確認 | 警告の台帳(`POST /master/advisory_events`)と `Provenance` | 文脈は `transfusion-order` / `transfusion-dispense` / `transfusion-perform` / `autologous-collection` |

## 進捗 Task(`transfusion`)

Task は登録時には作りません。**Task が無いオーダーは依頼済**として扱い、最初のステータス変更で作ります(`fhir/transfusionTaskHelpers.ts`)。
中止は同じ transaction でヘッダを `revoked` にし、中止取消で `active` に戻します(`orderCancelEntries`)。中止したオーダーを編集しても `revoked` のままです(`keepOrderRevoked`)。

| 状態 | `Task.status` | `executionPeriod` | 同じ transaction で書くもの |
|---|---|---|---|
| <span class="chip state-waiting">依頼済</span> | `requested`(または Task 無し) | なし | |
| <span class="chip state-active">受付済</span> | `accepted` | `start` | |
| <span class="chip state-active">出庫済</span> | `in-progress` | `start` | 出庫記録(ハブ + `MedicationDispense`) |
| <span class="chip state-done">実施済</span> | `completed` | `start` / `end` | 実施記録(ハブ + `MedicationAdministration` + `Observation`) |
| <span class="chip state-stop">中止</span> | `cancelled` | なし | ヘッダ `revoked`、残っている採血予定を `cancelled` |

取消で戻すときに消すもの: 出庫取消は出庫記録、実施取消は実施記録(`useUpdateTransfusionTaskStatus` の `cancelPerform`)。受付取消・中止取消は何も消しません。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`。輸血は電文にしません)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。
例外は採血ラベルと輸血カードの PDF で、backend が上流を直接読みます。

## 登録・編集・削除

`components/TransfusionOrderForm.tsx`・`TransfusionOrderPanels.tsx`、`buildTransfusionOrderBundle` / `buildTransfusionOrderUpdateBundle` / `buildTransfusionOrderDeleteBundle`(`fhir/transfusionOrderHelpers.ts`)、
`useCreatePrescription` / `useUpdatePrescription`(全種別共通)、`useDeleteTransfusionOrder`(`api/queries/transfusion.ts`)。警告は `fhir/transfusionAdvisoryHelpers.ts`。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 登録
    UI->>BE: GET /master/transfusion_products、GET /master/facility_settings
    BE-->>UI: 製剤マスタ・施設設定(不規則抗体の有効日数)
    UI->>BE: GET /fhir(血液型・不規則抗体の Observation、Flag、副作用の Observation、プロファイル、Location)
    BE->>FHIR: 検索
    FHIR-->>UI: 患者の型(2 検体一致)・注意区分・副作用歴・移植後の型・使用場所
    Dr->>UI: 製剤・単位数・型・検査区分・緊急度・投与予定日時・同意書を入力
    UI->>UI: 警告を判定(輸血拒否・型の未確定・不規則抗体・異型・副作用歴)
    opt 自己血を含む
      Dr->>UI: 採血予定を提案して直す
    end
    Dr->>UI: 登録
    UI->>UI: 入力検証(製剤の型・日時・同意書・採血予定)
    opt 確認を要する警告がある
      UI-->>Dr: 確認モーダル
      Dr->>UI: 理由を選んで登録
    end
    UI-)BE: POST /master/advisory_events(発火・確認の台帳)
    UI->>UI: Bundle を組む
    Note over UI: ヘッダ ServiceRequest(fullUrl)+ 明細 ServiceRequest × 製剤<br/>登録時の入院病棟を order-ward に<br/>自己血: Appointment × 採血予定<br/>Provenance(CREATE)、警告の確認: Provenance<br/>代行・研修医: Task order-approval
    UI->>BE: POST /fhir(transaction)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 編集
    UI->>BE: GET /fhir(ヘッダ + 明細 + Appointment)
    BE->>FHIR: 検索
    FHIR-->>UI: オーダー一式と採血予定
    Dr->>UI: 直して更新
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ヘッダ(ifMatch、revoked なら保つ)<br/>明細は差分で POST / PUT / DELETE<br/>採血予定: 外したものは cancelled、残りは PUT、足したものは POST<br/>Provenance(UPDATE)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 削除
    Dr->>UI: 削除
    UI->>BE: GET /fhir(ヘッダを指す明細・Task・Procedure・Appointment)
    BE->>FHIR: 検索
    FHIR-->>UI: 明細・Task・記録・採血予定
    alt 出庫・採血・実施の記録がある
      UI-->>Dr: 削除できない(取り消す)
    else 記録が無い
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: DELETE 明細 → ヘッダ<br/>DELETE Task<br/>残っている採血予定を cancelled
      BE->>BE: 削除の来歴を Bundle に足す
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  end
```

## 受付・出庫

`pages/TransfusionWorklistPage.tsx`、`components/TransfusionDispenseModal.tsx`、`fhir/transfusionDispenseHelpers.ts`(`dispenseAdvisories` / `buildTransfusionDispenseBundle`)、`fhir/isbt128.ts`、
`useUpdateTransfusionTaskStatus` / `useRegisterTransfusionDispense`。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 輸血部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  UI->>BE: GET /fhir(投与予定日 1 日ぶん)
  BE->>FHIR: 検索
  FHIR-->>UI: ServiceRequest・Task・Appointment・患者
  Tech->>UI: 受付
  UI->>BE: POST /fhir(transaction、Task transfusion = accepted)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  Tech->>UI: 出庫
  UI->>BE: GET /fhir(血液型・不規則抗体・プロファイル、自己血の採血記録)
  BE->>FHIR: 検索
  FHIR-->>UI: 患者の型・同定した抗体・移植後の型・本人の自己血
  UI->>BE: GET /master/transfusion_products
  BE-->>UI: 製剤マスタ(交差・照射の要否)
  UI-->>Tech: 依頼の製剤をバッグに展開
  loop バッグごと
    Tech->>UI: 製剤ラベルのバーコードを読む(= 献番号、=< 製品、=% 型、&> 期限)
    UI->>UI: ISBT 128 を振り分けて選択中のバッグに入れる
    Tech->>UI: 照射・交差適合試験の結果・抗原陰性の確認
  end
  UI->>UI: 警告を判定(①〜⑤・照射・交差・自己血の本人照合)
  Tech->>UI: 登録
  opt 確認を要する警告がある
    UI-->>Tech: 確認モーダル
    Tech->>UI: 理由を選んで登録
  end
  UI-)BE: POST /master/advisory_events
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: POST Procedure(出庫記録ハブ)<br/>POST MedicationDispense × バッグ<br/>Task transfusion = in-progress
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 実施・実施取消・副作用追記

`components/TransfusionPerformModal.tsx`・`TransfusionVerifyStep.tsx`・`TransfusionReactionModal.tsx`、`fhir/transfusionResultHelpers.ts`(`buildTransfusionPerformBundle` / `buildTransfusionPerformDeleteEntries` / `buildDelayedReactionObservation`)、
`useRegisterTransfusionPerform` / `useAddTransfusionReaction`。カルテのカード(`KarteTimeline.tsx`)からは出庫済のときだけ「実施入力」、実施済のときだけ「副作用追記」が出ます。

```mermaid
sequenceDiagram
  autonumber
  actor Ns as 看護師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 実施入力
    Ns->>UI: 実施入力(一覧の「実施」/ カードの「実施入力」)
    UI->>BE: GET /fhir(Procedure?based-on + MedicationDispense・MedicationAdministration・Observation)
    BE->>FHIR: 検索
    FHIR-->>UI: 出庫したバッグ(初期行)
    opt 投与時の照合が有効
      Ns->>UI: 患者番号と献血番号を読む(またはスキップ理由)
      UI->>UI: 患者の identifier と出庫したバッグに照合
    end
    Ns->>UI: 時刻・実施者・確認者・バッグの実施/未実施/返却・観察・副作用を入力して登録
    UI->>UI: 警告を判定(出庫記録との突き合わせ・期限・照射・交差・型)
    opt 確認を要する警告がある
      UI-->>Ns: 確認モーダル
      Ns->>UI: 理由を選んで登録
    end
    UI-)BE: POST /master/advisory_events
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: POST Procedure(実施記録ハブ、performedPeriod、照合の拡張)<br/>POST MedicationAdministration × バッグ(未実施・返却は not-done)<br/>POST Observation(副作用 immediate)<br/>POST Observation × 観察の時点(vital-signs)<br/>Task transfusion = completed
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 実施取消
    Ns->>UI: 一覧のメニュー「実施取消」
    UI->>BE: GET /fhir(Procedure?based-on + 子)
    BE->>FHIR: 検索
    FHIR-->>UI: 実施記録一式
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE Observation・MedicationAdministration → Procedure(実施記録)<br/>Task transfusion = in-progress
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 副作用追記
    Ns->>UI: カードの「副作用追記」(発症日時・症状・内容)
    UI->>BE: POST /fhir/Observation(副作用 delayed、partOf = 実施記録ハブ)
    BE->>FHIR: POST /Observation
    FHIR-->>UI: 結果
  end
```

## 自己血の採血

`components/AutologousCollectionModal.tsx`、`fhir/autologousHelpers.ts`(`buildAutologousCollectionBundle`)・`fhir/autologousPlanHelpers.ts`、`useRegisterAutologousCollection`、`useAutologousWorklist`、`AutologousLabelReport`(backend)。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 輸血部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Tech->>UI: 採血予定日を選ぶ
  UI->>BE: GET /fhir(Appointment?service-type=autologous&date)
  BE->>FHIR: 検索
  FHIR-->>UI: 採血予定
  UI->>BE: GET /fhir(ServiceRequest?_id + 明細・Task・採血記録)
  BE->>FHIR: 検索
  FHIR-->>UI: オーダー・累計の採血量
  Tech->>UI: 採血(予定を選ぶ、または予定なし)
  UI->>BE: GET /fhir(直近の Hb)、GET /master/facility_settings
  BE->>FHIR: 検索
  FHIR-->>UI: Hb(下限未満・未検査は警告)
  UI->>UI: 有効期限 = 採血日 + 製剤マスタの有効日数
  Tech->>UI: 採血日時・採血量・製剤番号を入れて登録
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: POST Procedure(採血記録ハブ、予定への参照)<br/>POST MedicationDispense(preparation、製剤番号・型・期限)<br/>予定を PUT Appointment = fulfilled
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  Tech->>UI: 採血ラベル
  UI->>BE: GET /reports/autologous_labels/:procedure_id/pdf(別タブ)
  BE->>FHIR: GET Procedure?_id(患者・採った血)
  FHIR-->>BE: 採血記録
  BE-->>UI: ラベル PDF
```

## 中止

`useUpdateTransfusionTaskStatus`(`api/queries/transfusion.ts`)。出庫記録・採血記録は残します。

```mermaid
sequenceDiagram
  autonumber
  actor Tech as 輸血部門
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Tech->>UI: 一覧のメニュー「中止」
  UI->>BE: GET /fhir(Appointment?based-on、status=booked)
  BE->>FHIR: 検索
  FHIR-->>UI: 残っている採血予定
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: Task transfusion = cancelled<br/>PUT ServiceRequest(ヘッダ)= revoked<br/>PUT Appointment = cancelled × 残りの予定
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 医事会計と SS-MIX2

輸血は実施記録から集めます(`BillingClaimBuilder` の `:procedure` 経路、`Resolvers::Transfusion`)。実施記録の無い当日のオーダーは「実施記録がありません(未実施のため送りません)」と報告します。

| 起きたこと | 医事会計(`BillingClaimBuilder`) | SS-MIX2 |
|---|---|---|
| 登録・編集・受付・出庫 | なし | なし(輸血の電文は持たない) |
| 実施 | 投与した(`completed`)バッグを製剤マスタの医薬品コードで 1 袋ずつ。手技は施設設定の保存血液輸血(1 回目 × 1、2 回目以降 × 単位数 − 1)。自己血だけなら手技なし、自己血の製剤は医薬品コードが無いので「送れない項目」 | なし |
| 未実施・返却のバッグ | 数えない | なし |
| 実施取消 | 対象から外れる | なし |
| 中止 | 対象から外れる(`ServiceRequest` が `revoked`) | なし |
| 削除 | 対象から外れる | なし |

製剤番号は上流の `MedicationAdministration?lot-number` で引けるので、ロット管理画面の検索で輸血の製剤番号も逆引きできます。
