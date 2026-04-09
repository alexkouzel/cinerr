/**
 * Renders the jobs tab: a live-updating list of running, paused, queued, and
 * failed jobs with action buttons (pause/resume/abort/dismiss).
 *
 * Connects to the server via SSE and forwards events to a callback (Jobs.handleEvent).
 *
 * Rendering strategy: rows are keyed by job_id and updated in-place on each
 * render. This prevents hover flicker and ensures button clicks are never
 * swallowed by a mid-click DOM rebuild. A single delegated click listener on
 * the list container handles all button actions.
 */

/**
 * @typedef {{
 *     job_id: string,
 *     job_type: string,
 *     status: string,
 *     done: number,
 *     total: number,
 *     result: Object|null,
 *     error: string|null,
 *     created_at: number,
 *     started_at: number|null,
 * }} JobSnapshot
 */

export default class JobsPanel {

    // --- public ---

    /**
     * Registers a callback invoked after every job event with the current snapshot.
     * The payload is {type, jobs, counts, ...event-specific fields}.
     * Returns an unsubscribe function.
     * @param {function} callback
     * @returns {function}
     */
    static subscribe(callback) {
        this._subscribers.add(callback);
        return () => this._subscribers.delete(callback);
    }

    /**
     * Opens an SSE stream and starts rendering job updates.
     * @param {{openStream, onPause, onResume, onAbort, onDismiss}} callbacks
     */
    static startPolling({openStream, onPause, onResume, onAbort, onDismiss}) {
        this._actions = {onPause, onResume, onAbort, onDismiss};
        this.stopPolling();

        // One delegated click listener on the list handles all action buttons.
        // Attached once; never needs to be re-added after DOM updates.
        if (!this._listenerAttached) {
            document.getElementById('jobs-list').addEventListener('click', this._onActionClick);
            this._listenerAttached = true;
        }

        this._closeStream = openStream(this._onStreamEvent, () => {});
        // Refresh relative timestamps every second without a full re-render.
        this._tickInterval = setInterval(() => this._tickTimes(), 1_000);
    }

    static stopPolling() {
        if (this._closeStream) {
            this._closeStream();
            this._closeStream = null;
        }
        if (this._tickInterval) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
    }

    // --- private: state ---

    static _VISIBLE_STATUSES = new Set(['queued', 'running', 'paused', 'failed']);
    static _DONE_STATUSES    = new Set(['completed', 'aborted']);

    /** @type {Set<function>} */
    static _subscribers = new Set();
    /** @type {(() => void) | null} */
    static _closeStream = null;
    /** @type {number | null} */
    static _tickInterval = null;
    static _actions = {};
    /** job_id → latest snapshot @type {Map<string, JobSnapshot>} */
    static _jobs = new Map();
    /**
     * job_id → status at the time an action was sent.
     * While present, buttons are disabled and snapshots still showing
     * this status are treated as stale (server hasn't applied the action yet).
     * @type {Map<string, string>}
     */
    static _pending = new Map();
    /** job_id → row HTMLElement @type {Map<string, HTMLElement>} */
    static _rowCache = new Map();
    /** Whether the delegated click listener has been attached. */
    static _listenerAttached = false;
    /** Whether a requestAnimationFrame render is already scheduled. */
    static _rafPending = false;

    // --- private: stream handling ---

    static _onStreamEvent = (event) => {
        if (!event || !event.type) return;

        if (event.type === 'bootstrap') {
            console.log(`[jobs-panel] stream connected: ${event.jobs?.length ?? 0} active jobs`);
            this._jobs = new Map();
            this._pending = new Map();
            this._rowCache = new Map();
            document.getElementById('jobs-list').innerHTML = '';
            (event.jobs || []).forEach(job => this._applySnapshot(job));
            this._scheduleRender();
            this._notify({type: 'bootstrap'});
            return;
        }

        if (event.type === 'snapshot' && event.job) {
            if (!this._DONE_STATUSES.has(event.job.status)) {
                console.log(`[jobs-panel] ${event.job.job_type}: ${event.job.status} (${event.job.done}/${event.job.total})`);
            }
            this._applySnapshot(event.job);
            this._scheduleRender();
            this._notify({type: 'snapshot', job: event.job});
            return;
        }

        if (event.type === 'removed' && event.job_id) {
            console.log(`[jobs-panel] ${event.job_type} cleared`);
            this._remove(event.job_id);
            this._scheduleRender();
            this._notify({type: 'removed', ...event});
        }
    };

