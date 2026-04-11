import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Stats from '../../../public/shared/scripts/services/stats.js';

describe('Stats._parseCSV', () => {
    test('parses RFC 4180 quoting: quoted commas, escaped quotes, CRLF endings', () => {
        const text = 'a,b,c\r\n"hello, world","he said ""hi""",x\r\n';
        assert.deepEqual(Stats._parseCSV(text), [
            { a: 'hello, world', b: 'he said "hi"', c: 'x' },
        ]);
    });

    test('handles structural edges: short final row, trailing blank line, empty input', () => {
        // No trailing newline forces the final-flush branch.
        // Final row has fewer fields than headers; missing slot falls back to ''.
        assert.deepEqual(Stats._parseCSV('a,b,c\n1,2,3\n4,5'), [
            { a: '1', b: '2', c: '3' },
            { a: '4', b: '5', c: '' },
        ]);
        // Trailing blank line is skipped.
        assert.deepEqual(Stats._parseCSV('a,b\n1,2\n\n'), [{ a: '1', b: '2' }]);
        // Empty input yields no rows.
        assert.deepEqual(Stats._parseCSV(''), []);
    });
});

describe('Stats._parseAudioTracks', () => {
    test('parses tracks with and without flags, normalizes missing values', () => {
        const tracks = Stats._parseAudioTracks(
            '[en, AC-3, 640 kb/s, 6ch, (default|forced)]; [-, DTS, 1509 kb/s, 6ch]'
        );
        assert.deepEqual(tracks, [
            {
                lang: 'en',
                format: 'AC-3',
                bitrate: '640 kb/s',
                channels: '6ch',
                flags: ['default', 'forced'],
            },
            {
                lang: '-',
                format: 'DTS',
                bitrate: '1509 kb/s',
                channels: '6ch',
                flags: [],
            },
        ]);
        assert.deepEqual(Stats._parseAudioTracks(''), []);
    });
});

describe('Stats._parseSubtitleTracks', () => {
    test('parses tracks with and without flags', () => {
        const tracks = Stats._parseSubtitleTracks(
            '[en, UTF-8, (default|forced)]; [fr, UTF-8]'
        );
        assert.deepEqual(tracks, [
            { lang: 'en', format: 'UTF-8', flags: ['default', 'forced'] },
            { lang: 'fr', format: 'UTF-8', flags: [] },
        ]);
        assert.deepEqual(Stats._parseSubtitleTracks(''), []);
    });
});

describe('Stats._classifyResolution', () => {
    test('maps heights to buckets with dash fallback', () => {
        assert.equal(Stats._classifyResolution('3840x2160'), '4K');
        assert.equal(Stats._classifyResolution('1920x1080'), '1080p');
        assert.equal(Stats._classifyResolution('1280x720'), '720p');
        assert.equal(Stats._classifyResolution('854x480'), '480p');
        assert.equal(Stats._classifyResolution('320x240'), 'SD');
        assert.equal(Stats._classifyResolution('-'), '-');
        assert.equal(Stats._classifyResolution(''), '-');
    });
});

describe('Stats formatters', () => {
    test('_formatSize returns GiB under 1024, TiB at or above, em dash for zero', () => {
        assert.equal(Stats._formatSize(500), '500 GiB');
        assert.equal(Stats._formatSize(2048), '2.0 TiB');
        assert.equal(Stats._formatSize(0), '—');
    });

    test('_formatDuration returns hours + minutes, em dash for zero', () => {
        assert.equal(Stats._formatDuration(3600 + 30 * 60), '1h 30m');
        assert.equal(Stats._formatDuration(0), '—');
    });
});

describe('Stats parsers', () => {
    test('_parseDuration parses HH:MM:SS and returns 0 for invalid input', () => {
        assert.equal(Stats._parseDuration('01:30:45'), 5445);
        assert.equal(Stats._parseDuration('-'), 0);
        assert.equal(Stats._parseDuration('bad'), 0);
    });

    test('_bitrateToGiB converts bitrate + duration, returns 0 on missing data', () => {
        // 1000 kb/s × 3600s ≈ 0.419 GiB
        const gib = Stats._bitrateToGiB('1000 kb/s', 3600);
        assert.ok(gib > 0.4 && gib < 0.45);
        assert.equal(Stats._bitrateToGiB('-', 3600), 0);
        assert.equal(Stats._bitrateToGiB('1000 kb/s', 0), 0);
    });
});

