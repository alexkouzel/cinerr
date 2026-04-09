/**
 * Centralized user-facing toast notifications.
 * All message strings live here — no other file should call Toast directly.
 */
export default class Notify {

    // --- public ---

    /** @param {(msg: string, isError?: boolean) => void} showFn */
    static init(showFn) {
        this._show = showFn;
    }

    static scanComplete() {
        this._show('scan complete');
    }

    static scanFailed() {
        this._show('scan failed', true);
    }

    static scanAborted() {
        this._show('scan aborted');
    }

    static jobBlocked(requestedType, runningType) {
        const requested = this._formatJobType(requestedType);
        const running = this._formatJobType(runningType);
        this._show(`cannot start ${requested}: ${running} is already running`, true);
    }

    // --- private ---

    static _show = () => {};

    /** Converts a job type slug like "clean-cache" to "clean cache". */
    static _formatJobType(jobType) {
        return (jobType || 'unknown').replace(/-/g, ' ');
    }
}
