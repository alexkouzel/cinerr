"""Tests for media_cache.py — caching and cache cleanup."""

import time

import media_cache
import media_common


class TestCacheKeyDeterministic:
    def test_same_input_same_key(self):
        assert media_cache.cache_key("a/b.mkv") == media_cache.cache_key("a/b.mkv")

    def test_different_input_different_key(self):
        assert media_cache.cache_key("a.mkv") != media_cache.cache_key("b.mkv")


class TestWriteAndReadCache:
    def test_round_trip(self, monkeypatch, tmp_path):
        cache_dir = tmp_path / "cache"
        media_dir = tmp_path / "media"
        media_dir.mkdir()
        (media_dir / "test.mkv").touch()

        monkeypatch.setattr(media_cache, "CACHE_DIR", str(cache_dir))
        monkeypatch.setattr(media_common, "MEDIA_DIR", str(media_dir))

        media_cache.write_cached_json("test.mkv", '{"data": 1}')
        result = media_cache.get_cached_json("test.mkv")
        assert result == '{"data": 1}'

    def test_returns_none_when_missing(self, monkeypatch, tmp_path):
        monkeypatch.setattr(media_cache, "CACHE_DIR", str(tmp_path / "cache"))
        monkeypatch.setattr(media_common, "MEDIA_DIR", str(tmp_path))
        assert media_cache.get_cached_json("nonexistent.mkv") is None

    def test_returns_none_when_source_newer(self, monkeypatch, tmp_path):
        cache_dir = tmp_path / "cache"
        media_dir = tmp_path / "media"
        media_dir.mkdir()
        media_file = media_dir / "test.mkv"
        media_file.touch()

        monkeypatch.setattr(media_cache, "CACHE_DIR", str(cache_dir))
        monkeypatch.setattr(media_common, "MEDIA_DIR", str(media_dir))

        media_cache.write_cached_json("test.mkv", '{"old": true}')

        # Touch the source file to make it newer than the cache
        time.sleep(0.05)
        media_file.write_bytes(b"updated")

        assert media_cache.get_cached_json("test.mkv") is None


class TestCleanCache:
    def test_removes_stale_entries(self, monkeypatch, tmp_path):
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()
        media_dir = tmp_path / "media"
        media_dir.mkdir()

        monkeypatch.setattr(media_cache, "CACHE_DIR", str(cache_dir))
        monkeypatch.setattr(media_common, "MEDIA_DIR", str(media_dir))

        # Write an orphan cache entry (no matching media file)
        orphan = cache_dir / "orphan_hash"
        orphan.write_text("stale")

        result = media_cache.clean_cache()
        assert result["removed"] == 1
        assert not orphan.exists()

    def test_keeps_valid_entries(self, monkeypatch, tmp_path):
        cache_dir = tmp_path / "cache"
        media_dir = tmp_path / "media"
        media_dir.mkdir()
        (media_dir / "keep.mkv").touch()

        monkeypatch.setattr(media_cache, "CACHE_DIR", str(cache_dir))
        monkeypatch.setattr(media_common, "MEDIA_DIR", str(media_dir))

        media_cache.write_cached_json("keep.mkv", '{"valid": true}')

        result = media_cache.clean_cache()
        assert result["removed"] == 0
        assert result["remaining"] == 1

    def test_no_cache_dir(self, monkeypatch, tmp_path):
        monkeypatch.setattr(media_cache, "CACHE_DIR", str(tmp_path / "nonexistent"))
        result = media_cache.clean_cache()
        assert result == {"removed": 0, "failed": 0, "remaining": 0}
