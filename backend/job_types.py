"""
job_types.py — job type definitions and registration.

Job types:
    - scan-media        scan MEDIA_DIR and write media.csv
    - debug-fail        10 steps, intentionally fails at step 5
    - debug-parallel    10 steps, completes successfully
    - debug-exclusive   10 steps, conflicts with all other debug jobs
"""

import time

from config import DEBUG
from job_core import Job
from media_common import find_media_files
import media_scan

JOB_SCAN_MEDIA = "scan-media"

JOB_DEBUG_FAIL = "debug-fail"
JOB_DEBUG_PARALLEL = "debug-parallel"
JOB_DEBUG_EXCLUSIVE = "debug-exclusive"

ALL_DEBUG_JOBS = [JOB_DEBUG_FAIL, JOB_DEBUG_PARALLEL, JOB_DEBUG_EXCLUSIVE]


def _build_debug_job(job_type, action=None):
    total = 10

    def _run(ctx):
        for i in range(total):
            ctx.checkpoint()
            time.sleep(0.2)
            ctx.set_progress(i + 1)

            if action == "fail" and i == 4:
                raise Exception("intentional debug failure at step 5")

        return {}

    return Job(job_type, _run, total=total)


def _build_debug_fail_job():
    return _build_debug_job(JOB_DEBUG_FAIL, action="fail")


def _build_debug_parallel_job():
    return _build_debug_job(JOB_DEBUG_PARALLEL)


def _build_debug_exclusive_job():
    return _build_debug_job(JOB_DEBUG_EXCLUSIVE)


def _build_scan_media_job():
    total = len(find_media_files())

    def _run(ctx):
        ctx.set_progress(0)
        last_emit = 0.0
        throttle = 0.05

        def on_progress(done, _):
            nonlocal last_emit

            if DEBUG:
                time.sleep(0.01)

            now = time.time()
            if done == total or now - last_emit >= throttle:
                last_emit = now
                ctx.set_progress(done)

        return media_scan.run_scan(
            on_progress=on_progress,
            checkpoint=ctx.checkpoint,
        )

    return Job(JOB_SCAN_MEDIA, _run, total=total)


def register(manager):
    manager.register(
        job_type=JOB_SCAN_MEDIA,
        builder=_build_scan_media_job,
        conflicts_with=[],
    )

    if not DEBUG:
        return

    manager.register(
        job_type=JOB_DEBUG_FAIL,
        builder=_build_debug_fail_job,
        conflicts_with=[],
        allow_multiple=True,
    )
    manager.register(
        job_type=JOB_DEBUG_PARALLEL,
        builder=_build_debug_parallel_job,
        conflicts_with=[],
        allow_multiple=True,
    )
    manager.register(
        job_type=JOB_DEBUG_EXCLUSIVE,
        builder=_build_debug_exclusive_job,
        conflicts_with=ALL_DEBUG_JOBS,
        allow_multiple=True,
    )
