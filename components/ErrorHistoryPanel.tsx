import React from 'react';
import { Button as ArcoButton } from '@arco-design/web-react';
import type { AppErrorLogEntry } from '../services/errorLogService';

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
};

interface ErrorHistoryPanelProps {
  theme: Theme;
  logs: AppErrorLogEntry[];
  onClear: () => void;
  onRefresh: () => void;
}

const severityClass = (severity: AppErrorLogEntry['insight']['severity']) => {
  if (severity === 'danger') return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200';
};

const formatLogTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

export const ErrorHistoryPanel: React.FC<ErrorHistoryPanelProps> = ({
  theme,
  logs,
  onClear,
  onRefresh,
}) => (
  <section data-testid="error-history-panel" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>错误记录</h4>
        <p className={`mt-2 text-xs leading-5 ${theme.subText}`}>
          最近的 API、配置和同步报错会保存在本机，方便判断可能原因和下一步处理。
        </p>
      </div>
      <div className="flex gap-2">
        <ArcoButton size="small" onClick={onRefresh}>
          刷新
        </ArcoButton>
        <ArcoButton size="small" status="danger" onClick={onClear} disabled={logs.length === 0}>
          清空记录
        </ArcoButton>
      </div>
    </div>

    {logs.length === 0 ? (
      <div className={`rounded-lg border border-dashed ${theme.cardBorder} ${theme.cardBg} px-4 py-5 text-sm ${theme.subText}`}>
        暂无错误记录。后续接口、配置或同步失败时，会自动记录在这里。
      </div>
    ) : (
      <div className="space-y-3">
        {logs.slice(0, 12).map(log => (
          <article key={log.id} className={`rounded-lg border px-4 py-3 ${severityClass(log.insight.severity)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold">{log.insight.title}</div>
              <div className="text-[11px] opacity-75">{formatLogTime(log.createdAt)}</div>
            </div>
            <div className="mt-1 text-xs font-semibold opacity-80">{log.context}</div>
            <div className="mt-2 rounded-md bg-white/65 px-3 py-2 text-xs leading-5 text-slate-700 dark:bg-black/20 dark:text-slate-200">
              {log.message}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-bold uppercase opacity-70">可能原因</div>
                <div className="mt-1 text-xs leading-5">{log.insight.probableCause}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase opacity-70">处理建议</div>
                <div className="mt-1 text-xs leading-5">{log.insight.suggestedAction}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
);

export default ErrorHistoryPanel;
