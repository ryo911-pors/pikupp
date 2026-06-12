# Pikupp データベース設計の記録（DB_SCHEMA.md）

> このファイルは「何を作ったか（what）」ではなく **「なぜそうしたか（why）」** を記録するもの。
> 実際のテーブル定義（what）は `supabase/migrations/20260611000001_initial_schema.sql` が正。
> このファイルと migration がズレたら、**migration（実物）が正**。気づいたらこのファイルを直す。
>
> 読む順番：まず「## 0. 3つの設計原則」を読めば、個別の判断はすべてそこから導ける。

---

## 0. 3つの設計原則（すべての判断の根っこ）

このスキーマの全テーブル・全制約は、次の3原則から導かれている。迷ったらここに戻る。

1. **信頼は DB に集中させる（クライアントを信用しない）**
   権限チェックをアプリ任せにせず、Postgres の RLS（Row Level Security / 行レベルセキュリティ）に守らせる。
   クライアントが申告した `user_id` は信用せず、必ず `auth.uid()`（JWT由来）を使う。

2. **Source of Truth を1つに絞り、派生データを持たない**
   `point_logs` がポイントの唯一の真実。残高もランキングも、ここから**導出**する。
   残高を別テーブルに永続化しない（壊れたら point_logs から再構築できる状態を保つ）。

3. **持たないものは漏れない（最小化）**
   今使わないデータ・カラムは持たない。攻撃対象領域（Attack Surface）は、存在しないものについてはゼロ。
   （例：push_token を Phase 1 では持たない → 漏れようがない）

---

## 1. 全体構造

- 中心は `users`。Supabase の `auth.users` と **1:1** で対応する。
- ユーザーがサインアップすると、トリガー `on_auth_user_created` が自動で `public.users` に行を作る。
  → だからクライアントは `users` を直接 INSERT しない（できない）。
- 全テーブルが `user_id` 等で `users` を参照し、「誰のデータか」を辿れる。

### 書き込み経路は2系統（色分けの実体）

| 経路 | 対象テーブルの書き込み | 理由 |
|---|---|---|
| **FastAPI (service_role)** | sessions / point_logs / hotspot_resolutions / notifications / hotspots の UPDATE | 信頼が要る・不正対策ロジックが必要 |
| **クライアント直叩き + RLS** | hotspots の INSERT（報告）/ posts / likes | 単純な書き込み。RLS で `auth.uid()` を強制すれば安全 |

> `service_role` は RLS を貫通（BYPASSRLS）するため、FastAPI からはポリシー不問で書ける。
> 逆に言えば service_role 鍵は**絶対にクライアントに出さない**（出たら RLS が無意味になる）。

---

## 2. テーブルごとの「なぜ」

### users（プロフィール）
- `id` は `auth.users(id)` を参照。認証システムと DB を 1:1 で接続。
- **push_token は持たない。** → Phase 2（FCM実装時）に `user_push_tokens` テーブルとして分離する。
  - 理由：users は「全認証ユーザーが互いのプロフィールを読める」設計（ランキング・投稿者名表示のため）。
    ここに push_token を置くと全員のトークンが漏れ、スパム通知に悪用できる（security-reviewer が検出）。
  - 通知トークンは1ユーザーが複数デバイス持てるので、本来 users に1個ぶら下げる形が間違い。別テーブルが正。
- INSERT はトリガー（SECURITY DEFINER）専用。直接 INSERT はポリシーなし＝拒否。

### sessions（活動セッション）
- 書き込みは FastAPI 経由のみ。クライアントは自分の行を SELECT するだけ。
- 理由：セッション終了時にポイント計算・不正対策（速度補正など）が走るため、信頼が要る。

### hotspots（ホットスポット）
- `location` は PostGIS の `GEOGRAPHY(POINT, 4326)`。4326 = GPS標準座標系（WGS84）。
- GiST 空間インデックスを張ってある（近傍検索 `nearby_hotspots` RPC 用）。
- **報告（INSERT）はクライアント直叩き + RLS**（`auth.uid() = reporter_id` を WITH CHECK で強制）。
- **解消（UPDATE）は FastAPI 経由**。理由：自演防止（写真＋GPS現地証明）・冪等性の検証が必要。
  - ⚠️ 旧「6時間ルール」「本人は半額」はいずれも撤廃。解消の最終確定仕様は CLAUDE.md `## 10.5 解消ルール` を参照。
- SELECT は anon 含む全員に公開（地図表示のため）。
- 地図読取は `list_hotspots()` RPC（migration `20260612000002`）。SECURITY INVOKER（呼び出し元のRLSを尊重）で、geography(POINT,4326) から ST_Y/ST_X で lat/lng を取り出して返す。
- 報告は `report_hotspot()` RPC（migration `20260612000003`）。reporter_id をクライアントから受け取らず `auth.uid()` を使う。RLS の WITH CHECK と RPC の二重で reporter_id 詐称を防ぐ（多層防御）。

### posts（投稿）
- SELECT は全員公開（フィード）。INSERT は `auth.uid() = user_id` 強制。DELETE は自分の投稿のみ。

