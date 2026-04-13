# Backend

Single Python process. `ThreadingHTTPServer` from the stdlib. No framework, no database, no external services. `pymediainfo` is the only runtime dependency, shelling out to the `mediainfo` system binary.

All state is kept in-process and does not survive a restart. Persistent data (the CSV and per-file caches) lives on disk under `DATA_DIR`.

Entry point is `server.py`: it owns the HTTP server, the job system, API routes, and static file serving.

## Jobs and SSE

Long-running work runs as a cooperatively-checkpointed job. Pause, resume, and abort all take effect at the next checkpoint rather than killing a thread. The real job is `scan-media`; a few debug jobs exist behind `DEBUG=true` to exercise the UI.

Job control is a POST API under `/api/jobs/*`. Live state is delivered over SSE (`/api/jobs/stream`). The first event is a `bootstrap` snapshot of the current job registry so the UI can pick up work already in flight on reconnect. Subsequent events are per-job snapshots emitted on every state change.

Conflicting jobs are queued rather than rejected and dispatched automatically when the blocking job finishes. Completed and aborted jobs are auto-removed from the registry; only failed jobs persist until dismissed.

## Scanning

The scan walks `MEDIA_DIR`, runs mediainfo for each file in a thread pool, and writes `media.csv` atomically (temp file, then rename) so readers never observe a partial result. Raw mediainfo JSON is cached per file under `DATA_DIR`, keyed by path, so rescans are near-instant for unchanged files.

The CSV schema is a contract between the backend writer and the frontend stats service. Changing columns or their meaning requires both sides to move together. The backend deliberately does not interpret the CSV on behalf of clients.
