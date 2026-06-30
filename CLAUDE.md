# Pikupp - CLAUDE.md

> このファイルの読者は人間ではなく、毎回記憶を失って出社してくる Claude（Claude Code）です。
> 「Pikupp とは何か」より先に「このリポジトリでどう振る舞い、どう自分の作業を検証するか」を読むこと。

> **このプロジェクトの優先順位（すべての判断の軸）：**
> **動くデモ > 設計の正しさ > 本番スケール**
> 一次目標は大学の最終発表デモ（締め切りあり）、二次目標は個人ポートフォリオ。本番運用はしない。
> 設計の美しさと締め切りが衝突したら、**締め切りを優先**してよい。本番スケール（高負荷・DDoS耐性等）の対策に時間をかけない。

---

## 0. 最初に守るルール（Claudeへの行動指示 / Behavioral Guardrails）

**やること（Always）**
- コードを変更したら、必ず `## 1. 作業完了の定義` のコマンドを実行し、**パスを確認してから「完了」と言う**こと。未実行で完了報告しない。
- Supabase の型は **手書きせず**、`supabase gen types typescript --linked > frontend/types/database.types.ts` で生成する。
- DBスキーマ変更は必ず `supabase/migrations/` に新しいマイグレーションファイルを追加する形で行う。
- 不明点・設計判断が必要な箇所は、勝手に決めずに**まず質問する**。特に認証・ポイント付与・課金に関わる部分。

**やらないこと（Never）**
- 本番DB（Supabase本番プロジェクト）を直接いじらない。変更は必ずマイグレーション経由。
- 新しい依存パッケージを**確認なしに追加しない**。
- `user_id` を**リクエストボディから受け取って信頼しない**（詳細は `## 4. 認証フロー`）。
- 派生データ（ポイント残高・ランキング）を**テーブルに永続化しない**。`point_logs` から導出する（詳細は `## 5.`）。
- 環境変数・シークレットをコードに直書きしない。`.env` 経由のみ。
- `.env` / `.env.local` を git に commit しない。

---

## 1. 作業完了の定義（Definition of Done / 検証ループ）

**変更後、該当する側を必ず実行し、すべてパスすることを確認してから完了報告する。**

### フロントエンド（frontend/）
```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit（package.json に未定義なら追加すること）
npm run test        # Vitest
npm run build       # 本番ビルドが通るか（型エラーの最終関門）
```

### バックエンド（backend/）
```bash
ruff check .        # Lint
ruff format --check .
mypy app            # 型チェック（型ヒント必須なので mypy は必ず通す）
pytest              # ユニットテスト
```

> テストが存在しない機能を新規実装する場合は、**最低1本のテストを同時に書く**こと。
> 「テストはあとで」は永遠に来ない。

---

## 2. プロジェクト概要

**Pikupp（ピカップ）**：ゴミ拾いをゲームに変える若年層向けWebアプリ（PWA）

### コアコンセプト
- **フローA（自由活動）**：ゴミ拾い開始→GPS自動記録→写真投稿→ポイント獲得
- **フローB（ホットスポット解消）**：発見者がマップにピンを立てる→回収者が拾いに行く→解消通知

---

## 3. 技術スタック

### フロントエンド
- **Next.js 16.2.9**（App Router）/ **TypeScript 5.9** / **Tailwind CSS 4.3** / **shadcn/ui**
- **React 19.2**
- **Leaflet.js + OpenStreetMap**（地図表示・無料）
- **PWA**（next-pwa）
- > Tailwind v4 は `tailwind.config.ts` が不要。`@import "tailwindcss"` + `@theme inline { }` ブロックで CSS ファイル内に完結する設定方式。`shadcn add` 時も `tailwind.config` フィールドは空文字で OK。

### バックエンド
- **Python 3.13** / **FastAPI**（非同期処理）/ **Pydantic**（型検証）/ **SQLAlchemy**（ORM）
  - > 実物が正・ドキュメント追従の方針（Next.js のバージョン同期と同じ）。3.12 指定だったがローカル/Dockerfile とも 3.13 で建てたため 3.13 に揃えた。
  - ⚠️ 教訓: **Supabase pooler(transaction mode / 6543)** では asyncpg の prepared statement を無効化する（`statement_cache_size=0` + `NullPool`）。でないと pgbouncer で `prepared statement does not exist` で落ちる。
  - ⚠️ 教訓: **`timestamptz` 列には `DateTime(timezone=True)`** を使う。naive な DateTime のままだと aware datetime 投入時に `can't subtract offset-naive and offset-aware` 型エラーになる。

