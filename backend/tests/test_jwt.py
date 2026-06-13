"""JWT 検証ユーティリティのテスト（JWKS / ES256 方式）。

ネットワークに出ず、テスト内で EC(P-256) 鍵ペアを生成し、JWKS クライアントを
モックして「公開鍵での検証」を再現する。
  - 正しい秘密鍵で署名 → sub を取り出せる
  - 別の秘密鍵で署名（署名不一致）→ AuthError
  - sub 無し → AuthError
"""

from typing import Any

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey

from app.auth import jwt as authjwt
from app.auth.jwt import AuthError, verify_jwt


def _new_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def _token(private_key: ec.EllipticCurvePrivateKey, **claims: Any) -> str:
    payload: dict[str, Any] = {"aud": "authenticated", **claims}
    # ES256 署名（PyJWT は cryptography の EC 鍵を受け付ける）
    return pyjwt.encode(payload, private_key, algorithm="ES256")


def _mock_jwks(monkeypatch: pytest.MonkeyPatch, public_key: EllipticCurvePublicKey) -> None:
    """JWKS クライアントを差し替え、kid に関係なく与えた公開鍵を返す。"""

    class _FakeSigningKey:
        def __init__(self, key: EllipticCurvePublicKey) -> None:
            self.key = key

    class _FakeClient:
        def get_signing_key_from_jwt(self, token: str) -> _FakeSigningKey:
            return _FakeSigningKey(public_key)

    monkeypatch.setattr(authjwt, "_get_jwk_client", lambda: _FakeClient())


def test_verify_jwt_returns_sub(monkeypatch: pytest.MonkeyPatch) -> None:
    priv = _new_key()
    _mock_jwks(monkeypatch, priv.public_key())
    token = _token(priv, sub="user-123")
    assert verify_jwt(token) == "user-123"


def test_verify_jwt_rejects_bad_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    signer = _new_key()
    other = _new_key()
    # 署名は signer、検証用に公開されるのは other の公開鍵 → 署名不一致
    _mock_jwks(monkeypatch, other.public_key())
    token = _token(signer, sub="user-123")
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_rejects_missing_sub(monkeypatch: pytest.MonkeyPatch) -> None:
    priv = _new_key()
    _mock_jwks(monkeypatch, priv.public_key())
    token = _token(priv)  # sub なし
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_rejects_wrong_audience(monkeypatch: pytest.MonkeyPatch) -> None:
    priv = _new_key()
    _mock_jwks(monkeypatch, priv.public_key())
    token = _token(priv, sub="user-123", aud="someone-else")
    with pytest.raises(AuthError):
        verify_jwt(token)
