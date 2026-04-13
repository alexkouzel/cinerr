# Cinerr

Self-hosted media file manager. Users mount a media library read-only, run a scan, and get a dashboard showing what's in the library, what's bloated, and what could be transcoded to reclaim disk space.

## How a scan works

1. Backend walks `MEDIA_DIR` and runs `mediainfo` on every file.
2. Raw JSON per file is cached under `DATA_DIR`. Cached files are skipped on rescan.
3. An aggregated `media.csv` and a `last-scan` timestamp are written atomically to `DATA_DIR`.
4. The frontend fetches `media.csv`.

The CSV is the only data interchange between backend and frontend for media content. The backend never interprets or filters rows on behalf of the client.

## Architecture

Single Python process. Threaded HTTP server. No framework, no database, no external services.

- **Backend**: Python 3.12 stdlib plus `pymediainfo`. See [backend.md](backend.md).
- **Frontend**: vanilla ES modules, no build step. See [frontend.md](frontend.md).

## Configuration

Env vars only: `MEDIA_DIR`, `DATA_DIR`, `PORT`, `DEBUG`. See the Configuration section in [README.md](../README.md).

## Dependencies

- Runtime: Python 3.12, `pymediainfo==7.0.1`, the `mediainfo` system binary.
- Frontend: none. No bundler, no transpiler.
- Dev: `pytest` for backend tests, Node 20+ for frontend tests (built-in runner).

## Related context

- [backend.md](backend.md): Python server, jobs, API surface.
- [frontend.md](frontend.md): page structure and component/service layering.
- [testing.md](testing.md): test suites and philosophy.
- [conventions.md](conventions.md): code style and dependency rules.
