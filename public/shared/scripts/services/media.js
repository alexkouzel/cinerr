/**
 * @typedef {{
 *     path: string,
 *     resolution: string,
 *     format: string,
 *     hdr: string,
 *     bitrate: string,
 *     duration: string,
 *     size: string,
 *     audios: string,
 *     subtitles: string,
 * }} MediaFile
 */

export default class Media {

    // --- public ---

    static load(mediaCsv, lastScan) {
        this._files = this._parseCSV(mediaCsv);
        this._lastScan = lastScan;
    }

    static getFiles() {
        return this._files;
    }

    static getLastScan() {
        return this._lastScan;
    }

    // --- private ---

    static _files = [];
    static _lastScan = '';
    
    static _parseCSV(text) {
        const headers = [];
        const rows = [];
        let field = '';
        let inQuotes = false;
        let line = [];

        function commitLine() {
            line.push(field.trim());
            field = '';

            if (line.every(f => f === '')) return;

            if (headers.length === 0) {
                headers.push(...line);
            } else {
                rows.push(Object.fromEntries(headers.map((h, i) => [h, line[i] ?? ''])));
            }
            line = [];
        }

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (ch === '"') {
                if (inQuotes && text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                line.push(field.trim());
                field = '';
            } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                commitLine();
            } else {
                field += ch;
            }
        }

        if (field || line.length) commitLine();
        return rows;
    }
}