    /**
     * Applies a snapshot to internal state.
     * - Terminal (completed/aborted) jobs are discarded immediately.
     * - While a pending action is in flight, we update job data but keep the
     *   buttons locked until the server reflects the new status.
     * @param {JobSnapshot} job
     */
    static _applySnapshot(job) {
        if (this._DONE_STATUSES.has(job.status)) {
            this._jobs.delete(job.job_id);
            this._pending.delete(job.job_id);
            return;
        }

        const pendingStatus = this._pending.get(job.job_id);
        if (pendingStatus && job.status === pendingStatus) {
            // Server hasn't applied the action yet — update data, keep lock.
            this._jobs.set(job.job_id, job);
            return;
        }

        // Status changed (or no pending action) — clear the lock.
        this._pending.delete(job.job_id);
        this._jobs.set(job.job_id, job);
    }

    static _remove(jobId) {
        this._jobs.delete(jobId);
        this._pending.delete(jobId);
    }

    static _notify(change) {
        if (!this._subscribers.size) return;
        const jobs = this._visibleJobs();
        const counts = {running: 0, paused: 0, failed: 0, queued: 0};
        for (const job of jobs) {
            if (counts[job.status] !== undefined) counts[job.status]++;
        }
        const payload = {jobs, counts, ...change};
        for (const cb of this._subscribers) cb(payload);
    }

    static _visibleJobs() {
        return Array.from(this._jobs.values())
            .filter(job => this._VISIBLE_STATUSES.has(job.status))
            .sort((a, b) => {
                const aFailed = a.status === 'failed' ? 1 : 0;
                const bFailed = b.status === 'failed' ? 1 : 0;
                if (aFailed !== bFailed) return aFailed - bFailed;
                return (b.created_at || 0) - (a.created_at || 0);
            });
    }

    // --- private: job actions ---

    /** Delegated click handler for all job action buttons. */
    static _onActionClick = (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        const {action, jobId} = btn.dataset;
        const job = this._jobs.get(jobId);
        if (!job) return;
        const fn = {
            pause:   this._actions.onPause,
            resume:  this._actions.onResume,
            abort:   this._actions.onAbort,
            dismiss: this._actions.onDismiss,
        }[action];
        if (fn) this._sendAction(jobId, job.status, fn);
    };

    /**
     * Sends an API action for a job, disabling its buttons until the server
     * reflects the change. On failure the pending state is rolled back.
     */
    static _sendAction(jobId, currentStatus, apiFn) {
        this._pending.set(jobId, currentStatus);
        this._render();
        apiFn(jobId).catch((err) => {
            console.error('[jobs-panel] action failed:', err);
            this._pending.delete(jobId);
            this._render();
        });
    }

    // --- private: rendering ---

    static _tickTimes() {
        for (const [jobId, el] of this._rowCache) {
            const job = this._jobs.get(jobId);
            if (job) el.querySelector('.job-progress-text').textContent = this._progressText(job);
        }
    }

