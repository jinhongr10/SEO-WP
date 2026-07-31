export type AppErrorCategory =
  | 'wordpress_config'
  | 'wordpress_auth'
  | 'cloudflare'
  | 'woocommerce'
  | 'sftp'
  | 'ai'
  | 'ai_request'
  | 'ai_credentials'
  | 'ai_model'
  | 'ai_quota'
  | 'ai_response'
  | 'backend'
  | 'timeout'
  | 'seo_plugin'
  | 'unknown';

export type AppErrorSeverity = 'info' | 'warning' | 'danger';

export interface AppErrorInsight {
  category: AppErrorCategory;
  title: string;
  probableCause: string;
  suggestedAction: string;
  severity: AppErrorSeverity;
}

export interface AppErrorLogEntry {
  id: string;
  createdAt: string;
  context: string;
  message: string;
  technicalDetails: string;
  insight: AppErrorInsight;
}

export interface AppErrorPresentation {
  category: AppErrorCategory;
  title: string;
  message: string;
  suggestedAction: string;
  severity: AppErrorSeverity;
  retryable: boolean;
  technicalDetails: string;
}

type NowProvider = () => Date;

export const APP_ERROR_LOG_STORAGE_KEY = 'seoWpSync.errorLogs.v1';
export const APP_ERROR_LOG_EVENT = 'seo-wp-sync:error-log-updated';
export const MAX_APP_ERROR_LOGS = 80;

const getTechnicalErrorDetails = (error: unknown, fallback = '未知错误'): string => {
  if (error && typeof error === 'object' && 'technicalDetails' in error) {
    const technicalDetails = String((error as { technicalDetails?: unknown }).technicalDetails || '').trim();
    if (technicalDetails) return technicalDetails;
  }
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) || fallback;
  } catch {
    return String(error) || fallback;
  }
};

const toErrorMessage = getTechnicalErrorDetails;

const hasMatch = (text: string, pattern: RegExp) => pattern.test(text);

