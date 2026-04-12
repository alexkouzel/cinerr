import ActionBar from '../shared/scripts/components/action-bar.js';
import StatsPanel from '../shared/scripts/components/stats-panel.js';
import Tabs from '../shared/scripts/components/tabs.js';
import Stats from '../shared/scripts/services/stats.js';
import Toast from '../shared/scripts/components/toast.js';

async function loadStats() {
    const [csvText, lastScan] = await Promise.all([
        fetch('data/media.csv').then(r => r.text()),
        fetch('data/last-scan').then(r => r.text()),
    ]);
    StatsPanel.setLastScan(lastScan);
    StatsPanel.setViewModel(Stats.buildViewModel(csvText));
    ActionBar.show();
}

function bootstrap() {
    Tabs.bind();
    Tabs.setActive('stats');

    ActionBar.bindHandlers({
        onScan: () => Toast.show('media scanning is not available in demo', true),
    });

    void loadStats();
}

bootstrap();
