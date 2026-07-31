import { API_BASE, requestJson } from './apiClient';

// Keep this above backend WordPress/WooCommerce probe timeouts so slow sites are reported as site issues, not backend disconnects.
export const SYSTEM_NETWORK_STATUS_TIMEOUT_MS = 20000;

export type SystemProblemArea = 'none' | 'businessComputer' | 'server' | 'backend' | 'docker' | 'configuration' | 'unknown';
export type SystemCheckOwner = 'businessComputer' | 'server' | 'backend' | 'docker';
export type SystemCheckStatus = 'ok' | 'warning' | 'error' | 'info';

export interface SystemStatusCheck {
  key: string;
  label: string;
  ok: boolean;
  status: SystemCheckStatus;
  owner: SystemCheckOwner;
  detail: string;
  url?: string;
  httpStatus?: number | null;
}

export interface SystemNetworkStatus {
  ok: boolean;
  checkedAt: string;
  summary: string;
  problemArea: SystemProblemArea;
  checks: SystemStatusCheck[];
  source?: 'live' | 'cache';
  stale?: boolean;
  refreshing?: boolean;
  durationMs?: number;
  lastSuccessAt?: string;
}

export interface SystemStatusDisplay {
  label: string;
  title: string;
  tone: 'checking' | 'ok' | 'warning' | 'error';
}

export interface SystemNetworkStatusRequestOptions {
  timeoutMs?: number;
  preferCached?: boolean;
  backgroundRefresh?: boolean;
  forceRefresh?: boolean;
  maxAgeSeconds?: number;
}

const nowIso = () => new Date().toISOString();

const joinDetail = (parts: string[]) => parts.filter(Boolean).join(' ');

export const buildClientNetworkFailureStatus = (
  browserOnline = true,
  apiBase = API_BASE,
  message = '',
): SystemNetworkStatus => {
  if (!browserOnline) {
    const detail = joinDetail([
      '浏览器报告这台业务电脑已离线。',
      '检查这台电脑的网络、Wi-Fi、网线或 VPN。',
      message,
    ]);
    return {
      ok: false,
      checkedAt: nowIso(),
      summary: '业务电脑网络异常',
      problemArea: 'businessComputer',
      checks: [{
        key: 'business-computer',
        label: '业务电脑网络',
        ok: false,
        status: 'error',
        owner: 'businessComputer',
        detail,
      }],
    };
  }

  const detail = joinDetail([
    `业务电脑在线，但无法访问后端 API（${apiBase}）。`,
    '检查后端服务地址、端口、防火墙、Nginx 或本机代理是否正常。',
    message,
  ]);
  return {
    ok: false,
    checkedAt: nowIso(),
    summary: '业务电脑无法连接后端服务',
    problemArea: 'backend',
    checks: [{
      key: 'client-api',
      label: '业务电脑 -> 后端服务',
      ok: false,
      status: 'error',
      owner: 'backend',
      detail,
    }],
  };
};

const SYSTEM_PROBLEM_AREAS: SystemProblemArea[] = ['none', 'businessComputer', 'server', 'backend', 'docker', 'configuration', 'unknown'];
const SYSTEM_CHECK_OWNERS: SystemCheckOwner[] = ['businessComputer', 'server', 'backend', 'docker'];
const SYSTEM_CHECK_STATUSES: SystemCheckStatus[] = ['ok', 'warning', 'error', 'info'];
const USER_HIDDEN_SYSTEM_CHECK_KEYS = new Set(['runtime']);
const USER_HIDDEN_SYSTEM_CHECK_TEXT = /(Docker|docker|容器|本机开发模式|后端运行方式)/;

const normalizeUserFacingSystemCheck = (check: SystemStatusCheck): SystemStatusCheck => {
  if (
    check.key === 'woocommerce'
    && !check.ok
    && (
      check.httpStatus === 401
      || check.httpStatus === 403
      || /(401|403|无权限|不正确|permission|forbidden|unauthorized)/i.test(check.detail)
    )
  ) {
    return { ...check, label: 'WooCommerce 权限' };
  }
  return check;
};

