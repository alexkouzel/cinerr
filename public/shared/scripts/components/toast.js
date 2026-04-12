export default class Toast {

    // --- public ---

    static show(msg, isError = false) {
        const container = document.getElementById('toast-container');

        const el = document.createElement('div');
        el.className = isError ? 'toast error' : 'toast';
        el.textContent = msg;

        container.prepend(el);

        // Force reflow so the opacity transition plays.
        el.offsetHeight;
        el.classList.add('visible');

        setTimeout(() => this._dismiss(el), this._DISMISS_MS);
    }

    // --- private ---

    static _DISMISS_MS = 4000;
    static _FADE_MS    = 200;
    static _SLIDE_MS   = 200;

    /**
     * Fades out the element, then collapses its height and margin so that any
     * toasts stacked above it slide smoothly down into the vacated space.
     */
    static _dismiss(el) {
        el.classList.remove('visible');

        // Lock current px values so the browser can transition from them to 0.
        setTimeout(() => {
            const cs = getComputedStyle(el);
            el.style.height        = el.offsetHeight + 'px';
            el.style.paddingTop    = cs.paddingTop;
            el.style.paddingBottom = cs.paddingBottom;
            el.style.marginBottom  = cs.marginBottom;
            el.style.overflow      = 'hidden';
            el.offsetHeight;
            el.style.transition    = `height ${this._SLIDE_MS}ms, padding-top ${this._SLIDE_MS}ms, padding-bottom ${this._SLIDE_MS}ms, margin-bottom ${this._SLIDE_MS}ms`;
            el.style.height        = '0';
            el.style.paddingTop    = '0';
            el.style.paddingBottom = '0';
            el.style.marginBottom  = '0';
        }, this._FADE_MS);

        setTimeout(() => el.remove(), this._FADE_MS + this._SLIDE_MS);
    }
}
