"""Tests for job_core.py — Job state machine and JobManager."""

import threading
import time

from job_core import Job, JobManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _noop_runner(ctx):
    return {"ok": True}


def _slow_runner(steps=10, step_time=0.05):
    """Returns a runner that takes `steps` checkpoints with a delay."""

    def runner(ctx):
        for i in range(steps):
            ctx.checkpoint()
            time.sleep(step_time)
            ctx.set_progress(i + 1)
        return {}

    return runner


def _collect_events(job):
    """Attach an event collector to a job; returns the list."""
    events = []
    job._on_event = lambda e: events.append(e)
    return events


_exclusive_barrier = None


def _make_manager_with_types():
    """Set up a JobManager with two types: 'fast' (non-conflicting) and 'exclusive' (self-conflicting)."""
    global _exclusive_barrier
    _exclusive_barrier = threading.Event()

    def _exclusive_builder(args):
        barrier = _exclusive_barrier

        def runner(ctx):
            barrier.wait(timeout=5)
            for i in range(3):
                ctx.checkpoint()
            return {}

        return Job("exclusive", runner)

    mgr = JobManager()
    mgr.register("fast", lambda args: Job("fast", _noop_runner), allow_multiple=True)
    mgr.register(
        "exclusive",
        _exclusive_builder,
        conflicts_with=["exclusive"],
        allow_multiple=True,
    )
    return mgr


# ---------------------------------------------------------------------------
# Job lifecycle
# ---------------------------------------------------------------------------


class TestJobLifecycle:
    def test_start_and_complete(self):
        job = Job("test", _noop_runner)
        assert job.snapshot()["status"] == "idle"

        job.start()
        job._thread.join(timeout=2)

        snap = job.snapshot()
        assert snap["status"] == "completed"
        assert snap["result"] == {"ok": True}
        assert snap["started_at"] is not None
        assert snap["finished_at"] is not None

    def test_pause_and_resume(self):
        barrier = threading.Event()

        def runner(ctx):
            barrier.wait(timeout=5)
            for i in range(5):
                ctx.checkpoint()
            return {}

        job = Job("test", runner)
        events = _collect_events(job)

        job.start()
        assert job.pause()

        snap = job.snapshot()
        assert snap["status"] == "paused"

        assert job.resume()
        snap = job.snapshot()
        assert snap["status"] == "running"

        barrier.set()
        job._thread.join(timeout=2)
        assert job.snapshot()["status"] == "completed"

        statuses = [e["job"]["status"] for e in events]
        assert "paused" in statuses
        assert statuses.index("paused") < statuses.index("completed")

    def test_abort_running(self):
        def runner(ctx):
            while True:
                ctx.checkpoint()
                time.sleep(0.01)

        job = Job("test", runner)
        terminal = []
        job._on_terminal = lambda j: terminal.append(j)

        job.start()
        time.sleep(0.05)
        assert job.abort()

        job._thread.join(timeout=2)
        snap = job.snapshot()
        assert snap["status"] == "aborted"
        assert snap["finished_at"] is not None
        assert len(terminal) == 1

    def test_abort_queued(self):
        job = Job("test", _noop_runner)
        terminal = []
        job._on_terminal = lambda j: terminal.append(j)

        job.queue()
        assert job.snapshot()["status"] == "queued"

        assert job.abort()
        assert job.snapshot()["status"] == "aborted"
        assert len(terminal) == 1

    def test_failed_job(self):
        def runner(ctx):
            raise RuntimeError("boom")

        job = Job("test", runner)
        job.start()
        job._thread.join(timeout=2)

        snap = job.snapshot()
        assert snap["status"] == "failed"
        assert "boom" in snap["error"]

    def test_invalid_transitions_return_false(self):
        job = Job("test", _noop_runner)
        assert not job.pause()  # can't pause idle
        assert not job.resume()  # can't resume idle
        assert not job.abort()  # can't abort idle (not queued/running/paused)

    def test_set_progress(self):
        barrier = threading.Event()

        def runner(ctx):
            ctx.set_progress(3)
            barrier.set()
            ctx.checkpoint()
            return {}

        job = Job("test", runner, total=10)
        job.start()
        barrier.wait(timeout=2)

        snap = job.snapshot()
        assert snap["done"] == 3
        assert snap["total"] == 10

        job._thread.join(timeout=2)

    def test_checkpoint_blocks_while_paused(self):
        ready_to_pause = threading.Event()
        resumed = threading.Event()

        def runner(ctx):
            ready_to_pause.set()
            # Wait until we've been paused before hitting checkpoint
            time.sleep(0.1)
            ctx.checkpoint()
            resumed.set()
            return {}

        job = Job("test", runner)
        job.start()
        ready_to_pause.wait(timeout=2)
        job.pause()

        # Give the runner time to reach checkpoint while paused
        time.sleep(0.2)
        assert not resumed.is_set()

        job.resume()
        resumed.wait(timeout=2)
        assert resumed.is_set()

        job._thread.join(timeout=2)

    def test_snapshot_revision_increments(self):
        job = Job("test", _noop_runner)
        r0 = job.snapshot()["revision"]
        job.start()
        job._thread.join(timeout=2)
        r1 = job.snapshot()["revision"]
        assert r1 > r0

    def test_status_is_always_a_string(self):
        """Regression: resume() and abort() must set status to a string, not a list."""
        barrier = threading.Event()

        def runner(ctx):
            barrier.wait(timeout=5)
            ctx.checkpoint()
            return {}

        job = Job("test", runner)
        job.start()

        job.pause()
        assert isinstance(job.snapshot()["status"], str)

        job.resume()
        assert isinstance(job.snapshot()["status"], str)
        assert job.snapshot()["status"] == "running"

        job.abort()
        assert isinstance(job.snapshot()["status"], str)

        barrier.set()
        job._thread.join(timeout=2)


