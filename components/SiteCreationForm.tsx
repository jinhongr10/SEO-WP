import React, { useState } from 'react';
import { Alert as ArcoAlert } from '@arco-design/web-react';
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon';
import type { Settings } from '../types';
import type { SiteProfile } from '../services/clientProfileService';
import {
  ActionGroup,
  Button,
  Field,
  FieldHint,
  FieldLabel,
  Input,
  OverflowText,
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
  StatusPill,
} from './ui';

export type SiteCreationDraft = {
  siteName: string;
  siteUrl: string;
  brandName: string;
  settings: Partial<Settings>;
};

type SiteCreationTestIds = {
  panel: string;
  name: string;
  url: string;
  brand: string;
  feedback: string;
  submit: string;
  restart: string;
};

export type SiteCreationFormProps = {
  title: string;
  description: string;
  submitLabel: string;
  hint: string;
  nameLabel?: string;
  namePlaceholder: string;
  urlLabel?: string;
  urlPlaceholder?: string;
  brandLabel?: string;
  brandPlaceholder?: string;
  autoFocusName?: boolean;
  embedded?: boolean;
  backendReady: boolean;
  backendStarting?: boolean;
  busy?: boolean;
  disabled?: boolean;
  restarting?: boolean;
  testIds: SiteCreationTestIds;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onRestartBackend?: () => Promise<void> | void;
  onCreate: (draft: SiteCreationDraft) => Promise<SiteProfile>;
  onCreated?: (profile: SiteProfile, draft: SiteCreationDraft) => void;
};

export const normalizeSiteCreationUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
};

export const SiteCreationForm: React.FC<SiteCreationFormProps> = ({
  title,
  description,
  submitLabel,
  hint,
  nameLabel = '站点名称',
  namePlaceholder,
  urlLabel = '网站地址（可选）',
  urlPlaceholder = 'https://example.com',
  brandLabel = '站点备注（可选）',
  brandPlaceholder = '例如：主品牌站',
  autoFocusName = false,
  embedded = false,
  backendReady,
  backendStarting = false,
  busy = false,
  disabled = false,
  restarting = false,
  testIds,
  secondaryActionLabel,
  onSecondaryAction,
  onRestartBackend,
  onCreate,
  onCreated,
}) => {
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [brandName, setBrandName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; content: string } | null>(null);

  const submit = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    const normalizedName = siteName.trim();
    if (!normalizedName) {
      setFeedback({ type: 'error', content: '请输入站点名称后再创建。' });
      return;
    }
    if (!backendReady) return;

    const normalizedUrl = normalizeSiteCreationUrl(siteUrl);
    const draft: SiteCreationDraft = {
      siteName: normalizedName,
      siteUrl: normalizedUrl,
      brandName: brandName.trim(),
      settings: { wpUrl: normalizedUrl, gscSiteUrl: normalizedUrl },
    };
    setSubmitting(true);
    setFeedback(null);
    try {
      const profile = await onCreate(draft);
      onCreated?.(profile, draft);
      setSiteName('');
      setSiteUrl('');
      setBrandName('');
      setFeedback({ type: 'success', content: '站点已创建并选中。可继续填写连接配置。' });
    } catch (error) {
      setFeedback({
        type: 'error',
        content: `站点创建失败：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fieldsAndActions = (
    <>
      <div className="site-creation-form__grid">
        <Field>
          <FieldLabel htmlFor={testIds.name}>{nameLabel}<span aria-hidden="true"> *</span></FieldLabel>
          <Input
            id={testIds.name}
            data-testid={testIds.name}
            value={siteName}
            onChange={event => setSiteName(event.currentTarget.value)}
            placeholder={namePlaceholder}
            autoFocus={autoFocusName}
            disabled={!backendReady || disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={testIds.url}>{urlLabel}</FieldLabel>
          <Input
            id={testIds.url}
            data-testid={testIds.url}
            value={siteUrl}
            onChange={event => setSiteUrl(event.currentTarget.value)}
            placeholder={urlPlaceholder}
            disabled={!backendReady || disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={testIds.brand}>{brandLabel}</FieldLabel>
          <Input
            id={testIds.brand}
            data-testid={testIds.brand}
            value={brandName}
            onChange={event => setBrandName(event.currentTarget.value)}
            placeholder={brandPlaceholder}
            disabled={!backendReady || disabled}
          />
        </Field>
      </div>
      {feedback && (
        <ArcoAlert
          data-testid={testIds.feedback}
          type={feedback.type}
          content={feedback.content}
          showIcon
        />
      )}
      <div className="site-creation-form__footer">
        <FieldHint><OverflowText strategy="wrap">{hint}</OverflowText></FieldHint>
        <ActionGroup>
          {secondaryActionLabel && onSecondaryAction && (
            <Button onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
          )}
          <Button
            data-testid={testIds.submit}
            type={embedded ? 'button' : 'submit'}
            variant="primary"
            icon={<IconPlus />}
            loading={submitting || busy}
            loadingFixedWidth
            disabled={!backendReady || disabled || submitting || busy}
            onClick={embedded ? submit : undefined}
          >
            {submitLabel}
          </Button>
        </ActionGroup>
      </div>
    </>
  );

  return (
    <Panel data-testid={testIds.panel} className="site-creation-panel">
      <PanelHeader className="site-creation-panel__header">
        <div className="min-w-0">
          <PanelTitle><OverflowText strategy="wrap">{title}</OverflowText></PanelTitle>
          <PanelDescription><OverflowText strategy="wrap">{description}</OverflowText></PanelDescription>
        </div>
        {!backendReady && (
          <StatusPill tone="warning">
            {backendStarting ? '后端正在自动启动' : '后端未连接'}
          </StatusPill>
        )}
      </PanelHeader>
      <PanelContent>
        {!backendReady && (
          <div className="site-creation-backend-state" role="status">
            <OverflowText strategy="wrap">
              {backendStarting
                ? '正在准备创建功能，后端就绪后会自动启用，无需手动操作。'
                : '本地后端启动失败，创建操作已暂停。'}
            </OverflowText>
            {!backendStarting && onRestartBackend && (
              <Button
                data-testid={testIds.restart}
                size="sm"
                icon={<IconRefresh />}
                loading={restarting}
                loadingFixedWidth
                onClick={() => void onRestartBackend()}
              >
                重启后端
              </Button>
            )}
          </div>
        )}
        {embedded ? (
          <div className="site-creation-form">{fieldsAndActions}</div>
        ) : (
          <form className="site-creation-form" onSubmit={submit}>{fieldsAndActions}</form>
        )}
      </PanelContent>
    </Panel>
  );
};
