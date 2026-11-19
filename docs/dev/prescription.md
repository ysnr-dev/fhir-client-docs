# 処方オーダーのシーケンス図

<!-- ../fhir-client/docs/order-flows/prescription.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

運用の流れは[処方オーダーの業務フロー](../flows/prescription.md)にあります。

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

中止は同じ transaction で `ServiceRequest` を `revoked`、`MedicationRequest` を `cancelled` にします(`rxOrderCancelEntries`)。中止取消は `active` に戻します。

## シーケンス図の前提

`/fhir` への書き込みはどれも 1 回の transaction Bundle で、backend の `FhirProxyController` が上流へ中継します。
SS-MIX2 を有効にしている施設では、中継が書き込みの控えを記録します(`Ssmix2::Recorder`)。
楽観ロックの版は `postBundle` が `ifMatch` に添え、版が違えば 412 で止まります。

## 登録

`components/PrescriptionForm.tsx`・`PrescriptionPanels.tsx`、`useCreatePrescription`(`api/queries/labResult.ts`)。

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
    UI->>BE: POST /integrations/cds/order_select(入力の 1 秒後)
    BE->>CDS: order-select
    CDS-->>BE: カード
    BE-->>UI: カード(失敗は空)
  end
  Dr->>UI: 登録
  UI->>UI: 入力検証・止める警告の確認
  opt order-sign のサービスがある
    UI->>BE: POST /integrations/cds/order_sign
    BE->>CDS: order-sign
    CDS-->>BE: カード
    BE-->>UI: カード(失敗は空)
  end
  opt 確認を要する警告かカードがある
    UI-->>Dr: 確認モーダル
    Dr->>UI: 理由を選んで登録
    UI-)BE: POST /integrations/cds/feedback(カードの無視)
  end
  UI-)BE: POST /master/advisory_events(発火・無視の台帳)
  UI->>UI: Bundle を組む
  Note over UI: ServiceRequest + MedicationRequest × 薬剤数<br/>Provenance(CREATE)<br/>院内: Task rx-verification(未監査)<br/>代行・研修医: Task order-approval<br/>警告の無視: Provenance<br/>特定抗菌薬: 届出の通知 Task<br/>持参薬の継続: MedicationStatement の更新
  UI->>BE: POST /fhir(transaction)
  BE->>FHIR: POST /
  FHIR-->>BE: transaction-response
  BE-->>UI: 結果
  UI->>UI: 一覧・カード・通知を読み直す
