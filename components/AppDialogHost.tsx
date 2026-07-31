import React, { useEffect, useState } from 'react';
import {
  APP_DIALOG_EVENT,
  APP_DIALOG_HOST_READY_KEY,
  AppDialogRequest,
} from '../services/appDialogService';
import {
  Button as ArcoButton,
  Input as ArcoInput,
  Modal as ArcoModal,
  Space as ArcoSpace,
} from '@arco-design/web-react';

const ArcoModalComponent = ArcoModal as unknown as React.ComponentType<any>;

const toneClasses = {
  info: {
    status: undefined,
    buttonType: 'primary',
  },
  warning: {
    status: 'warning',
    buttonType: 'primary',
  },
  danger: {
    status: 'danger',
    buttonType: 'primary',
  },
} satisfies Record<string, { status?: 'warning' | 'danger'; buttonType: 'primary' }>;

export const AppDialogHost: React.FC = () => {
  const [queue, setQueue] = useState<AppDialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState('');
  const dialog = queue[0];
  const tone = toneClasses[dialog?.tone || 'info'];

  useEffect(() => {
    window[APP_DIALOG_HOST_READY_KEY] = true;
    const handleDialog = (event: Event) => {
      const detail = (event as CustomEvent<AppDialogRequest>).detail;
      if (!detail?.id) return;
      setQueue(prev => [...prev, detail]);
    };
    window.addEventListener(APP_DIALOG_EVENT, handleDialog);
    return () => {
      window.removeEventListener(APP_DIALOG_EVENT, handleDialog);
      window[APP_DIALOG_HOST_READY_KEY] = false;
    };
  }, []);

  useEffect(() => {
    setPromptValue(dialog?.kind === 'prompt' ? dialog.defaultValue || '' : '');
  }, [dialog?.id, dialog?.kind]);

  if (!dialog) return null;

  const closeDialog = (value: unknown) => {
    (dialog.resolve as (value: unknown) => void)(value);
    setQueue(prev => prev.slice(1));
  };

  const cancelValue = dialog.kind === 'prompt' ? null : false;
  const confirmValue = dialog.kind === 'prompt' ? promptValue : true;
  const showCancel = dialog.kind !== 'alert';

  return (
    <ArcoModalComponent
      visible={Boolean(dialog)}
      title={dialog.title}
      onCancel={() => closeDialog(cancelValue)}
      footer={(
        <ArcoSpace size={8}>
          {showCancel && (
            <ArcoButton onClick={() => closeDialog(cancelValue)}>
              {dialog.cancelLabel || '取消'}
            </ArcoButton>
          )}
          <ArcoButton
            type={tone.buttonType}
            status={tone.status}
            onClick={() => closeDialog(confirmValue)}
          >
            {dialog.confirmLabel || '确定'}
          </ArcoButton>
        </ArcoSpace>
      )}
      maskClosable={dialog.kind === 'alert'}
      escToExit
      focusLock
      unmountOnExit
    >
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{dialog.message}</p>
        {dialog.kind === 'prompt' && (
          <div className="pt-4">
            <ArcoInput
              autoFocus
              value={promptValue}
              onChange={setPromptValue}
              onPressEnter={() => closeDialog(confirmValue)}
              placeholder={dialog.placeholder}
            />
          </div>
        )}
    </ArcoModalComponent>
  );
};
