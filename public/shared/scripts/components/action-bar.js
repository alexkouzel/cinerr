export default class ActionBar {

    static DEBUG = false;

    // --- public ---

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

    static show() {
        const bar = document.getElementById('action-bar');
        bar.hidden = false;
        if (this.DEBUG) {
            document.getElementById('debug-buttons').hidden = false;
        }
        this._syncLayout(bar);
        new ResizeObserver(() => this._syncLayout(bar)).observe(bar);
    }

    static setLoading(btnId, isLoading) {
        const btn = document.getElementById(btnId);
        btn.classList.toggle('loading', isLoading);
        btn.disabled = isLoading;
    }

    static setDisabled(btnId, disabled) {
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = disabled;
    }

    // --- private ---

    static _BOTTOM_GAP_PX = 24;
    static _TOAST_GAP_PX = 12;

    static _syncLayout(bar) {
        const barHeight = bar.offsetHeight;
        document.body.style.paddingBottom = `${barHeight + this._BOTTOM_GAP_PX}px`;
        const toast = document.getElementById('toast-container');
        if (toast) toast.style.bottom = `${barHeight + this._TOAST_GAP_PX}px`;
    }
}
