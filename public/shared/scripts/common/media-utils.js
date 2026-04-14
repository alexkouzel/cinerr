// Pure utility functions for working with media CSV fields.
// No state, no DOM, no imports — safe to use from any service or component.

// Format: "[lang, format, bitrate, Nch, (flags)]; ..."
export function parseAudioTracks(field) {
    if (!field) return [];
    return field.split('; ').map(entry => {
        const inner = entry.slice(1, -1);
        const parts = inner.split(', ');
        const flags = parts[4] ? parts[4].slice(1, -1).split('|') : [];
        return {
            lang:     parts[0] && parts[0] !== '-' ? parts[0] : '-',
            format:   parts[1] || '-',
            bitrate:  parts[2] || '-',
            channels: parts[3] || '-',
            flags,
        };
    });
}

// Format: "[lang, format, (flags)]; ..."
export function parseSubtitleTracks(field) {
    if (!field) return [];
    return field.split('; ').map(entry => {
        const inner = entry.slice(1, -1);
        const parts = inner.split(', ');
        const flags = parts[2] ? parts[2].slice(1, -1).split('|') : [];
        return {
            lang:   parts[0] || '-',
            format: parts[1] || '-',
            flags,
        };
    });
}

export function parseDuration(value) {
    if (!value || value === '-') return 0;
    const [h, m, s] = value.split(':').map(Number);
    if ([h, m, s].some(isNaN)) return 0;
    return h * 3600 + m * 60 + s;
}

export function parseSize(value) {
    const match = (value || '').match(/([\d.]+)\s*GiB/);
    return match ? parseFloat(match[1]) : 0;
}

export function bitrateToGiB(bitrateStr, durationSeconds) {
    const match = (bitrateStr || '').match(/(\d+)\s*kb\/s/);
    if (!match || !durationSeconds) return 0;
    return parseInt(match[1], 10) * 1000 * durationSeconds / 8 / (1024 ** 3);
}

export function topLevelPath(value) {
    if (!value || value === '/') return '/';
    const second = value.indexOf('/', 1);
    return second === -1 ? value : value.slice(0, second);
}

export function classifyResolution(value) {
    if (!value || value === '-') return '-';
    const height = parseInt((value.split('x')[1] || '0'), 10);
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720)  return '720p';
    if (height >= 480)  return '480p';
    return 'SD';
}

export function formatDuration(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds)) return '—';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return `${h}h ${m}m`;
}

export function formatSize(gib) {
    if (!gib || isNaN(gib)) return '—';
    return gib >= 1024
        ? `${(gib / 1024).toFixed(1)} TiB`
        : `${Math.round(gib)} GiB`;
}