```

## 編集・削除

`PrescriptionEditPanel`、`useUpdatePrescription`、`postOrderDeleteBundle`(`api/queries/orderDelete.ts`)。

```mermaid
sequenceDiagram
  autonumber
  actor Dr as 医師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 編集
    Dr->>UI: カードの「編集」
    UI->>BE: GET /fhir(オーダーと focus の Task)
    BE->>FHIR: 検索
    FHIR-->>UI: ServiceRequest・MedicationRequest・Task
    Dr->>UI: 内容を変えて更新
    Note over UI,FHIR: 登録と同じ警告・order-sign の判定を通る
    UI->>BE: GET /fhir(既存の監査 Task)
    BE->>FHIR: 検索
    FHIR-->>UI: Task rx-verification
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: PUT ServiceRequest・MedicationRequest<br/>POST 追加した薬剤行 / DELETE 消した薬剤行<br/>Provenance(UPDATE)<br/>Task rx-verification を未監査へ<br/>処方変更待ちなら進捗を受付済へ
    BE->>FHIR: POST /
    FHIR-->>UI: 結果(版違いは 412)
  else 削除
    Dr->>UI: カードの「削除」と理由
    UI->>BE: GET /fhir(オーダーを指す記録)
    BE->>FHIR: 検索
    FHIR-->>UI: Task・MedicationDispense・実施記録
    alt 実施記録がある
      UI-->>Dr: 削除できない(実施を取り消す)
    else 実施記録が無い
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: DELETE ServiceRequest・MedicationRequest<br/>DELETE Task・MedicationDispense
      BE->>BE: 削除の来歴を Bundle に足す
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  end
```

## 処方監査

`pages/RxVerificationPage.tsx`・`components/RxVerificationModal.tsx`、`useCompleteRxVerification`。処方一覧の「監査」からも同じモーダルが開きます。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 処方監査の未監査タブ
  UI->>BE: GET /fhir(Task rx-verification, requested)
  BE->>FHIR: 検索
  FHIR-->>UI: 未監査の Task
  Ph->>UI: 監査を開く
  UI->>BE: GET /fhir(処方・患者の状態)
  BE->>FHIR: 検索
  FHIR-->>UI: 処方・照会の履歴・アレルギー・検査値
  UI-->>Ph: 内容と登録時と同じ警告
  Ph->>UI: 問題なし、または介入あり(種別・内容・処方医の対応)
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: PUT Task rx-verification<br/>status = completed、owner = 薬剤師<br/>output = 監査結果
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 処方箋発行

`pages/RxWorklistPage.tsx`・`components/RxBatchIssueModal.tsx`、`useUpdateRxTaskStatus`・`useIssuePrescriptions`。
PDF の生成は読むだけで、再発行は同じ PDF を刷り進捗を動かしません。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  alt 行の「処方箋発行」
    Ph->>UI: 処方箋発行
    par PDF を新しいタブで開く
      UI->>BE: GET /reports/prescriptions/:order_id/pdf
      BE->>FHIR: batch Bundle(オーダー一式と自院)
      FHIR-->>BE: 処方一式
      BE-->>UI: PDF
    and 進捗を受付済へ
      UI->>BE: POST /fhir(transaction、Task rx-dispense = accepted)
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    end
  else 処方箋一括発行(病棟)
    Ph->>UI: 病棟を選んで発行
    UI->>BE: GET /fhir(1 日ぶんを読み直す)
    BE->>FHIR: 検索
    FHIR-->>UI: 最新の一覧
    UI->>BE: POST /reports/prescriptions/pdf(order_ids)
    BE->>FHIR: batch Bundle
    FHIR-->>BE: 処方一式
    BE-->>UI: PDF
    UI->>BE: POST /fhir(transaction、依頼済の Task をまとめて accepted)
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 疑義照会

`components/RxInquiryModal.tsx`・`RxInquirySection.tsx`、`fhir/rxInquiryHelpers.ts`、`useWriteRxInquiry`。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤師
  actor Dr as 処方医
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 疑義照会(照会内容)
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: POST Task rx-inquiry(owner = 処方医)<br/>進捗 Task を on-hold(照会中)
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
  alt 処方医が回答
    Dr->>UI: 通知かカードから回答
    alt 処方どおり・薬剤部で変更してよい
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: Task rx-inquiry を completed(output に回答)<br/>POST Task rx-inquiry-answered(宛先 = 薬剤師)<br/>進捗 Task を accepted
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
    else 処方を変更する
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: Task rx-inquiry を completed(output に回答)<br/>POST Task rx-inquiry-answered<br/>進捗 Task は on-hold(処方変更待ち)
      BE->>FHIR: POST /
      FHIR-->>UI: 結果
      Dr->>UI: 右ペインでオーダーを編集して保存
      Note over UI,FHIR: 編集の transaction で進捗 Task を accepted、監査 Task を未監査へ
    end
    UI-->>Ph: 回答の通知(ベル)
  else 薬剤師が取下げ
    Ph->>UI: 取下げ
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: Task rx-inquiry を cancelled<br/>進捗 Task を accepted
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```

## 調剤登録

`components/RxDispenseModal.tsx`、`fhir/rxDispenseHelpers.ts`、`useRegisterRxDispense`。受付済の行にだけ出ます。

```mermaid
sequenceDiagram
  autonumber
  actor Ph as 薬剤師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ph->>UI: 調剤登録
  UI->>BE: GET /fhir(focus の Task)
  BE->>FHIR: 検索
  FHIR-->>UI: 照会の履歴・未確認の回答の通知
  UI->>BE: GET /master/...(投与量換算)
  BE-->>UI: 換算マスタ
  UI-->>Ph: 処方の内容を初期値に表示(力価は製剤数へ換算)
  Ph->>UI: 銘柄・数量を確かめて登録
  UI->>BE: POST /fhir(transaction)
  Note over UI,BE: POST MedicationDispense × 薬剤数<br/>進捗 Task を in-progress(調剤済)<br/>回答の通知を completed
  BE->>FHIR: POST /
  FHIR-->>UI: 結果
```

## 与薬

`components/OralPerformModal.tsx`・`VitalFlowsheetPanel.tsx`、`fhir/oralPerformHelpers.ts`、`useRegisterOralPerform`・`useCancelOralPerforms`。
調剤済かどうかに関わらず記録でき、進捗 Task は動きません。

```mermaid
sequenceDiagram
  autonumber
  actor Ns as 看護師
  participant UI as ブラウザ
  participant BE as backend
  participant FHIR as 上流 FHIR

  Ns->>UI: 経過表を開く
  UI->>BE: GET /fhir(入院の処方・与薬の記録)
  BE->>FHIR: 検索
  FHIR-->>UI: 処方・Procedure・進捗 Task
  UI->>UI: 用法コードと施設の時刻から予定枠を展開
  alt 与薬入力
    Ns->>UI: 予定枠の「与薬入力」
    alt 与薬
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: POST Procedure(completed、予定枠の拡張)<br/>POST MedicationAdministration × 飲ませた薬剤
    else 与薬せず
      UI->>BE: POST /fhir(transaction)
      Note over UI,BE: POST Procedure(not-done、理由)
    end
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  else 与薬取消
    Ns->>UI: 記録済みの枠の「与薬取消」
    UI->>BE: POST /fhir(transaction)
    Note over UI,BE: DELETE MedicationAdministration → Procedure
    BE->>FHIR: POST /
    FHIR-->>UI: 結果
  end
```