### データ層
- **Supabase**（PostgreSQL + PostGIS + Auth + Storage）

### インフラ
- **Vercel**（フロント）/ **GCP Cloud Run**（バックエンド）/ **Docker**

---

## 4. アーキテクチャの境界と認証フロー（最重要 / 必ず守る）

このプロジェクトには「フロント→Supabase 直」と「フロント→FastAPI→Supabase」の2系統がある。
**どちらを使うかは以下のルールで判断し、ファイルごとに揺らがせないこと。**

### 責務分担（API Boundary）

| 操作 | 経路 | 理由 |
|---|---|---|
| 認証（ログイン/サインアップ） | **Supabase Auth 直** | Supabase の機能をそのまま使う |
| 写真アップロード | **Supabase Storage 直** | バックエンド経由は無駄 |
| 単純な read（自分の投稿一覧など） | **Supabase 直 + RLS** | RLS（Row Level Security / 行レベルセキュリティ）で保護 |
| 周辺ピン取得（PostGIS 近傍検索） | **Supabase RPC** | 公開データの read。`nearby_hotspots()` 関数を直接叩く。FastAPI 中継は過剰 |
| ランキング取得 | **Supabase RPC / 直** | 公開 read。実体化ビューを読むだけ |
| **ポイント計算・付与** | **FastAPI 経由のみ** | 信頼が要る書き込み＋不正対策ロジック＋テスト価値 |
| **ホットスポット解消の判定** | **FastAPI 経由のみ** | 自演防止（写真＋GPS現地証明）・冪等性の検証が必要（確定仕様は `## 10.5`） |

> **原則：「テスト可能な不正対策ロジックが要る書き込み」だけ FastAPI、それ以外は全部 Supabase。**
> FastAPI の仕事は意図的に最小化する（=ポイント付与とホットスポット解消判定の2つだけ）。
> 可動部を減らすことがデモ安定に直結する。迷ったら **Supabase 側に倒す**（前バージョンと逆なので注意）。

### 🪂 脱出ハッチ（デモ前に詰んだら）

デモ直前になっても FastAPI（Cloud Run）が安定しない場合、**迷わず FastAPI を捨てて Supabase-only に退避してよい**。
- ポイント付与ロジックを `SECURITY DEFINER` の Postgres 関数（plpgsql）に移し、フロントから RPC で叩く。
- 冪等性（Idempotency）は `point_logs` の UNIQUE 制約で DB レベル保証されるので、退避しても二重付与は防げる。
- これで Cloud Run を丸ごと捨てられ、デプロイ先が Vercel + Supabase だけになる＝可動部が激減する。
- 優先順位は「動くデモ > 設計の正しさ」。**締め切り前に詰んだら設計の美しさは躊躇なく捨てる。**

### 認証の伝播（JWT Verification）— 認可バイパス防止

1. クライアントは Supabase Auth から **JWT** を取得する。
2. FastAPI を呼ぶときは `Authorization: Bearer <JWT>` ヘッダーで送る。
3. **FastAPI は受け取った JWT を必ず検証し、そこから `user_id`（sub クレーム）を取り出す。**
4. **リクエストボディの `user_id` は絶対に信頼しない。** body に user_id があっても無視し、JWT 由来の user_id のみを使う。
5. `SUPABASE_SERVICE_ROLE_KEY` は **RLS を貫通する全権鍵**なので、バックエンド内部処理のみで使用し、ユーザー入力に応じて無防備に使わない。

> これを破ると、誰でも他人の user_id を詐称してポイントを荒稼ぎできる（認可バイパス / Authorization Bypass）。

> **この防御は経路に依存しない。** 脱出ハッチで Supabase RPC に退避した場合も同じ原則を守る：
> Postgres 関数内では、引数で渡された user_id ではなく **`auth.uid()`**（JWT 由来の認証済み user_id）を使う。
> FastAPI なら JWT の sub、Supabase RPC なら `auth.uid()`。**どちらの経路でもクライアント申告の user_id は無視する。**

---

## 5. データ整合性の方針（DDIA実践メモ）