describe('Stats._estimateVideoSavings', () => {
    test('mixed AVC + HEVC library produces all three conversion entries', () => {
        const rows = [
            { format: 'AVC',  bitrate: '5000 kb/s', duration: '01:00:00' },
            { format: 'HEVC', bitrate: '3000 kb/s', duration: '01:00:00' },
        ];
        const { entries, totalGiB } = Stats._estimateVideoSavings(rows);
        const labels = entries.map(e => e.label);
        assert.equal(entries.length, 3);
        assert.ok(labels.some(l => l.includes('avc') && l.includes('hevc')));
        assert.ok(labels.some(l => l.includes('avc') && l.includes('av1')));
        assert.ok(labels.some(l => l.includes('hevc') && l.includes('av1')));
        assert.ok(totalGiB > 0);
    });
});

describe('Stats._estimateAudioSavings', () => {
    test('distinguishes similar codec names via regex anchors', () => {
        // Critical regex boundaries:
        // - /^AC-3$/ anchor prevents AC-3 from also matching E-AC-3.
        // - DTS check for XLL profile separates DTS-HD MA from plain DTS.
        // If either is weakened, two distinct conversions collapse into one.
        const rows = [
            { audios: '[en, AC-3, 448 kb/s, 6ch]',     duration: '01:00:00' },
            { audios: '[en, E-AC-3, 640 kb/s, 6ch]',   duration: '01:00:00' },
            { audios: '[en, DTS XLL, 1509 kb/s, 6ch]', duration: '01:00:00' },
            { audios: '[en, DTS, 1509 kb/s, 6ch]',     duration: '01:00:00' },
        ];
        const labels = Stats._estimateAudioSavings(rows).entries.map(e => e.label);
        assert.equal(labels.length, 4);
        assert.ok(labels.some(l => l.startsWith('ac-3 ')));
        assert.ok(labels.some(l => l.startsWith('e-ac-3 ')));
        assert.ok(labels.some(l => l.startsWith('dts-hd ma ')));
        assert.ok(labels.some(l => l === 'dts &rarr; opus'));
    });
});

describe('Stats.buildViewModel', () => {
    test('end-to-end: parses CSV, groups, summarizes, and estimates savings', () => {
        const csv = [
            'name,path,size,duration,format,profile,hdr,bitrate,framerate,resolution,audios,subtitles,audio_langs,subtitle_langs',
            'film.mkv,/movies/film.mkv,10 GiB,02:00:00,HEVC,-,HDR10,5000 kb/s,24,3840x2160,"[en, AC-3, 640 kb/s, 6ch]","[en, UTF-8, (default)]",en,en',
            'show.mkv,/shows/s01/show.mkv,5 GiB,00:45:00,AVC,-,-,3000 kb/s,24,1920x1080,"[ja, AAC, 128 kb/s, 2ch]",,ja,',
        ].join('\n') + '\n';

        const vm = Stats.buildViewModel(csv);

        assert.equal(vm.summary.totalFiles, 2);
        assert.equal(vm.summary.totalSize, '15 GiB');
        assert.equal(vm.summary.totalDuration, '2h 45m');

        assert.deepEqual(vm.groups.path.counts,       { '/movies': 1, '/shows': 1 });
        assert.deepEqual(vm.groups.resolution.counts, { '4K': 1, '1080p': 1 });
        assert.deepEqual(vm.groups.format.counts,     { HEVC: 1, AVC: 1 });
        assert.deepEqual(vm.groups.hdr.counts,        { HDR10: 1, SDR: 1 });
        assert.deepEqual(vm.groups.audioLangs.counts, { en: 1, ja: 1 });
        assert.deepEqual(vm.groups.subtitleLangs.counts, { en: 1 });
        assert.equal(vm.groups.audio.total, 2);

        assert.ok(vm.savings.video.totalGiB > 0);
    });
});
