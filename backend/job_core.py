"""
job_core.py — background job infrastructure.

Lifecycle:
    idle    → running / queued
    queued  → running / aborted
    running → paused / completed / failed / aborted
    paused  → running / aborted
"""

import collections
import queue
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Callable


# Raised by Job.checkpoint().
class AbortRequested(Exception):
    pass


@dataclass
class _JobTypeSpec:
    builder: Callable
    conflicts_with: frozenset
    allow_multiple: bool


class Job:
    def __init__(
        self,
        job_type: str,
        runner: Callable,
        *,
        total: int = 0,
        on_event=None,
        on_terminal=None,
    ):
        self.job_id = uuid.uuid4().hex
        self.job_type = job_type
        self._runner = runner
        self._thread = None
        self._on_event = on_event
        self._on_terminal = on_terminal
        self._result = None
        self._error = None
        self._done = 0
        self._total = int(total)
        self._status = "idle"
        self._abort_requested = False

        now = time.time()
        self._created_at = now
        self._updated_at = now
        self._started_at = None
        self._finished_at = None

        # _revision is incremented on every state change.
        self._revision = 0

        # Protects all mutable fields (_status, _done, etc.).
        self._lock = threading.RLock()

        # Waits for status transitions (used for pause/resume).
        self._cond_transition = threading.Condition(self._lock)

    def _mark_updated(self):
        self._updated_at = time.time()
        self._revision += 1

    def _notify_snapshot(self):
        if self._on_event:
            self._on_event({"type": "snapshot", "job": self.snapshot()})

    def _transition(self, *, status_from, status_to, on_success=None):
        with self._cond_transition:
            if self._status not in status_from:
                print(
                    f"[job] {self.job_type}: {self._status} -> {status_to} NOT allowed",
                    file=sys.stderr,
                    flush=True,
                )
                return False

            previous = self._status
            self._status = status_to
            self._mark_updated()

            if on_success:
                on_success()

            self._cond_transition.notify_all()

        print(f"[job] {self.job_type}: {previous} -> {status_to}", file=sys.stderr, flush=True)
        self._notify_snapshot()
        return True

    def queue(self):
        return self._transition(
            status_from=["idle"],
            status_to="queued",
        )

    def start(self):
        def _on_success():
            self._started_at = time.time()
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

        return self._transition(
            status_from=["idle", "queued"],
            status_to="running",
            on_success=_on_success,
        )

    def pause(self):
        return self._transition(
            status_from=["running"],
            status_to="paused",
        )

    def resume(self):
        return self._transition(
            status_from=["paused"],
            status_to="running",
        )

    def abort(self):
        def _on_success():
            self._finished_at = self._updated_at

            if self._started_at is None:
                self._on_terminal(self)
            else:
                self._abort_requested = True

        return self._transition(
            status_from=["queued", "running", "paused"],
            status_to="aborted",
            on_success=_on_success,
        )

    def checkpoint(self):
        with self._cond_transition:
            while self._status == "paused" and not self._abort_requested:
                self._cond_transition.wait(timeout=0.05)

        if self._abort_requested:
            raise AbortRequested()

    def set_progress(self, done: int):
        with self._lock:
            if self._status != "running":
                return
            self._done = int(done)
            self._mark_updated()

        self._notify_snapshot()

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "job_id": self.job_id,
                "job_type": self.job_type,
                "status": self._status,
                "done": self._done,
                "total": self._total,
                "result": self._result,
                "error": self._error,
                "revision": self._revision,
                "created_at": self._created_at,
                "updated_at": self._updated_at,
                "started_at": self._started_at,
                "finished_at": self._finished_at,
            }

    def _run(self):
        print(f"[job] {self.job_type} running", file=sys.stderr, flush=True)
        terminal_status = None
        try:
            result = self._runner(self)
            with self._lock:
                # abort() may have been called while the runner was finishing up
                if self._abort_requested or self._status == "aborted":
                    terminal_status = "aborted"
                else:
                    terminal_status = "completed"
                    self._result = result if isinstance(result, dict) else None

            print(f"[job] {self.job_type} completed: {result}", file=sys.stderr, flush=True)

        except AbortRequested:
            terminal_status = "aborted"

        except Exception as exc:
            with self._lock:
                terminal_status = "failed"
                self._error = str(exc)

            print(f"[job] {self.job_type} failed: {exc}", file=sys.stderr, flush=True)

        finally:
            with self._lock:
                self._status = terminal_status or "failed"
                self._mark_updated()
                self._finished_at = self._updated_at

            self._notify_snapshot()
            if self._on_terminal:
                self._on_terminal(self)


class JobManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._specs: dict[str, _JobTypeSpec] = {}
        self._jobs: dict[str, Job] = {}
        self._latest_by_type: dict[str, str] = {}
        self._active_types: dict[str, int] = {}
        self._queue = collections.deque()
        self._subscribers: dict[str, queue.Queue] = {}

    def register(
        self,
        job_type: str,
        builder: Callable,
        *,
        conflicts_with=(),
        allow_multiple=False,
    ):
        with self._lock:
            self._specs[job_type] = _JobTypeSpec(
                builder=builder,
                conflicts_with=frozenset(conflicts_with),
                allow_multiple=allow_multiple,
            )

    def subscribe(self):
        subscriber_id = uuid.uuid4().hex
        q = queue.Queue()

        with self._lock:
            self._subscribers[subscriber_id] = q

        return subscriber_id, q

    def unsubscribe(self, subscriber_id: str):
        with self._lock:
            self._subscribers.pop(subscriber_id, None)

    def _broadcast(self, payload: dict):
        with self._lock:
            queues = list(self._subscribers.values())

        for q in queues:
            try:
                q.put_nowait(payload)
            except Exception:
                pass

    def _evict_from_latest(self, job_id: str):
        for job_type, latest_id in list(self._latest_by_type.items()):
            if latest_id == job_id:
                del self._latest_by_type[job_type]

    def _conflicts_with_active(self, job_type: str, active: set) -> bool:
        spec = self._specs[job_type]

        if not spec.conflicts_with.isdisjoint(active):
            return True

        for active_type in active:
            active_spec = self._specs.get(active_type)
            if active_spec and job_type in active_spec.conflicts_with:
                return True

        return False

    def _pop_dispatchable(self):
        # Work with a snapshot of active_types, adding as we tentatively dispatch,
        # so that two jobs dispatched in the same pass can conflict with each other.
        active = set(self._active_types)
        dispatchable = []
        still_queued = collections.deque()

        for job in self._queue:
            if not self._conflicts_with_active(job.job_type, active):
                active.add(job.job_type)
                dispatchable.append(job)
            else:
                still_queued.append(job)

        self._queue = still_queued
        return dispatchable

    def _on_job_terminal(self, job: Job):
        # Snapshot before acquiring the manager lock to avoid nested locking
        # (manager → job). Safe because a terminal status never changes.
        snap = job.snapshot()

        print(f'[job-manager] {job.job_type} {snap["status"]}', file=sys.stderr, flush=True)
        jobs_to_start = []

        with self._lock:
            if snap["started_at"] is not None:
                count = self._active_types.get(job.job_type, 0) - 1
                if count > 0:
                    self._active_types[job.job_type] = count
                else:
                    self._active_types.pop(job.job_type, None)

            if job in self._queue:
                self._queue.remove(job)

            if snap["status"] in ("completed", "aborted"):
                # Auto-remove successful and cancelled jobs — the caller has
                # no reason to inspect them after the fact.
                # Failed jobs are intentionally kept so the client can read
                # the error message; they leave the registry via dismiss().
                self._jobs.pop(job.job_id, None)
                self._evict_from_latest(job.job_id)
                removed = {
                    "type": "removed",
                    "job_id": job.job_id,
                    "job_type": job.job_type,
                    "status": snap["status"],
                }
            else:
                removed = None

            # Dispatch queued jobs that are now unblocked
            jobs_to_start = self._pop_dispatchable()
            # Pre-register as active so concurrent start() calls see the correct
            # state before the threads actually launch.
            for j in jobs_to_start:
                self._active_types[j.job_type] = (
                    self._active_types.get(j.job_type, 0) + 1
                )

        if removed:
            self._broadcast(removed)

        for j in jobs_to_start:
            j.start()

    def start(self, job_type: str):
        print(f"[job-manager] {job_type} start", file=sys.stderr, flush=True)
        should_queue = False

        with self._lock:
            if job_type not in self._specs:
                raise KeyError(f"Unknown job type: {job_type!r}")

            spec = self._specs[job_type]

            # Return the existing job if it is still active or waiting (single-instance types only)
            if not spec.allow_multiple:
                existing_id = self._latest_by_type.get(job_type)
                if existing_id:
                    existing = self._jobs.get(existing_id)
                    if existing and existing._status in ("running", "paused", "queued"):
                        return existing, False

            job = spec.builder()
            job._on_event = self._broadcast
            job._on_terminal = self._on_job_terminal

            self._jobs[job.job_id] = job
            self._latest_by_type[job_type] = job.job_id

            if not self._conflicts_with_active(job_type, set(self._active_types)):
                self._active_types[job_type] = self._active_types.get(job_type, 0) + 1
            else:
                self._queue.append(job)
                should_queue = True

        if should_queue:
            job.queue()
        else:
            job.start()

        return job, True

    def _job_action(self, job_id: str, action: str):
        job = self.get(job_id)
        if not job:
            return None
        ok = getattr(job, action)()
        snap = job.snapshot()
        snap["action_ok"] = ok
        return snap

    def pause(self, job_id: str):
        return self._job_action(job_id, "pause")

    def resume(self, job_id: str):
        return self._job_action(job_id, "resume")

    def abort(self, job_id: str):
        return self._job_action(job_id, "abort")

    def dismiss(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            snap = job.snapshot()
            if snap["status"] != "failed":
                return False
            del self._jobs[job_id]
            self._evict_from_latest(job_id)
            self._broadcast(
                {
                    "type": "removed",
                    "job_id": job_id,
                    "job_type": snap["job_type"],
                    "status": "failed",
                }
            )
        return True

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def get_latest(self, job_type: str) -> Job | None:
        with self._lock:
            job_id = self._latest_by_type.get(job_type)
            return self._jobs.get(job_id) if job_id else None

    def list_jobs(self, statuses=None) -> list:
        status_filter = set(statuses or [])

        with self._lock:
            jobs = list(self._jobs.values())

        snapshots = []
        for job in jobs:
            snap = job.snapshot()
            if status_filter and snap["status"] not in status_filter:
                continue
            snapshots.append(snap)

        snapshots.sort(key=lambda snap: snap.get("created_at", 0), reverse=True)
        return snapshots