# ---------------------------------------------------------------------------
# JobManager
# ---------------------------------------------------------------------------


class TestJobManager:
    def test_start_and_complete(self):
        mgr = _make_manager_with_types()
        job, created = mgr.start("fast")
        assert created
        job._thread.join(timeout=2)
        assert job.snapshot()["status"] == "completed"

    def test_unknown_type_raises(self):
        mgr = JobManager()
        try:
            mgr.start("nonexistent")
            assert False, "should have raised"
        except KeyError:
            pass

    def test_single_instance_dedup(self):
        mgr = JobManager()
        barrier = threading.Event()

        def slow_builder(args):
            def runner(ctx):
                barrier.wait(timeout=5)
                return {}

            return Job("single", runner)

        mgr.register("single", slow_builder, allow_multiple=False)

        job1, created1 = mgr.start("single")
        assert created1

        job2, created2 = mgr.start("single")
        assert not created2
        assert job2.job_id == job1.job_id

        barrier.set()
        job1._thread.join(timeout=2)

    def test_allow_multiple(self):
        mgr = _make_manager_with_types()
        job1, _ = mgr.start("fast")
        job2, _ = mgr.start("fast")
        assert job1.job_id != job2.job_id

    def test_conflict_queues_job(self):
        mgr = _make_manager_with_types()

        job1, _ = mgr.start("exclusive")
        assert job1.snapshot()["status"] == "running"

        job2, _ = mgr.start("exclusive")
        assert job2.snapshot()["status"] == "queued"

        _exclusive_barrier.set()
        job1._thread.join(timeout=2)
        # After job1 finishes, job2 should get dispatched.
        time.sleep(0.2)
        assert job2.snapshot()["status"] in ("running", "completed")
        job2._thread.join(timeout=2)

    def test_bidirectional_conflicts(self):
        mgr = JobManager()
        mgr.register("a", lambda args: Job("a", _slow_runner(3, 0.02)), conflicts_with=["b"])
        mgr.register("b", lambda args: Job("b", _slow_runner(3, 0.02)))

        job_a, _ = mgr.start("a")
        job_b, _ = mgr.start("b")
        # b should be queued because a declares conflict with b
        assert job_b.snapshot()["status"] == "queued"

        job_a._thread.join(timeout=2)
        time.sleep(0.2)
        assert job_b.snapshot()["status"] in ("running", "completed")

    def test_pause_resume_abort_via_manager(self):
        mgr = _make_manager_with_types()
        job, _ = mgr.start("exclusive")

        snap = mgr.pause(job.job_id)
        assert snap["status"] == "paused"

        snap = mgr.resume(job.job_id)
        assert snap["status"] == "running"

        snap = mgr.abort(job.job_id)
        assert snap["status"] == "aborted"

        _exclusive_barrier.set()
        job._thread.join(timeout=2)

    def test_dismiss_failed_job(self):
        mgr = JobManager()
        mgr.register(
            "fail",
            lambda args: Job("fail", lambda ctx: (_ for _ in ()).throw(RuntimeError("x"))),
        )

        job, _ = mgr.start("fail")
        job._thread.join(timeout=2)
        assert job.snapshot()["status"] == "failed"
        assert mgr.get(job.job_id) is not None

        assert mgr.dismiss(job.job_id)
        assert mgr.get(job.job_id) is None

    def test_dismiss_non_failed_returns_false(self):
        mgr = _make_manager_with_types()
        job, _ = mgr.start("exclusive")
        assert not mgr.dismiss(job.job_id)
        _exclusive_barrier.set()
        job.abort()
        job._thread.join(timeout=2)

    def test_completed_job_auto_removed(self):
        mgr = _make_manager_with_types()
        job, _ = mgr.start("fast")
        job._thread.join(timeout=2)
        time.sleep(0.1)
        assert mgr.get(job.job_id) is None

    def test_aborted_job_auto_removed(self):
        mgr = _make_manager_with_types()
        job, _ = mgr.start("exclusive")
        _exclusive_barrier.set()
        mgr.abort(job.job_id)
        job._thread.join(timeout=2)
        time.sleep(0.1)
        assert mgr.get(job.job_id) is None

    def test_subscribe_receives_events(self):
        mgr = _make_manager_with_types()
        sub_id, q = mgr.subscribe()

        job, _ = mgr.start("fast")
        job._thread.join(timeout=2)
        time.sleep(0.1)

        events = []
        while not q.empty():
            events.append(q.get_nowait())

        types = [e["type"] for e in events]
        assert "snapshot" in types
        assert "removed" in types

        mgr.unsubscribe(sub_id)

    def test_list_jobs(self):
        mgr = _make_manager_with_types()
        job, _ = mgr.start("exclusive")

        jobs = mgr.list_jobs()
        assert len(jobs) == 1
        assert jobs[0]["job_id"] == job.job_id

        _exclusive_barrier.set()
        mgr.abort(job.job_id)
        job._thread.join(timeout=2)

    def test_queued_job_abort(self):
        mgr = _make_manager_with_types()

        job1, _ = mgr.start("exclusive")
        job2, _ = mgr.start("exclusive")
        assert job2.snapshot()["status"] == "queued"

        mgr.abort(job2.job_id)
        assert job2.snapshot()["status"] == "aborted"

        _exclusive_barrier.set()
        job1._thread.join(timeout=2)

    def test_active_types_cleanup(self):
        """After a job completes, its type must be removed from _active_types."""
        mgr = _make_manager_with_types()
        job, _ = mgr.start("exclusive")
        _exclusive_barrier.set()
        job._thread.join(timeout=2)
        time.sleep(0.1)
        assert "exclusive" not in mgr._active_types
