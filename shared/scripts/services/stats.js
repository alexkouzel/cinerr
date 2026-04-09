/**
 * Parses media.csv and builds a view model for the stats panel.
 *
 * CSV columns: name, path, size, duration, format, profile, hdr, bitrate,
 *              framerate, resolution, audios, subtitles, audio_langs, subtitle_langs
 */

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
 * }} MediaRow
 *
 * @typedef {{
 *      summary: {
 *          totalFiles: number,
 *          totalSize: string,
 *          totalDuration: string,
 *      },
 *      groups: {
 *          path: {counts: Object<string, number>, total: number},
 *          resolution: {counts: Object<string, number>, total: number},
 *          format: {counts: Object<string, number>, total: number},
 *          hdr: {counts: Object<string, number>, total: number},
 *          audio: {counts: Object<string, number>, total: number},
 *          audioLangs: {counts: Object<string, number>, total: number},
 *          subtitleLangs: {counts: Object<string, number>, total: number},
 *      },
 *      savings: {
 *          video: {entries: Array<{label: string, minGiB: number, maxGiB: number}>, totalGiB: number},
 *          audio: {entries: Array<{label: string, minGiB: number, maxGiB: number}>, totalGiB: number},
 *      }
 * }} StatsViewModel
 */

export default class Stats {

    // --- public ---

    /**
     * Parses CSV text and returns a stats view model ready for rendering.
     * @param {string} csvText
     * @return {StatsViewModel}
     */
    static buildViewModel(csvText) {
        const rows = this._parseCSV(csvText);
        const fileCount = rows.length;

        let totalSeconds = 0;
        let totalGiB = 0;
        let audioTrackCount = 0;
        let subtitleTrackCount = 0;

        const path = {};
        const resolution = {};
        const format = {};
        const hdr = {};
        const audioFormat = {};
        const audioLang = {};
        const subtitleLang = {};

        for (const row of rows) {
            totalSeconds += this._parseDuration(row.duration);
            totalGiB += this._parseSize(row.size);

            this._increment(path, this._topLevelPath(row.path));
            this._increment(resolution, this._classifyResolution(row.resolution));
            this._increment(format, row.format && row.format !== '-' ? row.format : '-');
            this._increment(hdr, row.hdr && row.hdr !== '-' ? row.hdr : 'SDR');

            for (const audio of this._parseAudioTracks(row.audios)) {
                audioTrackCount++;
                this._increment(audioFormat, audio.format);
                this._increment(audioLang, audio.lang);
            }

            for (const sub of this._parseSubtitleTracks(row.subtitles)) {
                subtitleTrackCount++;
                this._increment(subtitleLang, sub.lang);
            }
        }

        return {
            summary: {
                totalFiles: fileCount,
                totalSize: this._formatSize(totalGiB),
                totalDuration: this._formatDuration(totalSeconds),
            },
            groups: {
                path:           {counts: path,           total: fileCount},
                resolution:     {counts: resolution,    total: fileCount},
                format:         {counts: format,        total: fileCount},
                hdr:            {counts: hdr,           total: fileCount},
                audio:          {counts: audioFormat,   total: audioTrackCount},
                audioLangs:     {counts: audioLang,     total: audioTrackCount},
                subtitleLangs:  {counts: subtitleLang,  total: subtitleTrackCount},
            },
            savings: {
                video: this._estimateVideoSavings(rows),
                audio: this._estimateAudioSavings(rows),
            },
        };
    }

    // --- private: CSV parsing ---

    /**
     * Parses RFC 4180 CSV text into an array of {header: value} objects.
     * @param {string} text
     * @return {MediaRow[]}
     */
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
                    field += '"'; // escaped quote
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

    // --- private: field parsers ---

    /**
     * Parses the "audios" field.
     * Format: "[lang, format, bitrate, Nch]; ..."
     */
    static _parseAudioTracks(field) {
        if (!field) return [];
        return field.split('; ').map(entry => {
            const inner = entry.slice(1, -1); // strip outer brackets
            const parts = inner.split(', ');
            const flags = parts[4] ? parts[4].slice(1, -1).split('|') : [];
            return {
                lang: parts[0] && parts[0] !== '-' ? parts[0] : '-',
                format: parts[1] || '-',
                bitrate: parts[2] || '-',
                channels: parts[3] || '-',
                flags,
            };
        });
    }

    /**
     * Parses the "subtitles" field.
     * Format: "[lang, format, flag1|flag2]; ..."
     */
    static _parseSubtitleTracks(field) {
        if (!field) return [];
        return field.split('; ').map(entry => {
            const inner = entry.slice(1, -1); // strip outer brackets
            const parts = inner.split(', ');
            const flags = parts[2] ? parts[2].slice(1, -1).split('|') : [];
            return {
                lang: parts[0] || '-',
                format: parts[1] || '-',
                flags,
            };
        });
    }

    /** Parses "HH:MM:SS" into total seconds. */
    static _parseDuration(value) {
        if (!value || value === '-') return 0;
        const [h, m, s] = value.split(':').map(Number);
        if ([h, m, s].some(isNaN)) return 0;
        return h * 3600 + m * 60 + s;
    }

    /** Parses "12.3 GiB" into a numeric GiB value. */
    static _parseSize(value) {
        const match = (value || '').match(/([\d.]+)\s*GiB/);
        return match ? parseFloat(match[1]) : 0;
    }

