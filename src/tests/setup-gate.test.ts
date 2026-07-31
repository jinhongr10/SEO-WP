import assert from 'node:assert/strict';
import test from 'node:test';

test('setup wizard depends only on site presence, remembered skip, and explicit reopen', async () => {
  const { shouldShowSetupWizard } = await import('../../App.tsx');

  assert.equal(shouldShowSetupWizard({
    setupDismissed: false,
    setupLoading: false,
    setupStatus: { setupComplete: false, siteCreated: true },
    setupWizardRequested: false,
  }), false);

  assert.equal(shouldShowSetupWizard({
    setupDismissed: false,
    setupLoading: false,
    setupStatus: { setupComplete: true, siteCreated: false },
    setupWizardRequested: false,
  }), true);

  assert.equal(shouldShowSetupWizard({
    setupDismissed: true,
    setupLoading: false,
    setupStatus: { setupComplete: false, siteCreated: false },
    setupWizardRequested: false,
  }), false);

  assert.equal(shouldShowSetupWizard({
    setupDismissed: false,
    setupLoading: false,
    setupStatus: { setupComplete: false, siteCreated: true },
    setupWizardRequested: true,
  }), true);
});