    static _scheduleRender() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this._render();
        });
    }

    static _render() {
        const list  = document.getElementById('jobs-list');
        const empty = document.getElementById('jobs-empty');
        const jobs  = this._visibleJobs();

        empty.hidden = jobs.length > 0;

        // Remove rows for jobs that are no longer visible.
        const visibleIds = new Set(jobs.map(j => j.job_id));
        for (const [id, el] of this._rowCache) {
            if (!visibleIds.has(id)) {
                el.remove();
                this._rowCache.delete(id);
            }
        }

        // Add or update rows, ensuring DOM order matches the sorted job list.
        jobs.forEach((job, i) => {
            let el = this._rowCache.get(job.job_id);
            if (!el) {
                el = this._buildRow(job);
                this._rowCache.set(job.job_id, el);
            } else {
                this._updateRow(el, job);
            }
            // Insert at the correct position without moving elements that are
            // already in the right place.
            const sibling = list.children[i] || null;
            if (sibling !== el) list.insertBefore(el, sibling);
        });
    }

    /**
     * Creates a new row element for a job. Called once per job_id.
     * @param {JobSnapshot} job
     */
    static _buildRow(job) {
        const el = document.createElement('div');
        el.dataset.jobId = job.job_id;

        const line1 = document.createElement('div');
        line1.className = 'job-line1';
        line1.appendChild(Object.assign(document.createElement('span'), {className: 'job-name'}));
        line1.appendChild(Object.assign(document.createElement('span'), {className: 'job-dot', textContent: '·'}));
        line1.appendChild(Object.assign(document.createElement('span'), {className: 'job-badge'}));
        line1.appendChild(Object.assign(document.createElement('div'), {className: 'job-actions'}));
        el.appendChild(line1);

        const track = document.createElement('div');
        track.className = 'job-bar-track';
        track.appendChild(Object.assign(document.createElement('div'), {className: 'job-bar-fill'}));
        el.appendChild(track);

        const metaLine = document.createElement('div');
        metaLine.className = 'job-meta-line';
        metaLine.appendChild(Object.assign(document.createElement('span'), {className: 'job-error'}));
        metaLine.appendChild(Object.assign(document.createElement('span'), {className: 'job-progress-text'}));
        el.appendChild(metaLine);

        this._updateRow(el, job);
        return el;
    }

    /**
     * Updates an existing row element in-place. Never recreates the row itself,
     * so hover state and focus are preserved across renders.
     * @param {HTMLElement} el
     * @param {JobSnapshot} job
     */
    static _updateRow(el, job) {
        const busy = this._pending.has(job.job_id);

        el.className = `job-item ${job.status}`;

        el.querySelector('.job-name').textContent = this._formatJobType(job.job_type);

        const showBadge = job.status === 'queued' || job.status === 'paused';
        el.querySelector('.job-dot').hidden = !showBadge;
        const badge = el.querySelector('.job-badge');
        badge.className = `job-badge ${job.status}`;
        badge.textContent = job.status === 'queued' ? 'in queue' : 'paused';
        badge.hidden = !showBadge;

        this._updateActions(el.querySelector('.job-actions'), job, busy);

        el.querySelector('.job-bar-fill').style.width =
            job.total > 0 ? `${(job.done / job.total * 100).toFixed(1)}%` : '0%';

        el.querySelector('.job-progress-text').textContent = this._progressText(job);

        const errorEl = el.querySelector('.job-error');
        errorEl.hidden = !job.error;
        errorEl.textContent = job.error || '';
    }

    /**
     * Updates action buttons in-place when the action set hasn't changed size,
     * or rebuilds the actions container only when the set changes.
     * Updating in-place is what prevents the hover flicker on the pause button.
     */
    static _updateActions(container, job, busy) {
        const actions = this._getActions(job.status);
        const buttons = Array.from(container.querySelectorAll('.job-btn'));

        if (buttons.length === actions.length) {
            // Same buttons — update label, action, and disabled state in-place.
            buttons.forEach((btn, i) => {
                btn.textContent     = actions[i].label;
                btn.dataset.action  = actions[i].action;
                btn.dataset.jobId   = job.job_id;
                btn.disabled        = busy;
            });
        } else {
            // Action set changed (e.g. running → failed) — rebuild the container.
            container.innerHTML = '';
            for (const {label, action} of actions) {
                const btn = document.createElement('button');
                btn.className      = 'job-btn';
                btn.textContent    = label;
                btn.dataset.action = action;
                btn.dataset.jobId  = job.job_id;
                btn.disabled       = busy;
                container.appendChild(btn);
            }
        }
    }

    /** Returns the ordered list of {label, action} for a given status. */
    static _getActions(status) {
        if (status === 'running') return [{label: 'PAUSE', action: 'pause'}, {label: 'ABORT', action: 'abort'}];
        if (status === 'paused')  return [{label: 'RESUME', action: 'resume'}, {label: 'ABORT', action: 'abort'}];
        if (status === 'queued')  return [{label: 'ABORT', action: 'abort'}];
        if (status === 'failed')  return [{label: 'DISMISS', action: 'dismiss'}];
        return [];
    }

    // --- private: formatters ---

    /** Converts "scan-media" → "scan media". */
    static _formatJobType(value) {
        return (value || 'unknown').replace(/-/g, ' ');
    }

    static _progressText(job) {
        const time = this._timeLabel(job);
        if (job.status === 'queued') return 'waiting to start';
        const count = `${job.done} / ${job.total}`;
        return time ? `${count}  ·  ${time}` : count;
    }

    static _timeLabel(job) {
        const ago = (ts) => {
            const sec = Math.round(Date.now() / 1000 - ts);
            if (sec < 60)   return `${sec}s ago`;
            if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
            return `${Math.floor(sec / 3600)}h ago`;
        };
        if (job.status === 'running' && job.started_at)  return `started ${ago(job.started_at)}`;
        if (job.status === 'paused'  && job.started_at)  return `started ${ago(job.started_at)}`;
        if (job.status === 'failed'  && job.finished_at) return `failed ${ago(job.finished_at)}`;
        return null;
    }
}
