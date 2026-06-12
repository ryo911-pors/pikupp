"""JWT 検証ユーティリティのテスト。

本物の Supabase secret は使わず、テスト用 secret で HS256 トークンを自作して検証する。
"""

import jwt as pyjwt
import pytest

from app import config
from app.auth.jwt import AuthError, verify_jwt

# 32バイト以上にして HMAC キー長警告を避ける（テスト専用 secret）
_SECRET = "test-secret-do-not-use-in-prod-0123456789"


def _token(secret: str, **claims: object) -> str:
    payload: dict[str, object] = {"aud": "authenticated", **claims}
    return pyjwt.encode(payload, secret, algorithm="HS256")


def test_verify_jwt_returns_sub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.settings, "supabase_jwt_secret", _SECRET)
    token = _token(_SECRET, sub="user-123")
    assert verify_jwt(token) == "user-123"


def test_verify_jwt_rejects_bad_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.settings, "supabase_jwt_secret", _SECRET)
    token = _token("a-different-wrong-secret-0123456789ABCDEF", sub="user-123")
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_rejects_missing_sub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.settings, "supabase_jwt_secret", _SECRET)
    token = _token(_SECRET)  # sub なし
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_requires_configured_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.settings, "supabase_jwt_secret", "")
    token = _token(_SECRET, sub="user-123")
    with pytest.raises(AuthError):
        verify_jwt(token)
