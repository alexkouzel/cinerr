export default class Tabs {

    // --- public ---

    static bind() {
        document.getElementById('tab-nav')
            .addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;
                const target = btn.getAttribute('data-tab-target');
                if (target && target !== this._active) {
                    this.setActive(target);
                }
            });
    }

    static setJobBadges({running = 0, paused = 0, failed = 0, queued = 0} = {}) {
        const container = document.getElementById('jobs-counts');
        if (!container) return;
        const parts = [];
        if (running > 0) parts.push(`<span class="c-running">${running}</span>`);
        if (paused  > 0) parts.push(`<span class="c-paused">${paused}</span>`);
        if (failed  > 0) parts.push(`<span class="c-failed">${failed}</span>`);
        if (queued  > 0) parts.push(`<span class="c-queued">${queued}</span>`);
        container.innerHTML = parts.join(' ');
    }

    static setActive(name) {
        this._active = name;

        for (const [tab, {panelId, btnId}] of Object.entries(this._TABS)) {
            const isActive = tab === name;
            document.getElementById(panelId).hidden = !isActive;
            document.getElementById(btnId).classList.toggle('active', isActive);
            document.getElementById(btnId).setAttribute('aria-selected', String(isActive));
        }
    }

    // --- private ---

    static _active = 'stats';

    static _TABS = {
        stats: {panelId: 'tab-panel-stats', btnId: 'tab-btn-stats'},
        jobs: {panelId: 'tab-panel-jobs', btnId: 'tab-btn-jobs'},
    };
}