export const validateSystemNetworkStatus = (status: SystemNetworkStatus): SystemNetworkStatus => {
  if (typeof status?.ok !== 'boolean') {
    throw new Error('System network status response missing ok flag');
  }
  if (!status.summary || typeof status.summary !== 'string') {
    throw new Error('System network status response missing summary');
  }
  if (!SYSTEM_PROBLEM_AREAS.includes(status.problemArea)) {
    throw new Error('System network status response has invalid problem area');
  }
  if (!Array.isArray(status.checks)) {
    throw new Error('System network status response missing checks');
  }
  status.checks.forEach((check, index) => {
    if (typeof check?.key !== 'string' || check.key.trim() === '') {
      throw new Error(`System network status response has invalid check key at index ${index}`);
    }
    if (typeof check.label !== 'string' || check.label.trim() === '') {
      throw new Error(`System network status response has invalid check label at index ${index}`);
    }
    if (typeof check.detail !== 'string' || check.detail.trim() === '') {
      throw new Error(`System network status response has invalid check detail at index ${index}`);
    }
    if (typeof check.ok !== 'boolean') {
      throw new Error(`System network status response has invalid check ok flag at index ${index}`);
    }
    if (!SYSTEM_CHECK_OWNERS.includes(check.owner)) {
      throw new Error(`System network status response has invalid check owner at index ${index}`);
    }
    if (!SYSTEM_CHECK_STATUSES.includes(check.status)) {
      throw new Error(`System network status response has invalid check status at index ${index}`);
    }
  });
  return status;
};

export const fetchSystemNetworkStatus = async (
  apiBase = API_BASE,
  browserOnline = true,
  options: SystemNetworkStatusRequestOptions = {},
): Promise<SystemNetworkStatus> => {
  const timeoutMs = Math.max(1, Math.trunc(Number(options.timeoutMs ?? SYSTEM_NETWORK_STATUS_TIMEOUT_MS)));
  const params = new URLSearchParams();
  if (options.preferCached) params.set('prefer_cached', 'true');
  if (options.backgroundRefresh) params.set('background_refresh', 'true');
  if (options.forceRefresh) params.set('force_refresh', 'true');
  if (options.maxAgeSeconds !== undefined) {
    params.set('max_age_seconds', String(Math.max(0, Math.trunc(Number(options.maxAgeSeconds) || 0))));
  }
  const path = `/system/network-status${params.toString() ? `?${params.toString()}` : ''}`;
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort();
        reject(new Error(`System network status request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    const requestPromise = requestJson<SystemNetworkStatus>(
      path,
      controller ? { signal: controller.signal } : undefined,
      apiBase,
    );
    return validateSystemNetworkStatus(
      await Promise.race([requestPromise, timeoutPromise]),
    );
  } catch (error: any) {
    return buildClientNetworkFailureStatus(browserOnline, apiBase, error?.message || String(error));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const getUserFacingSystemStatusChecks = (
  status: SystemNetworkStatus | null | undefined,
): SystemStatusCheck[] => (
  (status?.checks || []).filter(check => (
    !USER_HIDDEN_SYSTEM_CHECK_KEYS.has(check.key)
    && !USER_HIDDEN_SYSTEM_CHECK_TEXT.test(`${check.label} ${check.detail}`)
  )).map(normalizeUserFacingSystemCheck)
);

export const getSystemStatusDisplay = (
  status: SystemNetworkStatus | null,
  checking = false,
): SystemStatusDisplay => {
  if (!status) {
    return {
      label: checking ? '检查网络中' : '状态未知',
      title: checking ? '正在检查业务电脑、后端服务、WordPress 和 WooCommerce 连通性。' : '暂时没有网络状态数据。',
      tone: checking ? 'checking' : 'warning',
    };
  }

  const details = getUserFacingSystemStatusChecks(status)
    .map(check => `${check.label}: ${check.detail}`)
    .join('\n');
  const title = `${status.summary}\n${details}`;

  if (status.ok) {
    return { label: '网络正常', title, tone: 'ok' };
  }

  if (status.problemArea === 'businessComputer') {
    return { label: '业务电脑离线', title, tone: 'error' };
  }
  if (status.problemArea === 'server') {
    return { label: '站点响应慢', title, tone: 'warning' };
  }
  if (status.problemArea === 'backend' || status.problemArea === 'docker') {
    return { label: '后端服务断开', title, tone: 'error' };
  }
  if (status.problemArea === 'configuration') {
    return { label: '配置待完善', title, tone: 'warning' };
  }
  return { label: '网络异常', title, tone: 'warning' };
};
