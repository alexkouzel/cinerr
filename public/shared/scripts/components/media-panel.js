/**
 * @typedef {import('../services/media.js').MediaFile} MediaFile
 */

import Table from './table.js';
import { classifyResolution, parseSize, parseDuration } from '../common/media-utils.js';

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
            _resolution: classifyResolution(f.resolution),
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
        {key: 'size',        label: 'SIZE',        className: 'col-size', sort: (a, b) => parseSize(a) - parseSize(b)},
        {key: 'duration',    label: 'DURATION',    className: 'col-duration', sort: (a, b) => parseDuration(a) - parseDuration(b)},
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

}