export const classifyAppError = (error: unknown, context = ''): AppErrorInsight => {
  const text = `${context} ${toErrorMessage(error)}`;

  if (hasMatch(text, /(Please use a valid role:\s*user,\s*model|INVALID_ARGUMENT[\s\S]*role|valid role[\s\S]*(?:user|model))/i)) {
    return {
      category: 'ai_request',
      title: 'AI 请求格式不兼容',
      probableCause: '当前应用发送给 AI 服务的消息格式不受支持，这不是图片内容造成的。',
      suggestedAction: '无需反复重试，请更新应用到修复版本；若已是最新版本，请把错误记录交给技术人员。',
      severity: 'danger',
    };
  }

  if (hasMatch(text, /(?:(?:mimeType|MIME(?:\s+type)?)[\s\S]{0,200}(?:not supported|unsupported|不支持)|(?:not supported|unsupported|不支持)[\s\S]{0,80}(?:mimeType|MIME(?:\s+type)?))/i)) {
    return {
      category: 'ai_request',
      title: 'AI 附件格式不兼容',
      probableCause: '上传附件的 MIME 类型为当前 AI 服务不支持的格式，原文件无法直接提交。',
      suggestedAction: '无需反复重试；请使用应用支持的文件格式或先转换附件，并更新应用到最新版本。',
      severity: 'danger',
    };
  }

  if (hasMatch(text, /(?:429|quota|resource has been exhausted|rate.?limit|too many requests|额度|请求过于频繁)/i)) {
    return {
      category: 'ai_quota',
      title: 'AI 服务繁忙或额度不足',
      probableCause: 'AI 服务当前触发了调用频率限制，或项目可用额度暂时不足。',
      suggestedAction: '请稍后重试；如果持续出现，请检查 Vertex/Gemini 项目的配额和结算状态。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(?:Vertex|Gemini|Google|AI)[\s\S]*(?:credential|Service Account|API Key|permission denied|unauthenticated|Project ID|JSON 未找到)|GOOGLE_APPLICATION_CREDENTIALS/i)) {
    return {
      category: 'ai_credentials',
      title: 'AI 凭证或项目配置无效',
      probableCause: 'AI 服务没有取得有效的项目、密钥或服务账号权限。',
      suggestedAction: '请在系统配置中重新测试 AI 连接，并检查 Project ID、Location 和服务账号 JSON。',
      severity: 'danger',
    };
  }

  if (hasMatch(text, /(?:Vertex|Gemini|AI)[\s\S]*(?:model not found|unsupported model|not found[\s\S]*model|location|region)/i)) {
    return {
      category: 'ai_model',
      title: 'AI 模型或地区不可用',
      probableCause: '当前项目、模型名称或 Location 组合不支持这次调用。',
      suggestedAction: '请检查系统配置中的模型与 Location；Vertex 模式建议重新执行 AI 连接测试。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(?:Empty response from Gemini|AI response[\s\S]*(?:JSON|parse)|Unexpected token[\s\S]*JSON)/i)) {
    return {
      category: 'ai_response',
      title: 'AI 返回内容无法读取',
      probableCause: 'AI 服务返回了空内容或不完整的数据格式，本次结果没有保存。',
      suggestedAction: '可以重新生成一次；如果重复出现，请降低批量数量并查看错误记录。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /WordPress[\s\S]*(?:REST|API)[\s\S]*(?:unavailable|failed|error|not available|request failed)/i)) {
    return {
      category: 'wordpress_config',
      title: 'WordPress 接口暂时不可用',
      probableCause: 'WordPress REST 接口当前无法完成请求，可能是站点、反向代理或安全规则异常。',
      suggestedAction: '请稍后重试；若持续失败，请检查 WordPress 站点状态、/wp-json/ 和反向代理日志。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(请先.*WordPress|没有配置 WordPress URL|WordPress URL is still set to example\.com|WP URL|wpUrl|WordPress 网址.*应用密码)/i)) {
    return {
      category: 'wordpress_config',
      title: 'WordPress 配置不完整',
      probableCause: '应用还没有拿到有效的 WordPress 网址、用户名或 Application Password。',
      suggestedAction: '打开系统配置，确认 WordPress URL 使用 https:// 站点根域名，并重新填写用户名和 Application Password 后保存。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(401|unauthori[sz]ed|Application Password|应用密码|invalid_username|invalid_password|incorrect username|认证失败|authentication)/i)) {
    return {
      category: 'wordpress_auth',
      title: 'WordPress 认证失败',
      probableCause: '用户名或 Application Password 不正确，或者该 WordPress 用户没有足够权限。',
      suggestedAction: '到 WordPress 后台重新生成 Application Password，粘贴到系统配置后保存；不要使用后台登录密码代替。',
      severity: 'danger',
    };
  }

  if (hasMatch(text, /(403|forbidden|cloudflare|challenge|REST bypass|REST Header|WAF|Browser Integrity|Super Bot|wp-json)/i)) {
    return {
      category: 'cloudflare',
      title: 'WordPress REST 被拦截',
      probableCause: 'Cloudflare、安全插件或主机防火墙拦截了 /wp-json/ REST 请求。',
      suggestedAction: '按配置说明添加 Cloudflare REST Header 绕过规则，或检查安全插件、防火墙和 WordPress REST API 权限。',
      severity: 'danger',
    };
  }

  if (hasMatch(text, /(WooCommerce|Consumer Key|Consumer Secret|ck_|cs_|产品扫描|产品列表|woocommerce)/i)) {
    return {
      category: 'woocommerce',
      title: 'WooCommerce API 配置异常',
      probableCause: 'Consumer Key / Secret 错误、权限不是 Read/Write，或 WooCommerce REST API 被拦截。',
      suggestedAction: '在 WooCommerce > Settings > Advanced > REST API 重新创建 Read/Write Key，并保存到系统配置。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(SFTP|ssh|permission denied|wp-content\/uploads|remoteWpRoot|REMOTE_WP_ROOT|No such file|host key|ECONNREFUSED.*22)/i)) {
    return {
      category: 'sftp',
      title: 'SFTP 连接或路径异常',
      probableCause: 'SFTP 主机、端口、用户名、密码、WordPress 根目录或 uploads 写入权限不正确。',
      suggestedAction: '向主机服务商确认 SFTP 信息，并确认远程根目录下能看到 wp-content、wp-admin 和 wp-includes。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(Vertex|Gemini|AI 连接|API Key|AIza|GOOGLE_APPLICATION_CREDENTIALS|Service Account|Project ID|quota|429|model|credentialsFileExists|JSON 未找到)/i)) {
    return {
      category: 'ai',
      title: 'AI 配置或额度异常',
      probableCause: 'Gemini API Key、Vertex Project、Location、Service Account JSON 路径或模型额度存在问题。',
      suggestedAction: '打开系统配置测试 AI 连接；Vertex 模式重点检查 Project ID、Location 和 Service Account JSON 文件路径。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(timeout|timed out|AbortError|读取超时|超时)/i)) {
    return {
      category: 'timeout',
      title: '请求超时',
      probableCause: '站点、服务器或 AI 接口响应时间过长，任务可能还在运行或被网络中断。',
      suggestedAction: '稍后刷新状态；如果多次超时，降低批量数量，检查服务器负载和 WordPress REST 响应速度。',
      severity: 'warning',
    };
  }

  if (hasMatch(text, /(Failed to fetch|NetworkError|Load failed|ECONNREFUSED|Disconnected|backend|127\.0\.0\.1|3004|502|503|504)/i)) {
    return {
      category: 'backend',
      title: '后端或网络不可达',
      probableCause: '本机后端服务未启动、地址配置错误，或网络暂时无法连接到服务端。',
      suggestedAction: '检查应用左侧连接状态；桌面版可重启应用，服务器版确认后端服务和反向代理正在运行。',
      severity: 'danger',
    };
  }

  if (hasMatch(text, /(SEO 插件|AIOSEO|Rank Math|Yoast|meta key|needs_connector|canWrite)/i)) {
    return {
      category: 'seo_plugin',
      title: 'SEO 插件写入方式未确认',
      probableCause: '站点 SEO 插件未启用、REST meta key 不可写，或缺少配套连接插件。',
      suggestedAction: '在首次配置页重新检测 SEO 插件；如果仍不可写，让实施人员确认插件和 meta key 写入方式。',
      severity: 'warning',
    };
  }

  return {
    category: 'unknown',
    title: '操作失败',
    probableCause: '当前错误没有匹配到已知配置场景，可能是临时网络、接口返回格式或未知服务异常。',
    suggestedAction: '保留这条错误记录，复制错误信息给技术人员，并说明当时所在栏目和操作步骤。',
    severity: 'info',
  };
};

const RETRYABLE_ERROR_CATEGORIES = new Set<AppErrorCategory>([
  'ai_quota',
  'ai_response',
  'backend',
  'timeout',
]);

export const describeAppError = (error: unknown, context = ''): AppErrorPresentation => {
  const technicalDetails = getTechnicalErrorDetails(error);
  const insight = classifyAppError(technicalDetails, context);
  return {
    category: insight.category,
    title: insight.title,
    message: insight.probableCause,
    suggestedAction: insight.suggestedAction,
    severity: insight.severity,
    retryable: RETRYABLE_ERROR_CATEGORIES.has(insight.category),
    technicalDetails,
  };
};

export const formatUserFacingError = (error: unknown, context = ''): string => {
  const presentation = describeAppError(error, context);
  return `${presentation.title}：${presentation.message} 处理建议：${presentation.suggestedAction}`;
};

export const getUserFacingErrorMessage = formatUserFacingError;

export class AppUserFacingError extends Error {
  readonly technicalDetails: string;
  readonly presentation: AppErrorPresentation;

  constructor(error: unknown, context = '') {
    const presentation = describeAppError(error, context);
    super(`${presentation.title}：${presentation.message} 处理建议：${presentation.suggestedAction}`);
    this.name = 'AppUserFacingError';
    this.technicalDetails = presentation.technicalDetails;
    this.presentation = presentation;
  }
}

export const createUserFacingError = (error: unknown, context = '') => (
  error instanceof AppUserFacingError ? error : new AppUserFacingError(error, context)
);

const getDefaultStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

const notifyErrorLogChanged = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APP_ERROR_LOG_EVENT));
};

export const readAppErrorLogs = (storage: Storage | null = getDefaultStorage()): AppErrorLogEntry[] => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(APP_ERROR_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Omit<AppErrorLogEntry, 'technicalDetails'> & { technicalDetails?: string } => (
      entry
      && typeof entry.id === 'string'
      && typeof entry.createdAt === 'string'
      && typeof entry.context === 'string'
      && typeof entry.message === 'string'
      && entry.insight
      && typeof entry.insight.title === 'string'
      && typeof entry.insight.probableCause === 'string'
      && typeof entry.insight.suggestedAction === 'string'
    )).slice(0, MAX_APP_ERROR_LOGS).map(entry => ({
      ...entry,
      technicalDetails: typeof entry.technicalDetails === 'string' && entry.technicalDetails.trim()
        ? entry.technicalDetails
        : entry.message,
    }));
  } catch {
    return [];
  }
};

export const buildAppErrorLogEntry = (
  error: unknown,
  context = '应用错误',
  now: NowProvider = () => new Date(),
): AppErrorLogEntry => {
  const createdAt = now().toISOString();
  const message = toErrorMessage(error);
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt,
    context: context.trim() || '应用错误',
    message,
    technicalDetails: message,
    insight: classifyAppError(message, context),
  };
};

export const appendAppErrorLog = (
  error: unknown,
  context = '应用错误',
  storage: Storage | null = getDefaultStorage(),
  now: NowProvider = () => new Date(),
): AppErrorLogEntry => {
  const entry = buildAppErrorLogEntry(error, context, now);
  if (!storage) return entry;
  const logs = [entry, ...readAppErrorLogs(storage)].slice(0, MAX_APP_ERROR_LOGS);
  try {
    storage.setItem(APP_ERROR_LOG_STORAGE_KEY, JSON.stringify(logs));
    notifyErrorLogChanged();
  } catch {
    // Local storage can be full or disabled; still return the classified entry.
  }
  return entry;
};

const TRANSIENT_DESKTOP_BACKEND_ERROR_PATTERN = /(?:本地后端启动超时|Local backend is still starting|Local backend proxy failed|ECONNREFUSED\s+127\.0\.0\.1|ERR_CONNECTION_REFUSED.*127\.0\.0\.1)/i;

const isTransientDesktopBackendErrorLog = (entry: AppErrorLogEntry) => (
  TRANSIENT_DESKTOP_BACKEND_ERROR_PATTERN.test(`${entry.context} ${entry.message}`)
);

export const clearTransientDesktopBackendErrorLogs = (
  storage: Storage | null = getDefaultStorage(),
): AppErrorLogEntry[] => {
  if (!storage) return [];
  const current = readAppErrorLogs(storage);
  const remaining = current.filter(entry => !isTransientDesktopBackendErrorLog(entry));
  if (remaining.length === current.length) return remaining;
  try {
    if (remaining.length > 0) {
      storage.setItem(APP_ERROR_LOG_STORAGE_KEY, JSON.stringify(remaining));
    } else {
      storage.removeItem(APP_ERROR_LOG_STORAGE_KEY);
    }
    notifyErrorLogChanged();
  } catch {
    // Local storage can be full or disabled; return the in-memory filtered result.
  }
  return remaining;
};

export const clearAppErrorLogs = (storage: Storage | null = getDefaultStorage()) => {
  if (!storage) return;
  try {
    storage.removeItem(APP_ERROR_LOG_STORAGE_KEY);
    notifyErrorLogChanged();
  } catch {
    // Ignore local storage failures.
  }
};
