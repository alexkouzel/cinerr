"""Tests for media_common.py — file discovery and path helpers."""

import os
import tempfile

import media_common


class TestFindMediaFiles:
    def test_finds_media_files(self, monkeypatch, tmp_path):
        (tmp_path / "movie.mkv").touch()
        (tmp_path / "show.mp4").touch()
        (tmp_path / "readme.txt").touch()
        sub = tmp_path / "subdir"
        sub.mkdir()
        (sub / "nested.avi").touch()

        monkeypatch.setattr(media_common, "MEDIA_DIR", str(tmp_path))
        result = media_common.find_media_files()

        names = sorted(result)
        assert names == sorted(["movie.mkv", "show.mp4", os.path.join("subdir", "nested.avi")])

    def test_ignores_non_media_extensions(self, monkeypatch, tmp_path):
        (tmp_path / "notes.txt").touch()
        (tmp_path / "image.png").touch()

        monkeypatch.setattr(media_common, "MEDIA_DIR", str(tmp_path))
        assert media_common.find_media_files() == []

    def test_case_insensitive_extension(self, monkeypatch, tmp_path):
        (tmp_path / "MOVIE.MKV").touch()

        monkeypatch.setattr(media_common, "MEDIA_DIR", str(tmp_path))
        result = media_common.find_media_files()
        assert len(result) == 1

    def test_missing_directory(self, monkeypatch):
        monkeypatch.setattr(media_common, "MEDIA_DIR", "/nonexistent_dir_abc123")
        assert media_common.find_media_files() == []

    def test_empty_directory(self, monkeypatch, tmp_path):
        monkeypatch.setattr(media_common, "MEDIA_DIR", str(tmp_path))
        assert media_common.find_media_files() == []


class TestAbsMediaPath:
    def test_joins_correctly(self, monkeypatch):
        monkeypatch.setattr(media_common, "MEDIA_DIR", "/media")
        assert media_common.abs_media_path("movies/test.mkv") == "/media/movies/test.mkv"
