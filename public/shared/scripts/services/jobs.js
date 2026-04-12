/**
 * Job lifecycle orchestrator.
 *
 * Tracks registered job types and their UI hooks (onStart, onDone,
 * onSuccess, onFailure). Receives SSE events from the jobs panel
 * and dispatches to the appropriate handler.
 *
 * Lifecycle: register → start → onStart → [server runs] → onDone → onSuccess / onAbort / onFailure
 *
 * Queueing is fully server-side. start() fires onStart immediately for
 * responsive UI feedback, regardless of whether the job will run now or wait.
 */

/**
 * @typedef {{
 *     job_id: string,
 *     job_type: string,
 *     status: 'idle'|'queued'|'running'|'paused'|'completed'|'failed'|'aborted',
 *     done: number,
 *     total: number,
 *     result: Object|null,
 *     error: string|null,
 *     revision: number,
 *     created_at: number,
 *     updated_at: number,
 *     started_at: number|null,
 *     finished_at: number|null,
 * }} JobSnapshot
 */

export default class Jobs {

    // --- public ---

    /** @param {{startJob: function}} callbacks */
    static init({ startJob }) {
        this._startJob = startJob;
    }

    /** Registers a job type with its lifecycle callbacks. */
    static register(jobType, { onStart, onDone, onSuccess, onAbort, onFailure }) {
        this._registry.set(jobType, { onStart, onDone, onSuccess, onAbort, onFailure });
    }

    /** Returns true if a job of the given type is currently active (running, paused, or queued). */
    static isActive(jobType) {
        return this._running.has(jobType);
    }

    /** Requests the server to start (or queue) a job of the given type. */
    static start(jobType, args = {}) {
        const handler = this._registry.get(jobType);
        if (!handler) return;
        if (this._running.has(jobType)) return; // already active or queued

        // Fire onStart immediately so the UI reacts before the round-trip.
        handler.onStart();

        this._startJob(jobType, args)
            .then(({ job }) => {
                // Map jobType → job_id so we can match terminal snapshots.
                this._running.set(jobType, job.job_id);
                // A terminal SSE event may have arrived before this resolved.
                const pending = this._pendingTerminals.get(job.job_id);
                if (pending) {
                    this._pendingTerminals.delete(job.job_id);
                    this._onSnapshot(pending);
                }
            })
            .catch((err) => {
                console.error(`[jobs] ${jobType} failed to start:`, err);
                this._running.delete(jobType);
                this._finish(handler, 'failed', {});
            });
    }

    /** Handles an SSE event forwarded from the jobs panel. */
    static handleEvent(event) {
        if (!event) return;

        if (event.type === 'bootstrap' && Array.isArray(event.jobs)) {
            this._onBootstrap(event.jobs);
            return;
        }

        if (event.type === 'snapshot' && event.job) {
            this._onSnapshot(event.job);
        }
    }

    // --- private ---

    /** jobType → {onStart, onDone, onSuccess, onAbort, onFailure} */
    static _registry = new Map();
    /** jobType → job_id of the currently active (running, paused, or queued) job */
    static _running = new Map();
    /** job_id → snapshot, for terminal events that arrived before startJob() resolved */
    static _pendingTerminals = new Map();
    static _startJob = () => Promise.reject(new Error('Jobs not initialised'));

    static _TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted']);
    static _ACTIVE_STATUSES = new Set(['running', 'paused', 'queued']);

    /** Calls onDone (always), then onSuccess, onAbort, or onFailure based on status. */
    static _finish(handler, status, result) {
        if (handler.onDone) handler.onDone();
        if (status === 'completed' && handler.onSuccess) {
            handler.onSuccess(result);
        } else if (status === 'aborted' && handler.onAbort) {
            handler.onAbort();
        } else if (status === 'failed' && handler.onFailure) {
            handler.onFailure();
        }
    }

    /**
     * On reconnect, pick up any jobs already active on the server.
     * @param {JobSnapshot[]} jobs
     */
    static _onBootstrap(jobs) {
        for (const job of jobs) {
            if (!this._ACTIVE_STATUSES.has(job.status)) continue;
            if (this._running.has(job.job_type)) continue; // already tracking

            const handler = this._registry.get(job.job_type);
            if (!handler) continue;

            console.log(`[jobs] resuming ${job.job_type} (${job.status})`);
            this._running.set(job.job_type, job.job_id);
            handler.onStart();
        }
    }

    /** 
     * When a tracked job reaches a terminal status, fire the lifecycle callbacks.
     * @param {JobSnapshot} job
     */
    static _onSnapshot(job) {
        if (!this._TERMINAL_STATUSES.has(job.status)) return;

        for (const [jobType, jobId] of this._running) {
            if (jobId !== job.job_id) continue;
            console.log(`[jobs] ${jobType} ${job.status}`);
            this._running.delete(jobType);
            const handler = this._registry.get(jobType);
            if (handler) this._finish(handler, job.status, job.result || {});
            return;
        }

        // job_id not yet in _running — startJob() hasn't resolved yet.
        // Buffer so start()'s .then() can pick it up.
        this._pendingTerminals.set(job.job_id, job);
    }
}
