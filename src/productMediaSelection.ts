export interface ProductMediaListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  issue?: string;
}

export const PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS = '';
export const PRODUCT_MEDIA_SELECTOR_REFRESH_SCAN_LIMIT = 48;

export interface ProductMediaLibraryRefreshOptions {
  scanLimit?: number;
  startScan: (limit: number) => Promise<unknown>;
  waitForScanIdle: (started: unknown) => Promise<string | void>;
  fetchItems: () => Promise<unknown>;
}

export const parseMediaReferenceUrls = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)));
  }

  const text = String(value || '').trim();
  if (!text) return [];

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parseMediaReferenceUrls(parsed);
      }
    } catch {
      // Fall through to delimiter parsing.
    }
  }

  return Array.from(new Set(
    text
      .split(/[\r\n,]+/)
      .map(item => item.trim())
      .filter(Boolean),
  ));
};

export const formatMediaReferenceUrls = (urls: unknown[]): string => (
  parseMediaReferenceUrls(urls).join('\n')
);

export const toggleMediaReferenceUrl = (urls: string[], url: string): string[] => {
  const normalized = parseMediaReferenceUrls(urls);
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return normalized;
  if (normalized.includes(cleanUrl)) {
    return normalized.filter(item => item !== cleanUrl);
  }
  return [...normalized, cleanUrl];
};

export const buildProductMediaListPath = ({
  page,
  limit,
  search = '',
  status = '',
  issue = '',
}: ProductMediaListQuery): string => {
  const params = new URLSearchParams({
    page: String(Math.max(1, page || 1)),
    limit: String(Math.max(1, limit || 24)),
    sort: 'id_desc',
  });
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set('q', trimmedSearch);
  if (status.trim()) params.set('status', status.trim());
  if (issue.trim()) params.set('issue', issue.trim());
  return `/media/list?${params.toString()}`;
};

export const refreshProductMediaLibrarySelection = async ({
  scanLimit = PRODUCT_MEDIA_SELECTOR_REFRESH_SCAN_LIMIT,
  startScan,
  waitForScanIdle,
  fetchItems,
}: ProductMediaLibraryRefreshOptions): Promise<string> => {
  const normalizedLimit = Math.max(1, Math.floor(Number(scanLimit) || PRODUCT_MEDIA_SELECTOR_REFRESH_SCAN_LIMIT));
  const started = await startScan(normalizedLimit);
  const warning = await waitForScanIdle(started);
  await fetchItems();
  return String(warning || '').trim();
};