    /** Extracts a bitrate in kb/s and converts to GiB given a duration. */
    static _bitrateToGiB(bitrateStr, durationSeconds) {
        const match = (bitrateStr || '').match(/(\d+)\s*kb\/s/);
        if (!match || !durationSeconds) return 0;
        return parseInt(match[1], 10) * 1000 * durationSeconds / 8 / (1024 ** 3);
    }

    // --- private: classifiers ---

    /** Extracts the top-level directory from a path (e.g. "/movies/action" → "/movies"). */
    static _topLevelPath(value) {
        if (!value || value === '/') return '/';
        const second = value.indexOf('/', 1);
        return second === -1 ? value : value.slice(0, second);
    }

    /** Maps a "WIDTHxHEIGHT" resolution string to a label (4K, 1080p, etc.). */
    static _classifyResolution(value) {
        if (!value || value === '-') return '-';
        const height = parseInt((value.split('x')[1] || '0'), 10);
        if (height >= 2160) return '4K';
        if (height >= 1080) return '1080p';
        if (height >= 720)  return '720p';
        if (height >= 480)  return '480p';
        return 'SD';
    }

    // --- private: formatters ---

    static _formatDuration(totalSeconds) {
        if (!totalSeconds || isNaN(totalSeconds)) return '—';
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        return `${h}h ${m}m`;
    }

    static _formatSize(gib) {
        if (!gib || isNaN(gib)) return '—';
        return gib >= 1024
            ? `${(gib / 1024).toFixed(1)} TiB`
            : `${Math.round(gib)} GiB`;
    }

    // --- private: savings estimation ---

    /**
     * Estimates video storage savings from transcoding AVC/HEVC to more
     * efficient codecs. Ratios are approximate industry averages.
     */
    static _estimateVideoSavings(rows) {
        const sizeByCodec = {};
        for (const row of rows) {
            const codec = row.format || '-';
            const gib = this._bitrateToGiB(row.bitrate, this._parseDuration(row.duration));
            if (gib > 0) {
                sizeByCodec[codec] = (sizeByCodec[codec] || 0) + gib;
            }
        }

        const avc = sizeByCodec['AVC'] || 0;
        const hevc = sizeByCodec['HEVC'] || 0;
        const totalGiB = Object.values(sizeByCodec).reduce((sum, v) => sum + v, 0);

        const entries = [];
        //                                          savings ratio (min – max)
        if (avc > 0)  entries.push({label: 'avc &rarr; hevc', minGiB: avc * 0.40,  maxGiB: avc * 0.50});
        if (avc > 0)  entries.push({label: 'avc &rarr; av1',  minGiB: avc * 0.50,  maxGiB: avc * 0.60});
        if (hevc > 0) entries.push({label: 'hevc &rarr; av1', minGiB: hevc * 0.25, maxGiB: hevc * 0.35});

        return {entries, totalGiB};
    }

    /**
     * Codec-to-Opus savings estimates.
     * Each entry: test function, display label, savings ratio range.
     */
    static _AUDIO_CONVERSIONS = [
        {test: f => /TrueHD|MLP FBA/i.test(f),          label: 'truehd &rarr; opus',    minRatio: 0.70, maxRatio: 0.85},
        {test: f => /DTS/i.test(f) && /XLL/i.test(f),   label: 'dts-hd ma &rarr; opus', minRatio: 0.70, maxRatio: 0.85},
        {test: f => /FLAC/i.test(f),                    label: 'flac &rarr; opus',      minRatio: 0.70, maxRatio: 0.85},
        {test: f => /DTS/i.test(f) && !/XLL/i.test(f),  label: 'dts &rarr; opus',       minRatio: 0.45, maxRatio: 0.55},
        {test: f => /^E-AC-3/i.test(f),                 label: 'e-ac-3 &rarr; opus',    minRatio: 0.20, maxRatio: 0.35},
        {test: f => /^AC-3$/i.test(f),                  label: 'ac-3 &rarr; opus',      minRatio: 0.25, maxRatio: 0.40},
    ];

    /** Estimates audio storage savings from transcoding various codecs to Opus. */
    static _estimateAudioSavings(rows) {
        const sizeByConversion = {};

        for (const row of rows) {
            const duration = this._parseDuration(row.duration);
            for (const audio of this._parseAudioTracks(row.audios)) {
                const gib = this._bitrateToGiB(audio.bitrate, duration);
                if (!gib) continue;

                const conv = this._AUDIO_CONVERSIONS.find(c => c.test(audio.format || ''));
                if (!conv) continue;

                sizeByConversion[conv.label] = (sizeByConversion[conv.label] || 0) + gib;
            }
        }

        const totalGiB = Object.values(sizeByConversion).reduce((sum, v) => sum + v, 0);
        const entries = this._AUDIO_CONVERSIONS
            .filter(c => sizeByConversion[c.label])
            .map(c => ({
                label: c.label,
                minGiB: sizeByConversion[c.label] * c.minRatio,
                maxGiB: sizeByConversion[c.label] * c.maxRatio,
            }));

        return {entries, totalGiB};
    }

    // --- private: utilities ---

    /** Increments a counter in a {key: count} object. */
    static _increment(counts, key) {
        counts[key] = (counts[key] || 0) + 1;
    }
}