### likes（いいね）
- `UNIQUE(user_id, post_id)` で二重いいねを DB レベルで防止。

### hotspot_resolutions（解消記録）
- `UNIQUE(hotspot_id)` で「1ホットスポット = 1解消」を保証（冪等性）。
- 書き込みは FastAPI 経由のみ。
- 解消の最終確定仕様（誰が解消可・写真/GPS現地証明・感謝ボーナス・2段階実装）は CLAUDE.md `## 10.5 解消ルール`。
  ポイント付与は**解消者は本人/他人問わず満額 +100**。他人解消なら報告者に +20（感謝ボーナス）を加え `point_logs` 2行、本人解消は +100 のみで1行。
  ⚠️ 半額（本人+50）は撤廃。自演防止は写真＋GPS現地証明で行う。

### point_logs（★ Source of Truth）
- **このプロジェクトで最重要のテーブル。** ポイントの唯一の真実。
- `CONSTRAINT point_logs_idempotency_key UNIQUE (ref_table, ref_id, type)`
  → **冪等性（Idempotency）の要。** 同じイベントでの二重付与を DB レベルで弾く。
    モバイルの電波切れによるリトライは「起きる」前提。これで一度きりのセマンティクス（Exactly-once）を保証。
- `CHECK (amount <> 0)` → ゼロポイントの無意味な行の混入を防ぐ。
- **INSERT はサーバー（FastAPI / service_role）専用。** クライアント直叩きは完全拒否（ポイント不正の最終防衛線）。
- 残高・ランキングはこのテーブルを集計して導出する。**残高テーブルを作ってはいけない。**

### notifications（通知）
- SELECT/UPDATE（既読）は自分の行のみ。INSERT は FastAPI 経由。

### devices（将来用 IoT）
- Phase 3 構想。`user_id` なし。SELECT のみ認証済みに許可、書き込みは service_role 専用。

---

## 3. RLS の状態（確認済み）

- 自作テーブル（users 〜 notifications + devices）は **全て RLS 有効（rowsecurity = true）**。確認済み。
- `spatial_ref_sys` は RLS 無効だが **これは正常**。PostGIS の座標系辞書（公開前提・守る秘密なし）。
- ポリシーが存在しない操作は **デフォルト DENY**（拒否）。つまり「明示的に許可したものだけ通る」。

### ⚠️ GRANT 抜けで全テーブル 42501 になっていた件（migration `20260612000001` で修正）
- 初期マイグレーション（`20260611000001`）は **RLS ポリシーは定義したが、テーブルへの GRANT を付けていなかった**。
  そのため client 直叩き（anon / authenticated）が全テーブルで `permission denied for table`（SQLSTATE **42501**）になり、
  「Supabase 直 + RLS」経路（ランキング・投稿フィード・地図ピン読取など）が丸ごと機能していなかった。
- 修正：`20260612000001_grant_table_privileges.sql` で anon=SELECT、authenticated=CRUD、service_role=ALL を付与。
  併せて `ALTER DEFAULT PRIVILEGES` で以後の新テーブルにも自動適用。
- **1行教訓：RLS だけでは読めない。テーブルへの GRANT（anon / authenticated）も必須。**
  GRANT＝「テーブルに触れてよい」許可面、RLS＝実際の行ゲート。両方そろって初めて client 直叩きが通る
  （GRANT を広く付けてもポリシー無しの操作は RLS が DENY するので安全）。

### メール確認（Confirm email）ON とトリガーの挙動
- Supabase の **メール確認は ON**（デモUX判断でユーザーが選択）。サインアップ直後はセッション無し→確認リンクを開くまでログイン不可。
- **未確認ユーザーでも `on_auth_user_created` トリガーは発火する**。`AFTER INSERT ON auth.users` なので、
  メール確認の有無に関係なくサインアップ時点で `public.users` に行ができる（実測：行の `created_at` が `email_confirmed_at` より前）。
- **本番化メモ：未確認のまま放置された `auth.users`／`public.users` の行が溜まる**。本番運用するなら
  未確認ユーザーの定期掃除（一定期間 `email_confirmed_at IS NULL` の行を削除）が要る。デモでは放置で可。

---

## 4. 既知の TODO（このスキーマに紐づく未実装）

- `nearby_hotspots(lat, lng, radius)` RPC（PostGIS `ST_DWithin` 使用）→ ステップ後半で実装予定。GiST インデックスは作成済み。
- ランキングの実体化ビュー（Materialized View）→ MVP はリアルタイム集計で可。本番化時に移行。
- `user_push_tokens` テーブル → Phase 2（FCM）で追加。

---

## 5. 脱出ハッチ（デモ前に詰んだら）

優先順位は「動くデモ > 設計の正しさ > 本番スケール」。
FastAPI（Cloud Run）が安定しない場合、ポイント付与を Postgres 関数（`SECURITY DEFINER` + `auth.uid()`）に移し、
RPC で叩く Supabase-only 構成に退避してよい。冪等性は UNIQUE 制約で守られるため、退避しても二重付与は防げる。
詳細は CLAUDE.md の「脱出ハッチ」セクション参照。
