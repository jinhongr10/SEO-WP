export const READ_ONLY_ENDPOINTS = [
  { id: 'health', method: 'GET', path: '/desktop/health', required: true },
  { id: 'settings', method: 'GET', path: '/settings', required: true },
  { id: 'profiles', method: 'GET', path: '/site-profiles/summary', required: true },
  { id: 'network', method: 'GET', path: '/system/network-status?force_refresh=true', required: false },
];

export const summarizeSmokeResponse = (id, payload) => {
  if (id === 'health') return { ok: payload?.ok === true, backend: String(payload?.backend || '') };
  if (id === 'settings') {
    const wordpressConfigured = Boolean(payload?.wpUrl && payload?.wpUser && payload?.wpAppPass);
    const woocommerceConfigured = Boolean(payload?.wcConsumerKey && payload?.wcConsumerSecret);
    return {
      configured: wordpressConfigured || woocommerceConfigured || Boolean(payload?.aiProvider),
      wordpressConfigured,
      woocommerceConfigured,
    };
  }
  if (id === 'profiles') {
    const profiles = Array.isArray(payload) ? payload : (Array.isArray(payload?.profiles) ? payload.profiles : []);
    return { count: profiles.length };
  }
  if (id === 'network') {
    const warnings = (Array.isArray(payload?.checks) ? payload.checks : [])
      .filter(item => item?.ok === false)
      .map(item => `${String(item.label || item.key || 'External check')}: ${String(item.detail || item.status || 'failed')}`);
    return { ok: payload?.ok === true, summary: String(payload?.summary || ''), warnings };
  }
  return { ok: true };
};
