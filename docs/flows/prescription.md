# 処方オーダーの業務フロー

<!-- ../fhir-client/docs/order-flows/prescription.md から scripts/sync-flows.mjs で作る。直接編集しない。 -->

処方オーダーの登録から調剤・与薬までの流れです。

<p class="roles" aria-label="登場する部署"><span class="chip role-doctor">医師</span> <span class="chip role-pharmacy">薬剤部</span> <span class="chip role-nurse">病棟</span></p>

## 区分ごとの違い

| 処方 | 処方監査 | 処方箋 | 調剤登録 | 与薬の記録 | 医事会計への送信 |
|---|---|---|---|---|---|
| 入院(定期・継続・臨時・退院・緊急) | あり | 院内様式 | あり | 内服の RP を経過表で | なし(外来のみ) |
| 外来・院内 | あり | 院内様式 | あり | なし | あり |
| 外来・院外 | なし(保険薬局が監査) | 様式第2号 | 保険薬局が調剤 | なし | あり |
| 持参(持参薬の継続) | なし(持参薬鑑別で確認) | 刷らない | なし | 経過表で | なし |

## 処方の状態

薬剤部の進み具合を示す状態です。与薬の記録では変わりません。

| 状態 | 変わるきっかけ | 処方一覧のメニューからできること |
|---|---|---|
| <span class="chip state-waiting">依頼済</span> | 医師の登録 | 中止 |
| <span class="chip state-active">受付済</span> | 処方箋発行、疑義照会の回答・取下げ | 取消(依頼済へ)、中止 |
| <span class="chip state-hold">照会中・処方変更待ち</span> | 疑義照会 | なし(疑義照会の操作で変わる) |
| <span class="chip state-done">調剤済</span> | 調剤登録 | 取消(受付済へ。調剤の記録は残る) |
| <span class="chip state-stop">中止</span> | 中止 | 中止取消(依頼済へ) |

中止した処方は医事会計への送信から外れます。会計を送ったあとに中止したときは医事へ連絡し、医事が送り直します。

## 全体の流れ

```mermaid
flowchart TD
  start(("開始"))
  finish((("終了")))
  kind{"処方区分"}
  setting{"入院の処方?"}

  subgraph doctor["医師"]
    input["処方を入力<br/>新規・DO・持参薬の継続"]
    register["登録<br/>(登録の判定)"]
  end

  subgraph pharmacy["薬剤部"]
    verify["処方監査<br/>問題なし・介入あり"]
    issue["処方箋発行<br/>発行が受付を兼ねる"]
    external{"院外処方?"}
    inquire{"疑義あり?"}
    inquiry["疑義照会<br/>(疑義照会の流れ)"]
    wait{"未監査かつ<br/>監査待ちの施設設定?"}
    dispense["調剤して結果を登録"]
  end

  handOut["患者へ交付"]
  pharmacyOut["患者が保険薬局で受け取る"]

  subgraph ward["病棟"]
    planned["経過表に与薬の予定が出る"]
    admin{"与薬する?"}
    give["与薬を記録"]
    skip["与薬せずと理由を記録"]
    more{"残りの予定枠?"}
  end

  start --> input --> register --> kind
  kind -- "院内(入院・外来)" --> verify
  kind -- "院内(入院・外来)" --> issue
  kind -- "院外" --> issue
  kind -- "持参" --> planned
  issue --> external
  external -- "はい" --> pharmacyOut --> finish
  external -- "いいえ" --> inquire
  inquire -- "はい" --> inquiry --> inquire
  inquire -- "いいえ" --> wait
  verify -. "監査済" .-> wait
  wait -- "はい" --> verify
  wait -- "いいえ" --> dispense --> setting
  setting -- "いいえ" --> handOut --> finish
  setting -- "はい" --> planned --> admin
  admin -- "はい" --> give --> more
  admin -- "いいえ" --> skip --> more
  more -- "あり" --> admin
  more -- "なし" --> finish
```

- 監査と処方箋発行は並行して進みます。既定では未監査でも調剤登録でき、施設設定「監査済まで調剤登録・払出登録を出さない」のときだけ待ちます。
- 疑義照会は依頼済からも送れます(図は受付済からの経路だけを示します)。
- 与薬の予定が出るのは入院の内服だけです。頓用と時刻指定の用法は予定が出ません。
- 「患者へ交付」「患者が保険薬局で受け取る」はシステムの外の作業です。薬剤部から病棟へ薬を届ける作業は記録の対象ではなく、調剤済かどうかに関わらず与薬を記録できます。

## 登録の判定

```mermaid
flowchart TD
  submit(("登録を押す"))
  valid{"入力は正しい?"}
  validError["入力エラーを表示"]
  blocked{"止める警告がある?"}
  blockedError["登録できない<br/>警告を表示"]
  cds{"外部の判断支援を<br/>使っている?"}
  sign["判断支援に問い合わせる<br/>届かなくても続ける"]
  confirm{"確認を要する警告か<br/>判断支援の指摘がある?"}
  modal["確認モーダルで<br/>警告ごとに理由を選ぶ"]
  choice{"確認モーダルの操作"}
  ledger["警告と確認理由を記録"]
  send["処方を保存"]
  result{"成功?"}
  failed["エラーを表示<br/>何も保存されない"]
  done((("登録完了")))
  fix["入力を直す"]

  submit --> valid
  valid -- "いいえ" --> validError --> fix
  valid -- "はい" --> blocked
  blocked -- "はい" --> blockedError --> fix
  blocked -- "いいえ" --> cds
  cds -- "はい" --> sign --> confirm
  cds -- "いいえ" --> confirm
  confirm -- "はい" --> modal --> choice
  choice -- "戻る" --> fix
  choice -- "登録" --> ledger
  confirm -- "いいえ" --> ledger
  ledger --> send --> result
  result -- "はい" --> done
  result -- "いいえ" --> failed --> fix
  fix --> submit
```

## 疑義照会の流れ

```mermaid
flowchart TD
  ask["薬剤師が照会を送る<br/>進捗は照会中"]
  stop["調剤登録が止まる"]
  who{"次に起きること"}
  withdraw["薬剤師が取り下げる<br/>進捗を受付済へ"]
  answer{"処方医の回答"}
  released["回答を記録して薬剤師へ通知<br/>進捗を受付済へ"]
  held["回答を記録して薬剤師へ通知<br/>進捗は処方変更待ち"]
  edit["処方医がオーダーを編集して保存<br/>進捗を受付済へ、監査済は未監査へ"]
  next(("調剤へ"))

  ask --> stop --> who
  who -- "取下げ" --> withdraw --> next
  who -- "回答" --> answer
  answer -- "処方どおり" --> released
  answer -- "薬剤部で変更してよい" --> released
  answer -- "処方を変更する" --> held --> edit --> next
  released --> next
```
