"""media_cache.py — per-file JSON cache for mediainfo results."""

import hashlib
import os
import sys

from config import DATA_DIR
from media_common import find_media_files, abs_media_path

CACHE_DIR = os.path.join(DATA_DIR, "cache")


def cache_key(file_path: str) -> str:
    return hashlib.md5(file_path.encode("utf-8")).hexdigest()


def get_cached_json(file_path: str) -> str | None:
    key = cache_key(file_path)
    cache_file = os.path.join(CACHE_DIR, key)
    if not os.path.exists(cache_file):
        return None
    if os.path.getmtime(cache_file) < os.path.getmtime(abs_media_path(file_path)):
        return None  # source file was modified after the cache was written
    try:
        with open(cache_file) as f:
            return f.read()
    except OSError:
        return None


def write_cached_json(file_path: str, json_str: str) -> None:
    key = cache_key(file_path)
    cache_file = os.path.join(CACHE_DIR, key)
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(cache_file, "w") as f:
            f.write(json_str)
    except OSError:
        pass


def clean_cache() -> dict:
    if not os.path.isdir(CACHE_DIR):
        return {"removed": 0, "failed": 0, "remaining": 0}

    valid_keys = {}
    for file_path in find_media_files():
        valid_keys[cache_key(file_path)] = file_path

    removed = 0
    failed = 0
    for entry in os.listdir(CACHE_DIR):
        cache_file = os.path.join(CACHE_DIR, entry)
        media_file = valid_keys.get(entry)
        if media_file is None:
            stale = True
        else:
            stale = os.path.getmtime(cache_file) < os.path.getmtime(
                abs_media_path(media_file)
            )
        if stale:
            try:
                os.remove(cache_file)
                removed += 1
            except OSError as e:
                print(
                    f"[media] warning: failed to remove cache entry {entry}: {e}",
                    file=sys.stderr,
                    flush=True,
                )
                failed += 1

    remaining = len(os.listdir(CACHE_DIR))
    print(
        f"[media] cache clean: {removed} removed, {failed} failed, {remaining} remaining",
        file=sys.stderr,
        flush=True,
    )
    return {"removed": removed, "failed": failed, "remaining": remaining}
