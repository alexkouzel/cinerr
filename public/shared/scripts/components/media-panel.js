/**
 * @typedef {import('../services/media.js').MediaFile} MediaFile
 */

import Table from './table.js';

export default class MediaPanel {

    // --- public ---

    static init() {
        this._table = new Table(
            document.getElementById('media-table'),
            this._COLUMNS,
            {filters: this._FILTERS},
        );
    }

    /** @param {MediaFile[]} files */
    static setFiles(files) {
        this._files = files;
        const hasData = files.length > 0;
        document.getElementById('media-placeholder').hidden = hasData;
        document.getElementById('media-table').hidden = !hasData;
        this._table.setRows(files.map(f => ({
            ...f,
            _resolution: this._classifyResolution(f.resolution),
            _hdr: f.hdr === '-' || !f.hdr ? 'SDR' : f.hdr,
        })));
    }

    // --- private: filter specs ---

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

    // --- private: column specs ---

    static _COLUMNS = [
        {key: 'path',        label: 'PATH',       className: 'col-path', title: (val) => val},
        {key: 'size',        label: 'SIZE',        className: 'col-size', sort: (a, b) => MediaPanel._parseSize(a) - MediaPanel._parseSize(b)},
        {key: 'duration',    label: 'DURATION',    className: 'col-duration', sort: (a, b) => MediaPanel._parseDuration(a) - MediaPanel._parseDuration(b)},
        {key: 'format',      label: 'FORMAT'},
        {key: '_resolution', label: 'RESOLUTION'},
        {key: '_hdr',        label: 'HDR'},
        {key: 'audio_langs', label: 'AUDIO'},
    ];

    // --- private: state ---

    /** @type {MediaFile[]} */
    static _files = [];
    /** @type {Table} */
    static _table = null;

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
