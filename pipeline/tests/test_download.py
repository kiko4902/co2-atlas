import hashlib

import pytest

from co2_pipeline import download
from co2_pipeline.download import ChecksumError, fetch


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def test_fetch_downloads_and_verifies(tmp_path, monkeypatch):
    monkeypatch.setattr(download, "_http_get", lambda url: b"hello")
    dest = fetch("https://example.invalid/a", tmp_path / "a.csv", "md5", md5(b"hello"))
    assert dest.read_bytes() == b"hello"


def test_fetch_uses_cache_when_checksum_matches(tmp_path, monkeypatch):
    dest = tmp_path / "a.csv"
    dest.write_bytes(b"cached")

    def fail(url):
        raise AssertionError("should not download")

    monkeypatch.setattr(download, "_http_get", fail)
    assert fetch("https://example.invalid/a", dest, "md5", md5(b"cached")) == dest


def test_fetch_rejects_wrong_checksum(tmp_path, monkeypatch):
    monkeypatch.setattr(download, "_http_get", lambda url: b"tampered")
    with pytest.raises(ChecksumError):
        fetch("https://example.invalid/a", tmp_path / "a.csv", "md5", md5(b"original"))
    assert not (tmp_path / "a.csv").exists()
