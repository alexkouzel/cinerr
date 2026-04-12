/**
 * Renders the stats tab.
 *
 * State is owned internally as (_vm, _scanning). Callers push updates via
 * setViewModel() and setScanning(); _render() reconciles the DOM as a pure
 * function of current state, so updates can arrive in any order.
 */
export default class StatsPanel {

    // --- public ---

    /** Sets the current view model (or null for no data) and re-renders. */
    static setViewModel(vm) {
        this._vm = vm;
        this._render();
    }

    /** Sets the scanning flag and re-renders. */
    static setScanning(on) {
        this._scanning = on;
        this._render();
    }

    /** Sets the "last scan" timestamp in the summary bar. */
    static setLastScan(timestamp) {
        document.getElementById('s-lastscan').textContent = timestamp.trim();
    }

    // --- private: state ---

    static _vm = null;
    static _scanning = false;

    // --- private: config ---

    /** Maps DOM container IDs to view model group keys. */
    static _GROUPS = [
        ['g-path', 'path'],
        ['g-resolution', 'resolution'],
        ['g-format', 'format'],
        ['g-hdr', 'hdr'],
        ['g-audio', 'audio'],
        ['g-audio-langs', 'audioLangs'],
        ['g-subtitle-langs', 'subtitleLangs'],
    ];

    /** Maps DOM IDs to view model savings keys. [groupId, containerId, vmKey] */
    static _SAVINGS = [
        ['video-savings-group', 'g-video-savings', 'video'],
        ['audio-savings-group', 'g-audio-savings', 'audio'],
    ];

    /** Labels pushed to the end of sorted stat groups (e.g. unknown/missing values). */
    static _TAIL_LABELS = ['-'];

    /** Savings entries below this share of total are hidden. */
    static _SAVINGS_THRESHOLD = 0.10;

    // --- private: rendering ---

    /** Reconciles the DOM to reflect current (_vm, _scanning) state. */
    static _render() {
        if (this._vm) {
            this._renderStats(this._vm);
            document.getElementById('stats').hidden = false;
            document.getElementById('stats-placeholder').hidden = true;
            return;
        }
        document.getElementById('stats').hidden = true;
        document.getElementById('stats-placeholder').hidden = false;
        document.getElementById('stats-loading').hidden = true;
        document.getElementById('stats-error').hidden = this._scanning;
        document.getElementById('stats-scanning').hidden = !this._scanning;
    }

    static _renderStats(vm) {
        this._renderSummary(vm.summary);

        for (const [id, key] of this._GROUPS) {
            this._renderGroup(id, vm.groups[key].counts, vm.groups[key].total);
        }

        for (const [groupId, containerId, key] of this._SAVINGS) {
            this._renderSavings(groupId, containerId, vm.savings[key].entries, vm.savings[key].totalGiB);
        }
    }

    static _renderSummary({totalFiles, totalSize, totalDuration}) {
        document.getElementById('s-total').textContent = totalFiles;
        document.getElementById('s-size').textContent = totalSize;
        document.getElementById('s-duration').textContent = totalDuration;
    }

    /** Renders a stat group: sorted rows with label, count, and a percentage bar. */
    static _renderGroup(containerId, counts, total) {
        const container = document.getElementById(containerId);

        // Sort by count descending, but push tail labels (like "-") to the end.
        const sorted = Object.entries(counts)
            .sort(([labelA, countA], [labelB, countB]) => {

                const tailA = this._TAIL_LABELS.indexOf(labelA);
                const tailB = this._TAIL_LABELS.indexOf(labelB);

                if (tailA !== -1 || tailB !== -1) {
                    return (tailA === -1 ? -1 : tailA) - (tailB === -1 ? -1 : tailB);
                }
                return countB - countA;
            });

        container.innerHTML = sorted.map(([label, count]) => {
            const pct = (count / total * 100).toFixed(1);
            return `
              <div class="stat-row">
                <div class="stat-label">${label.toLowerCase()}</div>
                <div class="stat-value">${count}/${total}</div>
                <div class="stat-bar-track">
                  <div class="stat-bar-fill" style="width:${pct}%"></div>
                </div>
              </div>`;
        }).join('');
    }

    /** Renders a savings section, or hides it if no entry exceeds the threshold. */
    static _renderSavings(groupId, containerId, entries, totalGiB) {
        const group = document.getElementById(groupId);
        const visible = entries.filter(e => totalGiB > 0 && (e.maxGiB / totalGiB) >= this._SAVINGS_THRESHOLD);

        if (!visible.length) {
            group.hidden = true;
            return;
        }

        group.hidden = false;
        document.getElementById(containerId).innerHTML = visible.map(({label, minGiB, maxGiB}) => {
            const pct = totalGiB > 0 ? (maxGiB / totalGiB * 100).toFixed(1) : 0;
            return `
              <div class="stat-row">
                <div class="stat-label">${label}</div>
                <div class="stat-value">${this._formatSizeRange(minGiB, maxGiB)}</div>
                <div class="stat-bar-track">
                  <div class="stat-bar-fill" style="width:${pct}%"></div>
                </div>
              </div>`;
        }).join('');
    }

    // --- private: formatters ---

    static _formatSizeRange(minGiB, maxGiB) {
        if (minGiB >= 1024 || maxGiB >= 1024) {
            return `${(minGiB / 1024).toFixed(1)}&ndash;${(maxGiB / 1024).toFixed(1)} TiB`;
        }
        return `${Math.round(minGiB / 10) * 10}&ndash;${Math.round(maxGiB / 10) * 10} GiB`;
    }
}
