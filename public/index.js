import ActionBar from './shared/scripts/components/action-bar.js';
import StatsPanel from './shared/scripts/components/stats-panel.js';
import Tabs from './shared/scripts/components/tabs.js';
import JobsPanel from './shared/scripts/components/jobs-panel.js';
import Api from './shared/scripts/services/api.js';
import Stats from './shared/scripts/services/stats.js';
import Jobs from './shared/scripts/services/jobs.js';
import Notify from './shared/scripts/services/notify.js';
import Toast from './shared/scripts/components/toast.js';

async function loadStats() {
    console.log('[index] loading stats');
    try {
        const [csvText, lastScan] = await Promise.all([
            Api.getMediaCsv(),
            Api.getLastScan().catch(() => 'unavailable'),
        ]);
        console.log('[index] stats loaded');
        const vm = Stats.buildViewModel(csvText);
        if (vm.summary.totalFiles === 0) {
            StatsPanel.showError();
            ActionBar.setDisabled('browse-media-btn', true);
            return;
        }
        StatsPanel.setLastScan(lastScan);
        StatsPanel.renderViewModel(vm);
        ActionBar.setDisabled('browse-media-btn', false);
    } catch (err) {
        console.error('[index] failed to load stats:', err);
        StatsPanel.showError();
        ActionBar.setDisabled('browse-media-btn', true);
    }
}


async function bootstrap() {
    const config = await Api.getConfig().catch(() => ({}));
    ActionBar.DEBUG = config.debug ?? false;

    Notify.init((message, isError) => Toast.show(message, isError));

    Tabs.bind();
    Tabs.setActive('stats');

    Jobs.init({startJob: (type) => Api.startJob(type)});

    Jobs.register('scan-media', {
        onStart:   () => { ActionBar.setLoading('scan-media-btn', true); StatsPanel.showScanning(); },
        onDone:    () => { ActionBar.setLoading('scan-media-btn', false); },
        onSuccess: () => { Notify.scanComplete(); void loadStats(); },
        onAbort:   () => { Notify.scanAborted(); StatsPanel.revertScanning(); },
        onFailure: () => { Notify.scanFailed(); StatsPanel.revertScanning(); },
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
        if (type === 'bootstrap') {
            ActionBar.show();
            if (!Jobs.isActive('scan-media')) void loadStats();
        }
    });
}

window.addEventListener('beforeunload', () => {
    JobsPanel.stopPolling();
});

bootstrap();
