import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reconcileStoredBackgroundTask,
  validateBackgroundTaskSnapshot,
  waitForBackgroundTask,
  type BackgroundTaskSnapshot,
} from '../../services/backgroundTaskService.ts';


const task = (overrides: Partial<BackgroundTaskSnapshot> = {}): BackgroundTaskSnapshot => ({
  id: 'task-1',
  runtimeId: 'runtime-1',
  scope: 'product',
  operation: 'product-scan',
  siteId: 'site-a',
  status: 'running',
  queuePosition: 0,
  createdAt: '2026-07-14T03:00:00Z',
  startedAt: '2026-07-14T03:00:01Z',
  finishedAt: null,
  lastError: null,
  lastWarning: null,
  ...overrides,
});

test('background task snapshot validates queue state and rejects malformed responses', () => {
  assert.equal(validateBackgroundTaskSnapshot(task({ status: 'queued', queuePosition: 2 })).queuePosition, 2);
  assert.throws(
    () => validateBackgroundTaskSnapshot({ ...task(), status: 'waiting' }),
    /invalid background task status/i,
  );
  assert.throws(
    () => validateBackgroundTaskSnapshot({ ...task(), queuePosition: -1 }),
    /invalid background task queue position/i,
  );
});

test('task polling follows one task id and returns its completion warning', async () => {
  const snapshots = [
    task({ status: 'queued', queuePosition: 1 }),
    task({ status: 'running', queuePosition: 0 }),
    task({ status: 'completed', finishedAt: '2026-07-14T03:01:00Z', lastWarning: 'partial scan' }),
  ];
  const fetchedIds: string[] = [];
  const observedStatuses: string[] = [];

  const completed = await waitForBackgroundTask(snapshots.shift()!, {
    fetchTask: async id => {
      fetchedIds.push(id);
      return snapshots.shift()!;
    },
    sleep: async () => {},
    timeoutMs: 1000,
    now: () => 0,
    onUpdate: snapshot => observedStatuses.push(snapshot.status),
  });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.lastWarning, 'partial scan');
  assert.deepEqual(fetchedIds, ['task-1', 'task-1']);
  assert.deepEqual(observedStatuses, ['queued', 'running', 'completed']);
});

test('task polling reports task-specific failures and cancellations', async () => {
  await assert.rejects(
    () => waitForBackgroundTask(task({ status: 'failed', lastError: 'WooCommerce rejected page 2' })),
    /WooCommerce rejected page 2/,
  );
  await assert.rejects(
    () => waitForBackgroundTask(task({ status: 'cancelled' })),
    /任务已取消/,
  );
});

test('stored task reconciliation detects a backend runtime restart without persisting secrets', () => {
  const storage = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  const key = 'background-task:site-a:media';
  adapter.setItem(key, JSON.stringify({ taskId: 'task-old', runtimeId: 'runtime-old' }));

  const result = reconcileStoredBackgroundTask({
    siteId: 'site-a',
    scope: 'media',
    runtimeId: 'runtime-new',
    currentTask: null,
    storage: adapter,
  });

  assert.equal(result.wasRestarted, true);
  assert.equal(adapter.getItem(key), null);
  assert.deepEqual(Object.keys(result).sort(), ['task', 'wasRestarted']);
});
