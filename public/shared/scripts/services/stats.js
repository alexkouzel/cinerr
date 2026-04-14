/**
 * @typedef {import('./media.js').MediaFile} MediaFile
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
 * }} StatsData
 */

import {
    parseAudioTracks, parseSubtitleTracks,
    parseDuration, parseSize, bitrateToGiB,
    topLevelPath, classifyResolution,
    formatDuration, formatSize,
} from '../media-utils.js';

export default class Stats {

    // --- public ---

    /**
     * @param {MediaFile[]} files
     * @return {StatsData}
     */
    static build(files) {
        const fileCount = files.length;

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

        for (const file of files) {
            totalSeconds += parseDuration(file.duration);
            totalGiB += parseSize(file.size);

            this._increment(path, topLevelPath(file.path));
            this._increment(resolution, classifyResolution(file.resolution));
            this._increment(format, file.format && file.format !== '-' ? file.format : '-');
            this._increment(hdr, file.hdr && file.hdr !== '-' ? file.hdr : 'SDR');

            for (const audio of parseAudioTracks(file.audios)) {
                audioTrackCount++;
                this._increment(audioFormat, audio.format);
                this._increment(audioLang, audio.lang);
            }

            for (const sub of parseSubtitleTracks(file.subtitles)) {
                subtitleTrackCount++;
                this._increment(subtitleLang, sub.lang);
            }
        }

        return {
            summary: {
                totalFiles: fileCount,
                totalSize: formatSize(totalGiB),
                totalDuration: formatDuration(totalSeconds),
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
                video: this._estimateVideoSavings(files),
                audio: this._estimateAudioSavings(files),
            },
        };
    }

    // --- private: savings estimation ---

    static _estimateVideoSavings(files) {
        const sizeByCodec = {};
        for (const file of files) {
            const codec = file.format || '-';
            const gib = bitrateToGiB(file.bitrate, parseDuration(file.duration));
            if (gib > 0) {
                sizeByCodec[codec] = (sizeByCodec[codec] || 0) + gib;
            }
        }

        const avc = sizeByCodec['AVC'] || 0;
        const hevc = sizeByCodec['HEVC'] || 0;
        const totalGiB = Object.values(sizeByCodec).reduce((sum, v) => sum + v, 0);

        const entries = [];
        if (avc > 0)  entries.push({label: 'avc &rarr; hevc', minGiB: avc * 0.40,  maxGiB: avc * 0.50});
        if (avc > 0)  entries.push({label: 'avc &rarr; av1',  minGiB: avc * 0.50,  maxGiB: avc * 0.60});
        if (hevc > 0) entries.push({label: 'hevc &rarr; av1', minGiB: hevc * 0.25, maxGiB: hevc * 0.35});

        return {entries, totalGiB};
    }

    static _AUDIO_CONVERSIONS = [
        {test: f => /TrueHD|MLP FBA/i.test(f),          label: 'truehd &rarr; opus',    minRatio: 0.70, maxRatio: 0.85},
        {test: f => /DTS/i.test(f) && /XLL/i.test(f),   label: 'dts-hd ma &rarr; opus', minRatio: 0.70, maxRatio: 0.85},
        {test: f => /FLAC/i.test(f),                    label: 'flac &rarr; opus',      minRatio: 0.70, maxRatio: 0.85},
        {test: f => /DTS/i.test(f) && !/XLL/i.test(f),  label: 'dts &rarr; opus',       minRatio: 0.45, maxRatio: 0.55},
        {test: f => /^E-AC-3/i.test(f),                 label: 'e-ac-3 &rarr; opus',    minRatio: 0.20, maxRatio: 0.35},
        {test: f => /^AC-3$/i.test(f),                  label: 'ac-3 &rarr; opus',      minRatio: 0.25, maxRatio: 0.40},
    ];

    static _estimateAudioSavings(files) {
        const sizeByConversion = {};

        for (const file of files) {
            const duration = parseDuration(file.duration);
            for (const audio of parseAudioTracks(file.audios)) {
                const gib = bitrateToGiB(audio.bitrate, duration);
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

    static _increment(counts, key) {
        counts[key] = (counts[key] || 0) + 1;
    }
}
