export const APP_DIALOG_EVENT = 'seo-wp-sync:app-dialog';
export const APP_DIALOG_HOST_READY_KEY = '__SEO_WP_SYNC_APP_DIALOG_HOST_READY__';

export type AppDialogKind = 'alert' | 'confirm' | 'prompt';
export type AppDialogTone = 'info' | 'warning' | 'danger';

type BaseDialogRequest<T> = {
  id: string;
  kind: AppDialogKind;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
  resolve: (value: T) => void;
};

export type AppAlertDialogRequest = BaseDialogRequest<void> & {
  kind: 'alert';
};

export type AppConfirmDialogRequest = BaseDialogRequest<boolean> & {
  kind: 'confirm';
};

export type AppPromptDialogRequest = BaseDialogRequest<string | null> & {
  kind: 'prompt';
  defaultValue?: string;
  placeholder?: string;
};

export type AppDialogRequest =
  | AppAlertDialogRequest
  | AppConfirmDialogRequest
  | AppPromptDialogRequest;

type DialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
};

type PromptDialogOptions = DialogOptions & {
  defaultValue?: string;
  placeholder?: string;
};

let dialogSequence = 0;

declare global {
  interface Window {
    [APP_DIALOG_HOST_READY_KEY]?: boolean;
  }
}

const hasReadyHost = () => (
  typeof window !== 'undefined'
  && typeof window.dispatchEvent === 'function'
  && typeof CustomEvent !== 'undefined'
  && Boolean(window[APP_DIALOG_HOST_READY_KEY])
);

const dispatchDialog = <T>(
  request: Omit<BaseDialogRequest<T>, 'id' | 'resolve'> & Record<string, unknown>,
  fallback: T,
): Promise<T> => new Promise(resolve => {
  if (!hasReadyHost()) {
    if (request.message) console.warn(request.message);
    resolve(fallback);
    return;
  }

  dialogSequence += 1;
  const detail = {
    ...request,
    id: `app-dialog-${Date.now()}-${dialogSequence}`,
    resolve,
  };
  window.dispatchEvent(new CustomEvent<AppDialogRequest>(APP_DIALOG_EVENT, { detail: detail as AppDialogRequest }));
});

export const showAppAlert = (
  message: string,
  options: DialogOptions = {},
): Promise<void> => dispatchDialog<void>({
  kind: 'alert',
  message,
  title: options.title || '提示',
  confirmLabel: options.confirmLabel || '知道了',
  tone: options.tone || 'info',
}, undefined);

export const showAppConfirm = (
  message: string,
  options: DialogOptions = {},
): Promise<boolean> => dispatchDialog<boolean>({
  kind: 'confirm',
  message,
  title: options.title || '确认操作',
  confirmLabel: options.confirmLabel || '确定',
  cancelLabel: options.cancelLabel || '取消',
  tone: options.tone || 'warning',
}, false);

export const showAppPrompt = (
  message: string,
  options: PromptDialogOptions = {},
): Promise<string | null> => dispatchDialog<string | null>({
  kind: 'prompt',
  message,
  title: options.title || '请输入',
  confirmLabel: options.confirmLabel || '确定',
  cancelLabel: options.cancelLabel || '取消',
  defaultValue: options.defaultValue || '',
  placeholder: options.placeholder || '',
  tone: options.tone || 'info',
}, null);
