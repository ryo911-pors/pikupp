"""7-B 現地証明の純関数テスト（check_evidence_present）。

距離チェック assert_resolver_near は PostGIS(ST_DWithin) を使うため本番DB専用で、
ここでは写真・GPS の必須検証ロジックのみを単体で確認する。
"""

import pytest

from app.services import resolve as svc


def test_evidence_ok_when_photo_and_coords_present() -> None:
    # 例外が出なければ OK
    svc.check_evidence_present("https://example.com/p.jpg", 34.7, 135.5)


def test_evidence_missing_photo() -> None:
    with pytest.raises(svc.EvidenceMissing):
        svc.check_evidence_present(None, 34.7, 135.5)
    with pytest.raises(svc.EvidenceMissing):
        svc.check_evidence_present("   ", 34.7, 135.5)


def test_evidence_missing_location() -> None:
    with pytest.raises(svc.EvidenceMissing):
        svc.check_evidence_present("https://example.com/p.jpg", None, 135.5)
    with pytest.raises(svc.EvidenceMissing):
        svc.check_evidence_present("https://example.com/p.jpg", 34.7, None)
