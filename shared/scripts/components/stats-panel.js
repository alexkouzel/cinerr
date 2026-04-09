/**
 * Renders the stats tab: summary counters, stat groups with bar charts,
 * and estimated savings sections.
 */
export default class StatsPanel {

    // --- public ---

    /** Renders the full stats view from a view model produced by Stats.buildViewModel(). */
    static renderViewModel(vm) {
        this._renderSummary(vm.summary);

        for (const [id, key] of this._GROUPS) {
            this._renderGroup(id, vm.groups[key].counts, vm.groups[key].total);
        }

        for (const [groupId, containerId, key] of this._SAVINGS) {
            this._renderSavings(groupId, containerId, vm.savings[key].entries, vm.savings[key].totalGiB);
        }

        this._showLoaded();
    }

    /** Sets the "last scan" timestamp in the summary bar. */
    static setLastScan(timestamp) {
        document.getElementById('s-lastscan').textContent = timestamp.trim();
    }

    /** Shows the scanning state while an update job is running, but only if no stats are currently displayed. */
    static showScanning() {
        this._statsWereVisible = !document.getElementById('stats').hidden;
        if (this._statsWereVisible) return;
        document.getElementById('stats-placeholder').hidden = false;
        document.getElementById('stats-loading').hidden = true;
        document.getElementById('stats-error').hidden = true;
        document.getElementById('stats-scanning').hidden = false;
    }

    /** Reverts to the state before showScanning() was called. */
    static revertScanning() {
        document.getElementById('stats-scanning').hidden = true;
        if (this._statsWereVisible) {
            document.getElementById('stats-placeholder').hidden = true;
            document.getElementById('stats').hidden = false;
        } else {
            this.showError();
        }
    }

    /** Shows the error state when CSV data can't be loaded. */
    static showError() {
        document.getElementById('stats').hidden = true;
        document.getElementById('stats-placeholder').hidden = false;
        document.getElementById('stats-loading').hidden = true;
        document.getElementById('stats-error').hidden = false;
        document.getElementById('stats-scanning').hidden = true;
    }

    // --- private: config ---

    static _statsWereVisible = false;

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

    static _showLoaded() {
        document.getElementById('stats-placeholder').hidden = true;
        document.getElementById('stats').hidden = false;
    }

    // --- private: formatters ---

    static _formatSizeRange(minGiB, maxGiB) {
        if (minGiB >= 1024 || maxGiB >= 1024) {
            return `${(minGiB / 1024).toFixed(1)}&ndash;${(maxGiB / 1024).toFixed(1)} TiB`;
        }
        return `${Math.round(minGiB / 10) * 10}&ndash;${Math.round(maxGiB / 10) * 10} GiB`;
    }
}
