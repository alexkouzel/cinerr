import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Jobs from '../../../public/shared/scripts/services/jobs.js';

// Jobs is a static singleton — reset its internal state between tests.
function resetJobs() {
    Jobs._registry = new Map();
    Jobs._running = new Map();
    Jobs._pendingTerminals = new Map();
    Jobs._startJob = () => Promise.reject(new Error('Jobs not initialised'));
}

// Flush pending microtasks + one macrotask so queued .then() callbacks run.
function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('Jobs lifecycle', () => {
    beforeEach(() => {
        resetJobs();
    });

    test('start fires onStart synchronously and is a no-op for unregistered types', () => {
        const calls = [];
        let serverCalls = 0;
        Jobs.init({
            startJob: () => {
                serverCalls++;
                return Promise.resolve({ job: { job_id: 'j1' } });
            },
        });
        Jobs.register('scan', { onStart: () => calls.push('onStart') });

        Jobs.start('unknown'); // no handler — must not hit the server
        Jobs.start('scan');

        assert.deepEqual(calls, ['onStart']);
        assert.equal(serverCalls, 1);
    });

    test('terminal snapshot dispatches to the matching callback', async () => {
        for (const { status, expected } of [
            { status: 'completed', expected: ['onStart', 'onDone', 'onSuccess'] },
            { status: 'aborted',   expected: ['onStart', 'onDone', 'onAbort']   },
            { status: 'failed',    expected: ['onStart', 'onDone', 'onFailure'] },
        ]) {
            resetJobs();
            const calls = [];
            Jobs.init({ startJob: () => Promise.resolve({ job: { job_id: 'j1' } }) });
            Jobs.register('scan', {
                onStart:   () => calls.push('onStart'),
                onDone:    () => calls.push('onDone'),
                onSuccess: () => calls.push('onSuccess'),
                onAbort:   () => calls.push('onAbort'),
                onFailure: () => calls.push('onFailure'),
            });
            Jobs.start('scan');
            await flush();
            Jobs.handleEvent({
                type: 'snapshot',
                job: { job_id: 'j1', job_type: 'scan', status },
            });
            assert.deepEqual(calls, expected, `failed for status=${status}`);
            assert.equal(Jobs.isActive('scan'), false);
        }
    });

    test('non-terminal snapshot (progress update) is ignored', async () => {
        const calls = [];
        Jobs.init({ startJob: () => Promise.resolve({ job: { job_id: 'j1' } }) });
        Jobs.register('scan', {
            onStart: () => calls.push('onStart'),
            onDone:  () => calls.push('onDone'),
        });
        Jobs.start('scan');
        await flush();
        Jobs.handleEvent({
            type: 'snapshot',
            job: { job_id: 'j1', job_type: 'scan', status: 'running', done: 5, total: 10 },
        });
        assert.deepEqual(calls, ['onStart']);
        assert.equal(Jobs.isActive('scan'), true);
    });

    test('start is a no-op while the same job type is already running', async () => {
        const calls = [];
        let serverCalls = 0;
        Jobs.init({
            startJob: () => {
                serverCalls++;
                return Promise.resolve({ job: { job_id: `j${serverCalls}` } });
            },
        });
        Jobs.register('scan', { onStart: () => calls.push('onStart') });

        Jobs.start('scan');
        await flush(); // first start resolves; _running['scan'] is now set
        Jobs.start('scan'); // must be ignored — same type already tracked
        await flush();

        assert.deepEqual(calls, ['onStart']);
        assert.equal(serverCalls, 1);
    });

    test('different job types are tracked independently', async () => {
        let id = 0;
        Jobs.init({
            startJob: (jobType) => {
                id++;
                return Promise.resolve({ job: { job_id: `${jobType}-${id}` } });
            },
        });
        Jobs.register('scan',  { onStart: () => {}, onDone: () => {}, onSuccess: () => {} });
        Jobs.register('clean', { onStart: () => {}, onDone: () => {}, onSuccess: () => {} });

        Jobs.start('scan');
        Jobs.start('clean');
        await flush();

        assert.ok(Jobs.isActive('scan'));
        assert.ok(Jobs.isActive('clean'));

        // Finishing one must not affect the other.
        Jobs.handleEvent({
            type: 'snapshot',
            job: { job_id: 'scan-1', job_type: 'scan', status: 'completed' },
        });
        assert.equal(Jobs.isActive('scan'), false);
        assert.equal(Jobs.isActive('clean'), true);
    });

    test('optional callbacks may be omitted without crashing', async () => {
        // Handler registers only onStart + onDone. Aborted snapshot must
        // not throw even though onAbort is undefined.
        Jobs.init({ startJob: () => Promise.resolve({ job: { job_id: 'j1' } }) });
        Jobs.register('scan', { onStart: () => {}, onDone: () => {} });

        Jobs.start('scan');
        await flush();
        assert.doesNotThrow(() => {
            Jobs.handleEvent({
                type: 'snapshot',
                job: { job_id: 'j1', job_type: 'scan', status: 'aborted' },
            });
        });
        assert.equal(Jobs.isActive('scan'), false);
    });

    test('terminal event that arrives before startJob resolves is buffered and replayed', async () => {
        const calls = [];
        let resolveStart;
        Jobs.init({ startJob: () => new Promise(r => { resolveStart = r; }) });
        Jobs.register('scan', {
            onStart:   () => calls.push('onStart'),
            onDone:    () => calls.push('onDone'),
            onSuccess: () => calls.push('onSuccess'),
        });

        Jobs.start('scan');
        // Terminal event arrives before startJob resolves.
        Jobs.handleEvent({
            type: 'snapshot',
            job: { job_id: 'j1', job_type: 'scan', status: 'completed' },
        });
        assert.deepEqual(calls, ['onStart']);

        resolveStart({ job: { job_id: 'j1' } });
        await flush();
        assert.deepEqual(calls, ['onStart', 'onDone', 'onSuccess']);
        assert.equal(Jobs.isActive('scan'), false);
    });

    test('bootstrap restores active jobs, ignores terminal and unregistered types', () => {
        const calls = [];
        Jobs.init({ startJob: () => Promise.resolve({ job: { job_id: 'x' } }) });
        Jobs.register('scan', { onStart: () => calls.push('scan:start') });
        Jobs.handleEvent({
            type: 'bootstrap',
            jobs: [
                { job_id: 'j1', job_type: 'scan',      status: 'running'   },
                { job_id: 'j2', job_type: 'scan-old',  status: 'running'   }, // unregistered
                { job_id: 'j3', job_type: 'scan',      status: 'completed' }, // terminal
            ],
        });
        assert.deepEqual(calls, ['scan:start']);
        assert.equal(Jobs.isActive('scan'), true);
        assert.equal(Jobs.isActive('scan-old'), false);
    });

    test('startJob rejection fires onDone + onFailure', async () => {
        const calls = [];
        Jobs.init({ startJob: () => Promise.reject(new Error('server down')) });
        Jobs.register('scan', {
            onStart:   () => calls.push('onStart'),
            onDone:    () => calls.push('onDone'),
            onFailure: () => calls.push('onFailure'),
        });
        Jobs.start('scan');
        await flush();
        assert.deepEqual(calls, ['onStart', 'onDone', 'onFailure']);
        assert.equal(Jobs.isActive('scan'), false);
    });
});
