"""Supabase JWT 検証ユーティリティ（認可バイパス防止の土台 / CLAUDE.md §4）。

7-A-1 では「検証して user_id(sub) を取り出す関数」を用意するだけ。/health には適用しない。
解消などの保護書き込みエンドポイントで `get_current_user_id` を依存に挿す想定。

原則: リクエストボディの user_id は信用しない。必ず JWT の sub を使う。

注意（実装メモ）:
  - ここでは Supabase レガシーの HS256 共有 secret（SUPABASE_JWT_SECRET）での検証を実装する。
  - Supabase の新しい非対称署名鍵（ES256/RS256 + JWKS）を使うプロジェクトでは、
    JWKS から公開鍵を取得して検証する方式に差し替える必要がある（7-B 以降で対応可）。
"""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

# Supabase の JWT は aud="authenticated"、HS256（レガシー共有 secret）を想定。
_ALGORITHMS = ["HS256"]
_AUDIENCE = "authenticated"

bearer_scheme = HTTPBearer(auto_error=True)


class AuthError(Exception):
    """JWT 検証に失敗したことを表す内部例外。"""


def verify_jwt(token: str) -> str:
    """JWT を検証し user_id（sub クレーム）を返す。失敗時は AuthError を送出する。"""
    if not settings.supabase_jwt_secret:
        raise AuthError("SUPABASE_JWT_SECRET が未設定です")
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=_ALGORITHMS,
            audience=_AUDIENCE,
        )
    except jwt.PyJWTError as exc:
        raise AuthError(f"無効なトークン: {exc}") from exc

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
