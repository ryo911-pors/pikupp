"""アプリ設定。環境変数は backend/.env から読み込む（直書き禁止 / CLAUDE.md §12）。

SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL など秘匿値はここ経由でのみ扱い、
コードに直書きしない。.env はコミットしない（.gitignore 済み）。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase（backend 内部処理用。クライアントには出さない）
    supabase_url: str = ""  # JWKS エンドポイントの解決にも使う
    supabase_service_role_key: str = ""  # RLS 貫通の全権鍵。内部処理のみ
    database_url: str = ""
    # 注: JWT 検証は JWKS(ES256) 方式で確定。HS256 の SUPABASE_JWT_SECRET は廃止。

    # CORS 許可オリジン（フロント開発サーバ）
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
