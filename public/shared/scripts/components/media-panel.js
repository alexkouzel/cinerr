/**
 * @typedef {import('../services/media.js').MediaFile} MediaFile
 */

import Table from './table.js';
import SearchFilter from './search-filter.js';

export default class MediaPanel {

    // --- public ---

    static init() {
        this._table = new Table(
            document.getElementById('media-table'),
            this._COLUMNS,
        );
    }

    /** @param {MediaFile[]} files */
    static setFiles(files) {
        this._files = files;
        this._filters = new Map();
        this._buildFilterBar(files);
        this._applyAndRender();
    }

    // --- private: filter groups ---

    static _FILTERS = [
        {
            id: 'search',
            label: 'SEARCH',
            type: 'search',
            placeholder: 'filter by name or path...',
            match: (row, query) => {
                const q = query.toLowerCase();
                return row.name?.toLowerCase().includes(q) || row.path?.toLowerCase().includes(q);
            },
        },
        {id: 'resolution', label: 'RESOLUTION', type: 'chips', key: '_resolution', order: ['4K', '1080p', '720p', '480p', 'SD', '-']},
        {id: 'format',     label: 'FORMAT',     type: 'chips', key: 'format'},
        {id: 'hdr',        label: 'HDR',        type: 'chips', key: '_hdr'},
    ];

    // --- private: columns ---

    static _COLUMNS = [
        {
            key: 'path',
            label: 'PATH',
            className: 'col-path',
            title: (val) => val,
        },
        {
            key: 'size',
            label: 'SIZE',
            className: 'col-size',
            sort: (a, b) => MediaPanel._parseSize(a) - MediaPanel._parseSize(b),
        },
        {
            key: 'duration',
            label: 'DURATION',
            className: 'col-duration',
            sort: (a, b) => MediaPanel._parseDuration(a) - MediaPanel._parseDuration(b),
        },
        {
            key: 'format',
            label: 'FORMAT',
        },
        {
            key: '_resolution',
            label: 'RESOLUTION',
            render: (val) => val,
        },
        {
            key: '_hdr',
            label: 'HDR',
            render: (val) => val,
        },
        {
            key: 'audio_langs',
            label: 'AUDIO',
        },
    ];

    // --- private: state ---

    /** @type {MediaFile[]} */
    static _files = [];
    /** @type {Map<string, (row: object) => boolean>} */
    static _filters = new Map();
    /** @type {Table} */
    static _table = null;

    // --- private: filter engine ---

    /**
     * Register or remove a filter predicate by ID.
     * Null predicate removes the filter (shows all rows for that group).
     * @param {string} id
     * @param {((row: object) => boolean) | null} predicate
     */
    static _setFilter(id, predicate) {
        if (predicate) {
            this._filters.set(id, predicate);
        } else {
            this._filters.delete(id);
        }
        this._applyAndRender();
    }

    static _applyFilters(rows) {
        let result = rows;
        for (const pred of this._filters.values()) {
            result = result.filter(pred);
        }
        return result;
    }

    static _applyAndRender() {
        const enriched = this._files.map(f => ({
            ...f,
            _resolution: this._classifyResolution(f.resolution),
            _hdr: f.hdr === '-' || !f.hdr ? 'SDR' : f.hdr,
        }));
        const filtered = this._applyFilters(enriched);

        const hasData = this._files.length > 0;
        document.getElementById('media-placeholder').hidden = hasData;
        document.getElementById('media-table').hidden = !hasData;

        this._table.setRows(filtered);
    }

    // --- private: filter bar ---

    static _buildFilterBar(files) {
        const container = document.getElementById('media-filters');
        container.innerHTML = '';

        const enriched = files.map(f => ({
            ...f,
            _resolution: this._classifyResolution(f.resolution),
            _hdr: f.hdr === '-' || !f.hdr ? 'SDR' : f.hdr,
        }));

        for (const group of this._FILTERS) {
            const groupEl = document.createElement('div');
            groupEl.className = 'filter-group';

            const labelEl = document.createElement('div');
            labelEl.className = 'filter-group-label';
            labelEl.textContent = group.label;
            groupEl.appendChild(labelEl);

            if (group.type === 'search') {
                new SearchFilter(groupEl, {
                    placeholder: group.placeholder,
                    onChange: (query) => {
                        const q = query.trim();
                        const pred = q
                            ? (row) => group.match
                                ? group.match(row, q)
                                : String(row[group.key] ?? '').toLowerCase().includes(q.toLowerCase())
                            : null;
                        this._setFilter(group.id, pred);
                    },
                });
            } else {
                // chips
                const values = this._uniqueValues(enriched, group.key, group.order);
                if (values.length < 2) continue;

                const chipsEl = document.createElement('div');
                chipsEl.className = 'filter-chips';

                const active = new Set();

                for (const val of values) {
                    const btn = document.createElement('button');
                    btn.className = 'filter-chip';
                    btn.textContent = val;
                    btn.addEventListener('click', () => {
                        if (active.has(val)) {
                            active.delete(val);
                            btn.classList.remove('active');
                        } else {
                            active.add(val);
                            btn.classList.add('active');
                        }
                        const pred = active.size
                            ? (row) => active.has(row[group.key])
                            : null;
                        this._setFilter(group.id, pred);
                    });
                    chipsEl.appendChild(btn);
                }

                groupEl.appendChild(chipsEl);
            }

            container.appendChild(groupEl);
        }
    }

    static _uniqueValues(rows, key, order = []) {
        const seen = new Set(rows.map(r => r[key]).filter(Boolean));
        const result = order.filter(v => seen.has(v));
        for (const v of [...seen].sort()) {
            if (!result.includes(v)) result.push(v);
        }
        return result;
    }

    // --- private: field parsers (mirrors stats.js) ---

    static _classifyResolution(value) {
        if (!value || value === '-') return '-';
        const height = parseInt((value.split('x')[1] || '0'), 10);
        if (height >= 2160) return '4K';
        if (height >= 1080) return '1080p';
        if (height >= 720)  return '720p';
        if (height >= 480)  return '480p';
        return 'SD';
    }

    static _parseSize(value) {
        const match = (value || '').match(/([\d.]+)\s*GiB/);
        return match ? parseFloat(match[1]) : 0;
    }

    static _parseDuration(value) {
        if (!value || value === '-') return 0;
        const [h, m, s] = value.split(':').map(Number);
        if ([h, m, s].some(isNaN)) return 0;
        return h * 3600 + m * 60 + s;
    }
}