### 派生データ（Derived Data）は持たない
- **ソースオブトゥルース（Source of Truth / 信頼できる唯一の情報源）= `point_logs`**
- ポイント残高・ランキングは `point_logs` から**導出する派生データ（Derived Data）**。テーブルに永続化しない。
- 整合性が壊れても `point_logs` から再構築できる状態を常に保つこと（イベントソーシング / Event Sourcing の考え方）。

### ランキングの計算戦略（Materialized View）
- 毎回 `point_logs` を全件 SUM するのはユーザー増加でスケールしない（スケーラビリティ / Scalability の問題）。
- **実体化ビュー（Materialized View / マテリアライズドビュー）** をランキング用に用意し、定期更新する方針とする。
  - MVP では「リアルタイム集計」で可。本番化時に実体化ビュー＋定期リフレッシュへ移行。
- 集計方式を変える際は、この方針コメントを更新すること。

### 冪等性（Idempotency）— ポイント二重付与の防止
- モバイルの電波は切れる前提。**リトライは「起きるかも」ではなく「起きる」。**
- `POST /sessions/{id}/end` のようなポイント付与は **一度きりのセマンティクス（Exactly-once Semantics）** を保証する。
- 実装方針：`point_logs` の `(ref_table, ref_id, type)` に **ユニーク制約（Unique Constraint）** を貼り、同一イベントの二重付与を DB レベルで弾く。
- もしくは冪等性キー（Idempotency Key）をクライアントから受け取り、重複リクエストを無視する。

---

## 6. ディレクトリ構成

```
pikupp/
├── frontend/               # Next.js アプリ
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── home/  map/  session/  post/  result/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/             # shadcn/ui
│   │   ├── map/  session/  hotspot/
│   ├── lib/
│   │   ├── supabase.ts     # Supabaseクライアント
│   │   ├── api.ts          # FastAPI呼び出し
│   │   └── utils.ts
│   ├── types/
│   │   ├── index.ts        # 型定義
│   │   └── database.types.ts   # ← supabase gen types で自動生成（手書き禁止）
│   └── public/manifest.json
│
├── backend/                # FastAPI アプリ
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/        # sessions / hotspots / rankings / map
│   │   ├── models/schemas.py
│   │   ├── db/database.py
│   │   ├── auth/           # ← JWT検証ユーティリティ（必須）
│   │   └── services/       # points / notifications
│   ├── tests/              # ← pytest
│   ├── Dockerfile
│   └── requirements.txt
│
├── supabase/migrations/    # SQLマイグレーション（スキーマ変更はここ経由のみ）
│
└── CLAUDE.md
```

---

## 7. データベース設計（主要テーブル）

```sql
users:       id, email, display_name, avatar_url, push_token, is_banned, created_at, deleted_at
sessions:    id, user_id(FK), started_at, ended_at, distance_m, duration_sec, avg_speed
posts:       id, user_id(FK), session_id(FK), hotspot_id(FK nullable), photo_url, comment, created_at
hotspots:    id, reporter_id(FK), location(PostGIS), photo_url, status, trash_type, reported_at, resolved_at
likes:       id, user_id(FK), post_id(FK), created_at
hotspot_resolutions: id, hotspot_id(FK), user_id(FK), session_id(FK), resolved_at

-- ポイント履歴（Source of Truth。派生データは持たない）
-- (ref_table, ref_id, type) に UNIQUE 制約を貼り、冪等性を保証する
point_logs:  id, user_id(FK), type, amount, ref_table, ref_id, created_at,
             UNIQUE(ref_table, ref_id, type)

notifications: id, user_id(FK), type, payload(JSONB), read_at, created_at
devices:       id, device_type, location(PostGIS), last_seen_at   -- 将来
```

---

## 8. APIエンドポイント

### FastAPI（信頼が要る書き込みのみ）
```
POST  /api/v1/sessions/start          # セッション開始
POST  /api/v1/sessions/{id}/end       # 終了・ポイント計算（冪等であること）
POST  /api/v1/hotspots/{hotspot_id}/resolve  # 解消判定（自演防止=写真＋GPS現地証明・冪等性を検証。実装済み 7-A-2。確定仕様は ## 10.5）
POST  /api/v1/reports                 # 外部デバイスからの統一報告（将来）
```

### Supabase 直 / RPC（公開 read・単純書き込み）
```
POST  hotspots（テーブル直 + RLS）     # ホットスポット報告（信頼不要な単純 insert）
RPC   nearby_hotspots(lat,lng,radius)  # 周辺ピン取得（PostGIS 近傍検索）
RPC   rankings()                       # ランキング取得（実体化ビューを読む）
```

