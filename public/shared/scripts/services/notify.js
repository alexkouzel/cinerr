export default class Notify {

    // --- public ---

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
