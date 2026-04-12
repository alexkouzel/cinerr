"""
media_scan.py — media file scanning and CSV generation.

Reads mediainfo metadata for every file found by find_media_files(), caches
the raw JSON per file, and writes a summary CSV to DATA_DIR.

The CSV is written to a temporary file first, then atomically renamed to the
final path so readers never observe a partial result.

Concurrency:
    Files are processed in parallel using a ThreadPoolExecutor (one worker per CPU).
    Cached files are near-instant; uncached files block on MediaInfo.parse(),
    which shells out to the mediainfo binary.
"""

import concurrent.futures
import csv
import datetime
import json
import os
import sys

from pymediainfo import MediaInfo

from media_common import find_media_files, abs_media_path
from media_cache import DATA_DIR, clean_cache, get_cached_json, write_cached_json

CSV_FILE = os.path.join(DATA_DIR, "media.csv")
CSV_TMP_FILE = os.path.join(DATA_DIR, "media.csv.tmp")
LAST_SCAN_FILE = os.path.join(DATA_DIR, "last-scan")

CSV_HEADER = [
    "name",
    "path",
    "size",
    "duration",
    "format",
    "profile",
    "hdr",
    "bitrate",
    "framerate",
    "resolution",
    "audios",
    "subtitles",
    "audio_langs",
    "subtitle_langs",
]


_BYTES_PER_GIB = 1024**3


def _format_size(size_bytes):
    if not size_bytes:
        return "-"
    return f"{round(int(size_bytes) / _BYTES_PER_GIB, 2)} GiB"


def _format_duration(duration_s):
    if not duration_s:
        return "00:00:00"
    total_sec = int(float(duration_s))
    h = total_sec // 3600
    m = (total_sec % 3600) // 60
    s = total_sec % 60

    return f"{h:02d}:{m:02d}:{s:02d}"


def _map_hdr(video):
    """Normalise raw mediainfo HDR strings to a canonical label."""
    raw = video.get("HDR_Format") or video.get("transfer_characteristics") or "-"

    if "Dolby Vision" in raw:
        return "Dolby Vision"
    if "HDR10+" in raw:
        return "HDR10+"
    if "HDR10" in raw:
        return "HDR10"
    if "HLG" in raw:
        return "HLG"

    return "-"


def _track_lang(track):
    return (track.get("Language") or "-")[:2]


def _track_flags(track):
    flags = []
    if track.get("Default") == "Yes":
        flags.append("default")
    if track.get("Forced") == "Yes":
        flags.append("forced")
    return flags


def _format_track(parts, flags):
    if flags:
        parts.append("|".join(flags))
    return "[" + ", ".join(parts) + "]"


def _format_audio_track(track):
    """Format a mediainfo Audio track dict as a compact string, e.g. [en, AC3, 640 kb/s, 6ch]."""
    lang = _track_lang(track)

    fmt = track.get("Format") or "-"
    if track.get("Format_Profile"):
        fmt += " " + track["Format_Profile"]

    bitrate_val = track.get("BitRate")
    bitrate = f"{round(int(bitrate_val) / 1000)} kb/s" if bitrate_val else "-"

    channels_val = track.get("Channels")
    channels = f"{channels_val}ch" if channels_val else "-"

    return _format_track([lang, fmt, bitrate, channels], _track_flags(track))


def _format_text_track(track):
    """Format a mediainfo Text track dict as a compact string, e.g. [en, SRT]."""
    lang = _track_lang(track)
    fmt = "SRT" if track.get("Format") == "UTF-8" else (track.get("Format") or "-")

    return _format_track([lang, fmt], _track_flags(track))


def _extract_row(json_str, file_path):
    """Parse a mediainfo JSON string and return a CSV row."""
    data = json.loads(json_str)
    tracks = data.get("media", {}).get("track", [])

    general = next((t for t in tracks if t.get("@type") == "General"), {})
    video = next((t for t in tracks if t.get("@type") == "Video"), None)
    audio_tracks = [t for t in tracks if t.get("@type") == "Audio"]
    text_tracks = [t for t in tracks if t.get("@type") == "Text"]

    if not general and not video:
        print(
            f"[scan] warning: no track data for {file_path}",
            file=sys.stderr,
            flush=True,
        )
        return None

    name = os.path.basename(file_path)
    dir_path = os.path.dirname(file_path)
    path = "/" + dir_path if dir_path else "/"

    size = _format_size(general.get("FileSize"))
    duration = _format_duration(general.get("Duration"))

    if video:
        fmt = video.get("Format") or "-"
        profile = video.get("Format_Profile") or "-"
        hdr = _map_hdr(video)
        bit_rate = video.get("BitRate")
        bitrate = f"{round(int(bit_rate) / 1000)} kb/s" if bit_rate else "-"
        framerate = video.get("FrameRate") or "-"
        w, h = video.get("Width"), video.get("Height")
        resolution = f"{w}x{h}" if w and h else "-"
    else:
        fmt = profile = hdr = bitrate = framerate = resolution = "-"

    audios = "; ".join(_format_audio_track(t) for t in audio_tracks)
    subtitles = "; ".join(_format_text_track(t) for t in text_tracks)
    audio_langs = ",".join(sorted({_track_lang(t) for t in audio_tracks}))
    subtitle_langs = ",".join(sorted({_track_lang(t) for t in text_tracks}))

    return [
        name,
        path,
        size,
        duration,
        fmt,
        profile,
        hdr,
        bitrate,
        framerate,
        resolution,
        audios,
        subtitles,
        audio_langs,
        subtitle_langs,
    ]


def _process_file(file_path):
    """Return a CSV row for file_path, using the cache when possible."""
    json_str = get_cached_json(file_path)

    if json_str is not None:
        try:
            if not isinstance(json.loads(json_str), dict):
                json_str = None
        except Exception:
            json_str = None

    if json_str is None:
        print(
            f"[scan] processing: {os.path.basename(file_path)}",
            file=sys.stderr,
            flush=True,
        )
        try:
            json_str = MediaInfo.parse(abs_media_path(file_path), output="JSON")
        except Exception as e:
            print(
                f"[scan] error: failed to read {file_path}: {e}",
                file=sys.stderr,
                flush=True,
            )
            return None
        write_cached_json(file_path, json_str)

    try:
        return _extract_row(json_str, file_path)
    except Exception as e:
        print(
            f"[scan] error: failed to extract row for {file_path}: {e}",
            file=sys.stderr,
            flush=True,
        )
        return None


def run_scan(on_progress: callable, checkpoint: callable) -> dict:
    clean_cache()
    file_paths = find_media_files()
    total = len(file_paths)
    os.makedirs(os.path.dirname(CSV_TMP_FILE), exist_ok=True)

    with open(CSV_TMP_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)
        writer.writerow(CSV_HEADER)

        done = 0
        on_progress(0, total)

        def _process_file_with_checkpoint(file_path):
            checkpoint()
            return _process_file(file_path)

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=os.cpu_count()
        ) as executor:
            futures = {
                executor.submit(_process_file_with_checkpoint, file_path): file_path
                for file_path in file_paths
            }
            for future in concurrent.futures.as_completed(futures):
                checkpoint()
                row = future.result()
                if row is not None:
                    writer.writerow(row)
                done += 1
                on_progress(done, total)

    os.replace(CSV_TMP_FILE, CSV_FILE)

    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC"
    )
    with open(LAST_SCAN_FILE, "w", encoding="utf-8") as f:
        f.write(timestamp)

    return {"total": total}
