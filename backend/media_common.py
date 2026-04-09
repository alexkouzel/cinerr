"""media_common.py — shared media file discovery and path utilities."""

import os

MEDIA_DIR = os.getenv("MEDIA_DIR", "/media")
MEDIA_EXTENSIONS = (".mkv", ".avi", ".mp4")


def find_media_files() -> list[str]:
    media_files = []
    try:
        for root, dirs, files in os.walk(MEDIA_DIR):
            for file in files:
                if file.lower().endswith(MEDIA_EXTENSIONS):
                    abs_path = os.path.join(root, file)
                    media_files.append(os.path.relpath(abs_path, MEDIA_DIR))
    except (OSError, FileNotFoundError):
        pass
    return media_files


def abs_media_path(file_path: str) -> str:
    return os.path.join(MEDIA_DIR, file_path)
