import ActionBar from './shared/scripts/components/action-bar.js';
import StatsPanel from './shared/scripts/components/stats-panel.js';
import MediaPanel from './shared/scripts/components/media-panel.js';
import Tabs from './shared/scripts/components/tabs.js';
import JobsPanel from './shared/scripts/components/jobs-panel.js';
import Api from './shared/scripts/services/api.js';
import Media from './shared/scripts/services/media.js';
import Stats from './shared/scripts/services/stats.js';
import Jobs from './shared/scripts/services/jobs.js';
import Notify from './shared/scripts/services/notify.js';
import Toast from './shared/scripts/components/toast.js';

async function loadStats() {
    console.log('[index] loading stats');
    try {
        const [mediaCsv, lastScan] = await Promise.all([
            Api.getMediaCsv(),
            Api.getLastScan().catch(() => 'unavailable'),
        ]);
        console.log('[index] stats loaded');
        Media.load(mediaCsv, lastScan);
        const stats = Stats.build(Media.getFiles());
        if (stats.summary.totalFiles > 0) {
            StatsPanel.setLastScan(Media.getLastScan());
            StatsPanel.setStats(stats);
            MediaPanel.setFiles(Media.getFiles());
            return;
        }
    } catch (err) {
        console.error('[index] failed to load stats:', err);
    }
    StatsPanel.setStats(null);
    MediaPanel.setFiles([]);
}


async function bootstrap() {
    const config = await Api.getConfig().catch(() => ({}));
    ActionBar.DEBUG = config.debug ?? false;

    Notify.init((message, isError) => Toast.show(message, isError));

    MediaPanel.init();

    Tabs.bind();
    Tabs.setActive('stats');

    Jobs.init({startJob: (type, args) => Api.startJob(type, args)});

    Jobs.register('scan-media', {
        onStart:   () => { ActionBar.setLoading('scan-media-btn', true); StatsPanel.setScanning(true); },
        onDone:    () => { ActionBar.setLoading('scan-media-btn', false); },
        onSuccess: async () => { Notify.scanComplete(); await loadStats(); StatsPanel.setScanning(false); },
        onAbort:   () => { Notify.scanAborted(); StatsPanel.setScanning(false); },
        onFailure: () => { Notify.scanFailed(); StatsPanel.setScanning(false); },
    });

    ActionBar.bindHandlers({
        onScan:           () => Jobs.start('scan-media'),
        onDebugFail:      () => Api.startJob('debug-fail').catch(console.error),
        onDebugParallel:  () => Api.startJob('debug-parallel').catch(console.error),
        onDebugExclusive: () => Api.startJob('debug-exclusive').catch(console.error),
        onDebugDeleteCsv: () => Api.deleteMediaCsv().then(() => loadStats()).catch(console.error),
    });

    JobsPanel.startPolling({
        openStream: (onMessage, onError) => Api.openJobsStream(onMessage, onError),
        onPause:    (jobId) => Api.pauseJob(jobId),
        onResume:   (jobId) => Api.resumeJob(jobId),
        onAbort:    (jobId) => Api.abortJob(jobId),
        onDismiss:  (jobId) => Api.dismissJob(jobId),
    });
    JobsPanel.subscribe((event) => Jobs.handleEvent(event));
    JobsPanel.subscribe(({counts}) => Tabs.setJobBadges(counts));
    JobsPanel.subscribe(({type}) => {
        if (type !== 'bootstrap') return;
        ActionBar.show();
        void loadStats();
    });
}

window.addEventListener('beforeunload', () => {
    JobsPanel.stopPolling();
});

bootstrap();