> すべての**書き込み**は user_id を JWT 由来（FastAPI=sub / RPC=`auth.uid()`）で取得する。body の user_id は信用しない。
> 🪂 脱出ハッチ発動時は `sessions/{id}/end` を Postgres 関数 `end_session()` の RPC に置き換える（`## 4.` 参照）。

---

## 9. ポイント設計

| アクション | ポイント |
|---|---|
| ホットスポット報告（発見） | +30pt |
| ホットスポット解消（回収） | +100pt |
| 報告したピンが解消された（感謝ボーナス） | +20pt |
| セッション基本ポイント | 活動時間 × 距離 ベース |

---

## 10. 不正対策

- **自演防止**：解消には**写真必須＋GPS現地証明**（報告地点の近くにいること）を課す。詳細は `## 10.5 解消ルール`。
  - ⚠️ 旧仕様の「報告後6時間ルール」「本人は半額」は**いずれも撤廃**。現地証明がその代替。`## 10.5` が最終確定版。
- **速度補正**：GPS移動速度が時速6km超はポイント減算（車移動対策）。
  - 実装（フローA）：セッション `/end` で `avg_speed = distance/duration` を**サーバー側で再計算**して判定する（クライアント申告の速度は信用しない）。6km/h超は基本ポイントを半減。`app/services/session.py:compute_points`。
  - ⚠️ **既知の後回し（デモ優先でスコープ外）**：`distance_m`/`duration_sec` 自体はクライアント GPS 計測値をそのまま信頼している。改ざんすればポイント水増しが可能。本番化時は、`/start` で記録した `started_at` と `ended_at` の差でサーバー側 `duration` 上限を課す等で締める。
- **写真証拠**：セッション終了時の写真は量を判定しないが証拠として保全
- **二重付与防止**：`point_logs` のユニーク制約で冪等性を保証（`## 5.` 参照）

---

## 10.5 解消ルール（Hotspot Resolution）— 確定版

> ホットスポット解消（フローB）の**確定仕様**。ステップ7で実装する。
> ここが解消に関する Source of Truth。他セクション（`## 8` `## 9` `## 10`）の解消関連記述と食い違ったら**このセクションが正**。

### 誰が解消できるか
- **誰でも解消できる**（報告者本人も、他人も可）。
- ⚠️ **6時間ルールは撤廃**。報告直後でも解消してよい（「見つけてすぐ拾う」を許すため）。

### ポイント付与（`point_logs` への書き込み）
| ケース | 付与内容 | `point_logs` の行数 |
|---|---|---|
| **他人が解消** | 解消者に **+100pt**（満額）、報告者に感謝ボーナス **+20pt** | **2行** |
| **本人が解消** | 本人（=解消者=報告者）に **+100pt のみ**（満額） | **1行** |

- ⚠️ **半額ルールは撤廃**（前版の「本人は+50」は取り消し）。本人/他人を問わず**解消者は満額 +100**。
  - 理由：自演は**写真必須＋GPS現地証明**で防ぐ（下記）。減額は不要で、むしろ報告者が損する設計になり逆効果だった。
- 本人解消は感謝ボーナス（+20）を付けない（感謝ボーナスの二重取り＝自分が自分に感謝する構図を防ぐ）。
- 「本人かどうか」は `hotspots.reporter_id == 解消者の auth.uid()` で判定する。**解消者IDはクライアント申告を信用せず JWT 由来**（`## 4` 参照）。判定は感謝ボーナスを付けるか否かだけに使う（解消者の +100 には影響しない）。

### 冪等性（Idempotency）
- **1ホットスポット = 1解消**。`hotspot_resolutions` の `UNIQUE(hotspot_id)` で DB レベル担保。
- ポイントも二重付与しない：`point_logs` の `UNIQUE(ref_table, ref_id, type)` で担保（`## 5` 参照）。
- リトライ（電波切れ）で複数回叩かれても、結果は一度きり（Exactly-once）。

### 自演防止＝現地証明（写真・GPS）— 時間ルール／半額の代替
- **自演防止の本体はこれ**：解消には「**写真 必須 + GPS現地証明（報告地点の近くにいること）**」。
  撤廃した「6時間ルール」「半額」の**代替**がこの現地証明。物理的に現地へ行かないと解消できない＝自演のうまみが消える。
