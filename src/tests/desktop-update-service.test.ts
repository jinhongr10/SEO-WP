import assert from 'node:assert/strict';
import test from 'node:test';

type DesktopMock = {
  getUpdateStatus?: () => Promise<unknown>;
  checkForUpdates?: () => Promise<unknown>;
  installUpdate?: () => Promise<unknown>;
  onUpdateStatus?: (callback: (status: unknown) => void) => () => void;
};

const withWindow = async (desktop: DesktopMock | undefined, run: () => Promise<void>) => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  if (desktop) {
    (globalThis as { window?: unknown }).window = { seoWpSyncDesktop: desktop };
  } else {
    delete (globalThis as { window?: unknown }).window;
  }

  try {
    await run();
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
};

test('desktop update service returns unsupported outside the desktop runtime', async () => {
  await withWindow(undefined, async () => {
    const service = await import(`../../services/desktopUpdateService.ts?unsupported=${Date.now()}`);

    const status = await service.getDesktopUpdateStatus();

    assert.equal(status.phase, 'unsupported');
    assert.equal(status.currentVersion, '');
    assert.equal(status.progress, 0);
  });
});

test('desktop update service normalizes checking and no-update statuses', async () => {
  await withWindow({
    getUpdateStatus: async () => ({
      phase: 'checking',
      currentVersion: '0.1.0',
      latestVersion: '',
      progress: 0,
      lastCheckedAt: '2026-07-04T06:00:00.000Z',
    }),
    checkForUpdates: async () => ({
      phase: 'not-available',
      currentVersion: '0.1.0',
      latestVersion: '0.1.0',
      progress: 0,
      lastCheckedAt: '2026-07-04T06:00:01.000Z',
    }),
  }, async () => {
    const service = await import(`../../services/desktopUpdateService.ts?checking=${Date.now()}`);

    const checking = await service.getDesktopUpdateStatus();
    const noUpdate = await service.checkForDesktopUpdates();

    assert.equal(checking.phase, 'checking');
    assert.equal(checking.currentVersion, '0.1.0');
    assert.equal(noUpdate.phase, 'not-available');
    assert.equal(noUpdate.latestVersion, '0.1.0');
  });
});

test('desktop update service normalizes available, downloaded, and error statuses', async () => {
  await withWindow({
    getUpdateStatus: async () => ({
      phase: 'available',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      progress: 42.7,
    }),
    installUpdate: async () => ({
      phase: 'downloaded',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      progress: 100,
    }),
  }, async () => {
    const service = await import(`../../services/desktopUpdateService.ts?available=${Date.now()}`);

    const available = await service.getDesktopUpdateStatus();
    const downloaded = await service.installDesktopUpdate();
    const error = service.normalizeDesktopUpdateStatus({
      phase: 'error',
      errorMessage: 'GitHub release metadata missing',
      progress: 180,
    });

    assert.equal(available.phase, 'available');
    assert.equal(available.latestVersion, '0.2.0');
    assert.equal(available.progress, 42.7);
    assert.equal(downloaded.phase, 'downloaded');
    assert.equal(downloaded.progress, 100);
    assert.equal(error.phase, 'error');
    assert.equal(error.errorMessage, 'GitHub release metadata missing');
    assert.equal(error.progress, 100);
  });
});

test('desktop update service subscribes and unsubscribes to pushed update statuses', async () => {
  let listener: ((status: unknown) => void) | null = null;
  let unsubscribed = false;

  await withWindow({
    onUpdateStatus: callback => {
      listener = callback;
      return () => {
        unsubscribed = true;
      };
    },
  }, async () => {
    const service = await import(`../../services/desktopUpdateService.ts?subscribe=${Date.now()}`);
    const seen: string[] = [];

    const unsubscribe = service.subscribeDesktopUpdateStatus(status => {
      seen.push(status.phase);
    });
    listener?.({ phase: 'downloading', progress: 64, currentVersion: '0.1.0' });
    unsubscribe();

    assert.deepEqual(seen, ['downloading']);
    assert.equal(unsubscribed, true);
  });
});
