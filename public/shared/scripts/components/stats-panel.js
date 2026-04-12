export default class StatsPanel {

    // --- public ---

    static setStats(stats) {
        this._stats = stats;
        this._render();
    }

    static setScanning(scanning) {
        this._scanning = scanning;
        this._render();
    }

    static setLastScan(timestamp) {
        document.getElementById('s-lastscan').textContent = timestamp.trim();
    }

    // --- private ---

    static _stats = null;
    static _scanning = false;

    static _GROUPS = [
        ['g-path', 'path'],
        ['g-resolution', 'resolution'],
        ['g-format', 'format'],
        ['g-hdr', 'hdr'],
        ['g-audio', 'audio'],
        ['g-audio-langs', 'audioLangs'],
        ['g-subtitle-langs', 'subtitleLangs'],
    ];

    static _SAVINGS = [
        ['video-savings-group', 'g-video-savings', 'video'],
        ['audio-savings-group', 'g-audio-savings', 'audio'],
    ];

    /** Labels pushed to the end of sorted stat groups (e.g. unknown/missing values). */
    static _TAIL_LABELS = ['-'];

    /** Savings below this share of total are hidden. */
    static _SAVINGS_THRESHOLD = 0.10;

    static _render() {
        if (this._stats) {
            this._renderStats(this._stats);
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

    static _renderStats(stats) {
        this._renderSummary(stats.summary);

        for (const [id, key] of this._GROUPS) {
            this._renderGroup(id, stats.groups[key].counts, stats.groups[key].total);
        }

        for (const [groupId, containerId, key] of this._SAVINGS) {
            this._renderSavings(groupId, containerId, stats.savings[key].entries, stats.savings[key].totalGiB);
        }
    }

    static _renderSummary({totalFiles, totalSize, totalDuration}) {
        document.getElementById('s-total').textContent = totalFiles;
        document.getElementById('s-size').textContent = totalSize;
        document.getElementById('s-duration').textContent = totalDuration;
    }

    static _renderGroup(containerId, counts, total) {
        const container = document.getElementById(containerId);

        // Sort by count descending; push tail labels to the end.
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

    static _formatSizeRange(minGiB, maxGiB) {
        if (minGiB >= 1024 || maxGiB >= 1024) {
            return `${(minGiB / 1024).toFixed(1)}&ndash;${(maxGiB / 1024).toFixed(1)} TiB`;
        }
        return `${Math.round(minGiB / 10) * 10}&ndash;${Math.round(maxGiB / 10) * 10} GiB`;
    }
}
