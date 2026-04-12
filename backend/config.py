"""config.py — environment-based configuration."""

import os

MEDIA_DIR = os.getenv("MEDIA_DIR", "/media")
DATA_DIR = os.getenv("DATA_DIR", "/data")
PORT = int(os.getenv("PORT", "8080"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
