#!/bin/bash
cd "$(dirname "$0")"
source env.bash
exec venv/bin/python backend/server.py
