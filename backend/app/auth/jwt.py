"""Supabase JWT 検証ユーティリティ（認可バイパス防止の土台 / CLAUDE.md §4）。

方式: **JWKS（非対称鍵 / ES256）で確定。**
  - Supabase の公開鍵エンドポイント `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` から
    公開鍵を取得し、トークンの `kid` に合う鍵で署名を検証する。
  - backend は**公開鍵で検証するだけ**。秘密鍵は持たない。
  - Legacy の HS256 共有 secret（SUPABASE_JWT_SECRET）は使わない（削除）。

原則: リクエストボディの user_id は信用しない。必ず JWT の sub を使う。
解消などの保護書き込みで `get_current_user_id` を依存に挿す。
"""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings

# Supabase の JWT は aud="authenticated"。署名は JWKS の ES256（EC P-256）。
_ALGORITHMS = ["ES256"]
_AUDIENCE = "authenticated"

bearer_scheme = HTTPBearer(auto_error=True)

_jwk_client: PyJWKClient | None = None


class AuthError(Exception):
    """JWT 検証に失敗したことを表す内部例外。"""


def _jwks_url() -> str:
    if not settings.supabase_url:
        raise AuthError("SUPABASE_URL が未設定です（JWKS エンドポイントを解決できない）")
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _get_jwk_client() -> PyJWKClient:
    """JWKS クライアント（公開鍵を取得・キャッシュする）。遅延生成。"""
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(_jwks_url())
    return _jwk_client


def verify_jwt(token: str) -> str:
    """JWT を JWKS(ES256) で検証し、user_id（sub クレーム）を返す。失敗時は AuthError。"""
    try:
        # トークンの kid に対応する公開鍵を JWKS から取得（kid 不一致なら例外）。
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=_ALGORITHMS,
            audience=_AUDIENCE,
        )
    except jwt.PyJWTError as exc:
        raise AuthError(f"無効なトークン: {exc}") from exc
    except Exception as exc:  # PyJWKClientError 等（鍵取得失敗・kid 不一致など）
        raise AuthError(f"鍵の取得/検証に失敗: {exc}") from exc

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise AuthError("トークンに sub クレームがありません")
    return sub


async def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> str:
    """FastAPI 依存。`Authorization: Bearer <JWT>` から検証済み user_id を取り出す。"""
    try:
        return verify_jwt(credentials.credentials)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
