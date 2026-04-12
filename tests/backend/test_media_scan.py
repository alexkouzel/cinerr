"""Tests for media_scan.py — pure formatters and row extraction."""

import json

from media_scan import (
    _format_size,
    _format_duration,
    _map_hdr,
    _format_audio_track,
    _format_text_track,
    _extract_row,
)


# ---------------------------------------------------------------------------
# _format_size
# ---------------------------------------------------------------------------


class TestFormatSize:
    def test_normal(self):
        assert _format_size("1073741824") == "1.0 GiB"

    def test_fractional(self):
        assert _format_size("5368709120") == "5.0 GiB"

    def test_none(self):
        assert _format_size(None) == "-"

    def test_empty(self):
        assert _format_size("") == "-"

    def test_zero(self):
        assert _format_size("0") == "0.0 GiB"


# ---------------------------------------------------------------------------
# _format_duration
# ---------------------------------------------------------------------------


class TestFormatDuration:
    def test_normal(self):
        assert _format_duration("3661") == "01:01:01"

    def test_zero(self):
        assert _format_duration("0") == "00:00:00"

    def test_none(self):
        assert _format_duration(None) == "00:00:00"

    def test_float(self):
        assert _format_duration("3661.5") == "01:01:01"

    def test_large(self):
        assert _format_duration("86399") == "23:59:59"


# ---------------------------------------------------------------------------
# _map_hdr
# ---------------------------------------------------------------------------


class TestMapHdr:
    def test_dolby_vision(self):
        assert _map_hdr({"HDR_Format": "Dolby Vision, version 1.0"}) == "Dolby Vision"

    def test_hdr10_plus(self):
        assert _map_hdr({"HDR_Format": "HDR10+ Profile A"}) == "HDR10+"

    def test_hdr10(self):
        assert _map_hdr({"HDR_Format": "HDR10"}) == "HDR10"

    def test_hlg(self):
        assert _map_hdr({"transfer_characteristics": "HLG"}) == "HLG"

    def test_sdr(self):
        assert _map_hdr({}) == "-"

    def test_priority_dolby_over_hdr10(self):
        assert _map_hdr({"HDR_Format": "Dolby Vision / HDR10"}) == "Dolby Vision"


# ---------------------------------------------------------------------------
# _format_audio_track
# ---------------------------------------------------------------------------


class TestFormatAudioTrack:
    def test_full_track(self):
        track = {
            "Language": "english",
            "Format": "AC-3",
            "BitRate": "640000",
            "Channels": "6",
            "Default": "Yes",
        }
        result = _format_audio_track(track)
        assert result == "[en, AC-3, 640 kb/s, 6ch, default]"

    def test_missing_fields(self):
        result = _format_audio_track({})
        assert result == "[-, -, -, -]"

    def test_forced_flag(self):
        track = {"Forced": "Yes", "Language": "fr", "Format": "AAC"}
        result = _format_audio_track(track)
        assert "forced" in result

    def test_format_profile(self):
        track = {"Format": "DTS", "Format_Profile": "XLL"}
        result = _format_audio_track(track)
        assert "DTS XLL" in result


# ---------------------------------------------------------------------------
# _format_text_track
# ---------------------------------------------------------------------------


class TestFormatTextTrack:
    def test_srt(self):
        track = {"Language": "english", "Format": "UTF-8"}
        result = _format_text_track(track)
        assert result == "[en, SRT]"

    def test_ass(self):
        track = {"Language": "ja", "Format": "ASS"}
        result = _format_text_track(track)
        assert result == "[ja, ASS]"

    def test_missing_fields(self):
        result = _format_text_track({})
        assert result == "[-, -]"

    def test_default_forced(self):
        track = {"Language": "en", "Format": "SRT", "Default": "Yes", "Forced": "Yes"}
        result = _format_text_track(track)
        assert "default|forced" in result


# ---------------------------------------------------------------------------
# _extract_row
# ---------------------------------------------------------------------------


def _make_mediainfo_json(*, general=None, video=None, audio=None, text=None):
    tracks = []
    if general is not None:
        tracks.append({"@type": "General", **general})
    if video is not None:
        tracks.append({"@type": "Video", **video})
    for a in audio or []:
        tracks.append({"@type": "Audio", **a})
    for t in text or []:
        tracks.append({"@type": "Text", **t})
    return json.dumps({"media": {"track": tracks}})


class TestExtractRow:
    def test_basic_row(self):
        js = _make_mediainfo_json(
            general={"FileSize": "1073741824", "Duration": "3600"},
            video={
                "Format": "HEVC",
                "Format_Profile": "Main 10",
                "BitRate": "5000000",
                "FrameRate": "23.976",
                "Width": "3840",
                "Height": "2160",
            },
        )
        row = _extract_row(js, "movies/test.mkv")
        assert row[0] == "test.mkv"  # name
        assert row[1] == "/movies"  # path
        assert "GiB" in row[2]  # size
        assert row[4] == "HEVC"  # format
        assert row[5] == "Main 10"  # profile

    def test_path_root(self):
        js = _make_mediainfo_json(
            general={"FileSize": "100", "Duration": "10"}, video={"Format": "AVC"}
        )
        row = _extract_row(js, "test.mkv")
        assert row[1] == "/"

    def test_path_nested(self):
        js = _make_mediainfo_json(
            general={"FileSize": "100", "Duration": "10"}, video={"Format": "AVC"}
        )
        row = _extract_row(js, "movies/action/test.mkv")
        assert row[1] == "/movies/action"

    def test_no_tracks_returns_none(self):
        js = json.dumps({"media": {"track": []}})
        assert _extract_row(js, "test.mkv") is None

    def test_audio_and_subtitle_langs(self):
        js = _make_mediainfo_json(
            general={"FileSize": "100", "Duration": "10"},
            video={"Format": "AVC"},
            audio=[
                {"Language": "english", "Format": "AAC"},
                {"Language": "russian", "Format": "AC-3"},
            ],
            text=[
                {"Language": "english", "Format": "SRT"},
            ],
        )
        row = _extract_row(js, "test.mkv")
        assert "en" in row[12]  # audio_langs
        assert "ru" in row[12]
        assert "en" in row[13]  # subtitle_langs
