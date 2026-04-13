"""
server.py — HTTP server and API entry point.

API endpoints:
    GET     /api/config                  server configuration (e.g. debug flag)
    GET     /api/jobs/stream             SSE stream of job events
    POST    /api/jobs/start              start or queue a job
    POST    /api/jobs/{job_id}/pause     pause a running job
    POST    /api/jobs/{job_id}/resume    resume a paused job
    POST    /api/jobs/{job_id}/abort     abort a running, paused, or queued job
    POST    /api/jobs/{job_id}/dismiss   remove a failed job from the registry
    DELETE  /api/debug/csv               delete the generated CSV (debug only)
    GET     /*                           static files served from PUBLIC_DIR
    GET     /data/*                      static files served from DATA_DIR
"""

import json
import mimetypes
import os
import queue
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from config import DATA_DIR, DEBUG, PORT
from job_core import JobManager
import job_types
from media_scan import CSV_FILE

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

JOB_MANAGER = JobManager()

job_types.register(JOB_MANAGER)


class Handler(BaseHTTPRequestHandler):
    def do_DELETE(self):
        print(f"[server] delete {self.path}", file=sys.stderr, flush=True)
        if self.path == "/api/debug/csv" and DEBUG:
            try:
                os.remove(CSV_FILE)
                self._json(200, {"ok": True})
            except FileNotFoundError:
                self._json(200, {"ok": True})
            except OSError as e:
                self._json(500, {"error": str(e)})
        else:
            self.send_error(404)

    def do_POST(self):
        print(f"[server] post {self.path}", file=sys.stderr, flush=True)
        if self.path.startswith("/api/jobs/"):
            self._jobs_post()
        else:
            self.send_error(404)

    def do_GET(self):
        print(f"[server] get {self.path}", file=sys.stderr, flush=True)
        if self.path == "/api/config":
            self._json(200, {"debug": DEBUG})
        elif self.path == "/api/jobs/stream":
            self._jobs_stream()
        else:
            self._serve_static()

    def _jobs_stream(self):
        listener_id, listener_queue = JOB_MANAGER.subscribe()
        print("[server] sse client connected", file=sys.stderr, flush=True)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            bootstrap = {"type": "bootstrap", "jobs": JOB_MANAGER.list_jobs()}
            self.wfile.write(f"data: {json.dumps(bootstrap)}\n\n".encode())
            self.wfile.flush()

            while True:
                try:
                    event = listener_queue.get(timeout=15)
                except queue.Empty:
                    event = {"type": "ping"}

                try:
                    self.wfile.write(f"data: {json.dumps(event)}\n\n".encode())
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, OSError):
                    break
        finally:
            print("[server] sse client disconnected", file=sys.stderr, flush=True)
            JOB_MANAGER.unsubscribe(listener_id)

    _JOB_ACTIONS = {
        "pause": JobManager.pause,
        "resume": JobManager.resume,
        "abort": JobManager.abort,
        "dismiss": JobManager.dismiss,
    }

    def _jobs_post(self):
        path = self.path.split("?", 1)[0]
        parts = path.strip("/").split("/")

        if len(parts) < 3 or parts[:2] != ["api", "jobs"]:
            self.send_error(404)
            return

        # POST /api/jobs/start — JSON body with job_type and optional args
        if len(parts) == 3 and parts[2] == "start":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length)) if length else {}
            except (ValueError, json.JSONDecodeError):
                self._json(400, {"error": "invalid JSON body"})
                return

            job_type = body.pop("job_type", None)
            if not job_type:
                self._json(400, {"error": "missing job_type"})
                return

            try:
                job, created = JOB_MANAGER.start(job_type, body)
                self._json(200, {"created": created, "job": job.snapshot()})
            except KeyError:
                self.send_error(404)
            except Exception as e:
                self._json(500, {"error": str(e)})
            return

        # POST /api/jobs/{job_id}/{action}
        if len(parts) != 4:
            self.send_error(404)
            return

        ref, action = parts[2], parts[3]
        method = self._JOB_ACTIONS.get(action)
        if not method:
            self.send_error(404)
            return

        result = method(JOB_MANAGER, ref)
        if result:
            body = {"ok": True} if isinstance(result, bool) else {"job": result}
            self._json(200, body)
        else:
            self.send_error(404)

    _STATIC_ROUTES = [
        ("/data/", DATA_DIR),
        ("/", PUBLIC_DIR),
    ]

    def _serve_static(self):
        url_path = self.path.split("?")[0]

        for prefix, root in self._STATIC_ROUTES:
            if url_path.startswith(prefix):
                rel = url_path[len(prefix):]
                break
        else:
            self.send_error(404)
            return

        # Resolve against the route root and verify the result stays inside it.
        root_real = os.path.realpath(root)
        file_path = os.path.realpath(os.path.join(root_real, rel))
        if file_path != root_real and not file_path.startswith(root_real + os.sep):
            print(
                f"[server] attempted directory traversal: {url_path}",
                file=sys.stderr,
                flush=True,
            )
            self.send_error(403)
            return

        # Directory → serve index.html (mirrors GitHub Pages / nginx behaviour).
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, "index.html")

        if not os.path.isfile(file_path):
            self.send_error(404)
            return

        mime, _ = mimetypes.guess_type(file_path)
        with open(file_path, "rb") as f:
            body = f.read()

        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # suppress the default per-request Apache-style access log
        pass


if __name__ == "__main__":
    print(f"[server] starting on port {PORT}", file=sys.stderr, flush=True)
    httpd = ThreadingHTTPServer(("", PORT), Handler)
    httpd.serve_forever()
