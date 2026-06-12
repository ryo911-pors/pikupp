"""アプリ設定。環境変数は backend/.env から読み込む（直書き禁止 / CLAUDE.md §12）。

SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET など秘匿値はここ経由でのみ扱い、
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
    supabase_url: str = ""
    supabase_service_role_key: str = ""  # RLS 貫通の全権鍵。内部処理のみ
    supabase_jwt_secret: str = ""  # JWT 検証用（HS256 共有 secret）
    database_url: str = ""

    # CORS 許可オリジン（フロント開発サーバ）
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
