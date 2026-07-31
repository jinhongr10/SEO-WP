import { SEOData, WPData } from "../types";
import { requestApi } from "./apiClient";

const UPLOAD_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);

const uploadExtensionFrom = (filename: string) => {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match || !UPLOAD_IMAGE_EXTENSIONS.has(match[1])) return '';
  return match[1] === 'jpeg' ? 'jpg' : match[1];
};

const uploadStemFrom = (filename: string, fallback: string) => {
  const basename = (filename || '').split(/[\\/]/).pop() || '';
  const withoutExt = basename.replace(/\.[a-z0-9]+$/i, '');
  const stem = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (stem) return stem.slice(0, 120).replace(/-+$/g, '') || 'image';

  const fallbackBase = (fallback || 'image').split(/[\\/]/).pop() || 'image';
  return fallbackBase
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'image';
};

export const normalizeUploadFilename = (filename: string, fallback = 'image.webp') => {
  const ext = uploadExtensionFrom(filename) || uploadExtensionFrom(fallback) || 'webp';
  return `${uploadStemFrom(filename, fallback)}.${ext}`;
};

const stripHtml = (value: string) => value
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const formatProxyUploadError = (raw: unknown): string => {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (/example domain/i.test(text)) {
    return 'WordPress URL is still set to example.com. Open Settings and set the real WordPress site URL, then retry upload/WooCommerce.';
  }
  if (/<[a-z][\s\S]*>/i.test(text)) {
    const clean = stripHtml(text);
    return clean.length > 500 ? `${clean.slice(0, 500)}...` : clean;
  }
  return text;
};

const readWordPressError = async (res: Response) => {
  let text = '';
  try {
    text = await res.text();
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
  if (!text.trim()) return res.statusText || `HTTP ${res.status}`;
  try {
    const json = JSON.parse(text);
    return formatProxyUploadError(json.detail || json.error || json.message || text);
  } catch {
    return formatProxyUploadError(text);
  }
};

type WordPressUploadResponse = Partial<WPData> & {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  meta_update_error?: unknown;
};

const validateWordPressUploadData = (
  data: WordPressUploadResponse,
  source: 'proxy' | 'direct',
): WPData => {
  if (data?.ok === false) {
    throw new Error(formatProxyUploadError(data.detail || data.error || data.message || 'WordPress upload failed'));
  }
  const mediaId = Number(data?.id);
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    throw new Error(`WordPress media id was missing from the ${source} upload response`);
  }
  const sourceUrl = String(data?.source_url || '').trim();
  if (!sourceUrl) {
    throw new Error(`WordPress media source_url was missing from the ${source} upload response`);
  }
  const link = String(data?.link || '').trim();
  if (!link) {
    throw new Error(`WordPress media link was missing from the ${source} upload response`);
  }
  return {
    id: mediaId,
    source_url: sourceUrl,
    link,
  };
};

export const uploadToWordPress = async (
  url: string,
  user: string,
  appPass: string,
  blob: Blob,
  seo: SEOData,
  useProxy: boolean = false,
  backendUrl?: string
): Promise<WPData> => {
  const uploadFilename = normalizeUploadFilename(seo.filename, 'image.webp');
  const uploadSeo = { ...seo, filename: uploadFilename };
  // Option 1: Backend Proxy Mode (FastAPI)
  if (useProxy) {
    const proxyBase = ((backendUrl || '/api').trim() || '/api').replace(/\/$/, '');
    const formData = new FormData();
    formData.append('file', blob, uploadFilename);
    formData.append('seoData', JSON.stringify(uploadSeo));
    if (url) formData.append('wpUrl', url);
    if (user) formData.append('wpUser', user);
    if (appPass) formData.append('wpAppPass', appPass);

    let res: Response;
    try {
      res = await requestApi("/wp/upload", {
        method: 'POST',
        body: formData,
      }, proxyBase);
    } catch (e: any) {
      throw new Error(`Cannot reach backend upload API (${proxyBase}/wp/upload): ${e?.message || 'Network error'}`);
    }

    const uploadData = await res.json();
    if (uploadData?.meta_update_error) {
      throw new Error(`Metadata Update Failed: ${formatProxyUploadError(uploadData.meta_update_error)}`);
    }
    return validateWordPressUploadData(uploadData, 'proxy');
  }

  // Option 2: Direct Client Mode (Standard)
  // Normalize URL
  const baseUrl = url.replace(/\/$/, '');
  const endpoint = `${baseUrl}/wp-json/wp/v2/media`;
  
  // Basic Auth
  const token = btoa(`${user}:${appPass}`);
  const headers = {
    'Authorization': `Basic ${token}`,
    // Content-Disposition tells WP the filename
    'Content-Disposition': `attachment; filename="${uploadFilename}"`,
    'Content-Type': blob.type || 'image/webp',
  };

  // Step 1: Upload the binary
  let mediaId: number;
  let sourceUrl: string;
  let link: string;

  let uploadRes: Response;
  try {
    uploadRes = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: blob,
    });
  } catch (e: any) {
    throw new Error(`Connection Error: ${e.message}. Check CORS or Credentials.`);
  }

  if (!uploadRes.ok) {
    throw new Error(`WP Upload Failed: ${await readWordPressError(uploadRes)}`);
  }

  const uploadData = validateWordPressUploadData(await uploadRes.json(), 'direct');
  mediaId = uploadData.id;
  sourceUrl = uploadData.source_url;
  link = uploadData.link; // The attachment page or direct link depending on WP config

  // Step 2: Update Metadata (Title, Alt, etc.)
  let updateRes: Response;
  try {
    updateRes = await fetch(`${endpoint}/${mediaId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: uploadSeo.title,
        caption: uploadSeo.caption,
        alt_text: uploadSeo.alt,
        description: uploadSeo.description,
      }),
    });
  } catch (e) {
    throw new Error(`Metadata Update Failed: ${(e as Error)?.message || String(e)}`);
  }

  if (!updateRes.ok) {
    throw new Error(`Metadata Update Failed: ${await readWordPressError(updateRes)}`);
  }

  return {
    id: mediaId,
    source_url: sourceUrl,
    link: link
  };
};
