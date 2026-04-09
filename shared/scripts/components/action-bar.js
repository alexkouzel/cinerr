/** Bottom action bar with scan button. */
export default class ActionBar {

    static DEBUG = false;

    // --- public ---

    /** Binds delegated click handlers for action buttons. */
    static bindHandlers({onScan, onDebugFail, onDebugParallel, onDebugExclusive, onDebugDeleteCsv}) {
        document.getElementById('action-buttons')
            .addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                if (btn.id === 'scan-media-btn') onScan();
            });

        if (this.DEBUG) {
            document.getElementById('debug-buttons')
                .addEventListener('click', (e) => {
                    const btn = e.target.closest('button');
                    if (!btn) return;
                    if (btn.id === 'debug-fail-btn')       onDebugFail?.();
                    if (btn.id === 'debug-parallel-btn')   onDebugParallel?.();
                    if (btn.id === 'debug-exclusive-btn')  onDebugExclusive?.();
                    if (btn.id === 'debug-delete-csv-btn') onDebugDeleteCsv?.();
                });
        }
    }

    /** Reveals the action bar and starts tracking its height to adjust body padding. */
    static show() {
        const bar = document.getElementById('action-bar');
        bar.hidden = false;
        if (this.DEBUG) {
            document.getElementById('debug-buttons').hidden = false;
        }
        this._syncLayout(bar);
        new ResizeObserver(() => this._syncLayout(bar)).observe(bar);
    }

    /** Toggles the loading spinner and disabled state of a button by id. */
    static setLoading(btnId, isLoading) {
        const btn = document.getElementById(btnId);
        btn.classList.toggle('loading', isLoading);
        btn.disabled = isLoading;
    }

    /** Sets the disabled state of a button by id. */
    static setDisabled(btnId, disabled) {
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = disabled;
    }

    // --- private ---

    /** Extra breathing room between content and the action bar. */
    static _BOTTOM_GAP_PX = 24;

    /** Gap between toast container and the top of the action bar. */
    static _TOAST_GAP_PX = 12;

    /** Syncs body padding and toast position to match the action bar's current height. */
    static _syncLayout(bar) {
        const barHeight = bar.offsetHeight;
        document.body.style.paddingBottom = `${barHeight + this._BOTTOM_GAP_PX}px`;
        const toast = document.getElementById('toast-container');
        if (toast) toast.style.bottom = `${barHeight + this._TOAST_GAP_PX}px`;
    }
}