- **2段階で実装する**：
  - **7-A（済）**：ポイント計算ロジックを実装。写真・GPS は受け取るだけ（検証緩め）。
  - **7-B（済）**：**写真必須・GPS必須・報告地点との距離チェック（半径100m）を有効化済み**。
    - 実装：`routers/hotspots.py:verify_resolution_evidence` 依存（写真/GPS 必須チェック＋PostGIS `ST_DWithin` 距離判定）。距離判定は DB 側で行い、PostGIS の無いテストでは依存を no-op に差し替える。距離の閾値は `services/resolve.py:RESOLVE_RADIUS_M`。
    - フロント：`MapView` の解消は「写真を撮る→現在地取得→アップロード→解消API」。位置情報・写真が無いと解消不可。

### 経路（どこで実装するか）
- **FastAPI（service_role）経由のみ**。理由：信頼が要る書き込み＋不正対策ロジック（本人判定による感謝ボーナス要否・現地証明・冪等）があるため。
- エンドポイント：`POST /api/v1/hotspots/{hotspot_id}/resolve`（`## 8` 参照。7-A-2 で実装済み）。
- 🪂 脱出ハッチ発動時は `SECURITY DEFINER` + `auth.uid()` の Postgres 関数 RPC に退避してよい（`## 4` 脱出ハッチ参照）。冪等性は UNIQUE 制約で守られるので退避しても二重付与は防げる。
- ✅ **backend の JWT 検証方式は JWKS（非対称鍵 / ES256）で確定。** `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` の公開鍵で検証する（backend は秘密鍵を持たない）。Legacy の HS256 共有secret（SUPABASE_JWT_SECRET）は廃止。実装: `app/auth/jwt.py`。実トークンでライブ検証済み（7-A-2 後の確定）。

---

## 11. コーディング規約

### TypeScript（フロント）
- `interface` より `type` を優先
- Server / Client Component を明確に分ける（`'use client'` を適切に）
- Supabase の型は自動生成（`database.types.ts`）を使う・手書き禁止
- エラーハンドリングは必ず try-catch
- コメントは日本語でOK

### Python（バック）
- 型ヒント必須（mypy を通す）
- `async def` を基本とする
- Pydantic スキーマは routers / models に分離
- 環境変数は `.env` 管理・直書き禁止

### Git
- ブランチ：`feature/[機能名]`
- コミット：日本語OK、「[追加/修正/削除] 〇〇」形式

---

## 12. 環境変数（.env に記載、push しない）

### frontend/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### backend/.env
```
# --- 今必要な3つ（Phase 1） ---
SUPABASE_URL=                 # JWKS検証にも使う（/auth/v1/.well-known/jwks.json）
SUPABASE_SERVICE_ROLE_KEY=    # RLS貫通の全権鍵。内部処理のみ
DATABASE_URL=                 # ⚠ 直結(db.<ref>.supabase.co)はIPv4で解決不可。プーラー(aws-0-<region>.pooler.supabase.com)を使う

# --- 将来 ---
# FIREBASE_CREDENTIALS=       # Phase 2用（FCMプッシュ通知）。Phase 1では不要
```
> JWT 検証は **JWKS(ES256) で確定**（公開鍵で検証）。Legacy の `SUPABASE_JWT_SECRET`(HS256) は廃止＝`.env` に置かない。

---

## 13. 開発の優先順位

### Phase 1（デモ必須）
1. Next.js 初期化 + Vercel デプロイ
2. Supabase 作成 + テーブル + **マイグレーション + RLS設定**
3. ホーム/マップ画面（ダミーデータ）
4. セッション開始/終了（GPS記録、ポイント付与は冪等に）
5. ホットスポット報告・解消
6. ポイント計算・ランキング表示

### Phase 2
7. プッシュ通知（FCM）/ 8. いいね・コメント / 9. SNSシェア

### Phase 3（将来）
10. AI画像認識 / 11. IoT連携 / 12. 自治体・企業向けダッシュボード

---

## 14. よく使うコマンド

### フロント
```bash
cd frontend
npm run dev
supabase gen types typescript --linked > types/database.types.ts  # 型生成
```

### バック
```bash
cd backend
uvicorn app.main:app --reload
```

### Supabase
```bash
supabase start          # ローカル起動
supabase db diff -f xxx # マイグレーション生成
supabase db push        # マイグレーション適用
```
