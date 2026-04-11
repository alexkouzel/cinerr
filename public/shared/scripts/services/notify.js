/**
 * Centralized user-facing toast notifications.
 * All message strings live here, no other file should call Toast directly.
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

    // --- private ---

    static _show = () => {};
}
