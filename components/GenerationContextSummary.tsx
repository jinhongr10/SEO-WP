import React, { useMemo, useState } from 'react';
import { Button, Drawer, Tag } from '@arco-design/web-react';
import type { GenerationContextSummary as GenerationContextSummaryData } from '../types';
import { OverflowText } from './ui';

interface GenerationContextSummaryProps {
  value?: GenerationContextSummaryData | null;
}

const joined = (values: string[]) => values.filter(Boolean).join('、') || '未使用';

export const GenerationContextSummary: React.FC<GenerationContextSummaryProps> = ({ value }) => {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => {
    if (!value) return '';
    return `核心词：${value.coreKeyword || '未填写'} / 词库：${value.keywordCategory || '未使用'} / 规则：${value.appliedRules.length || 0} 条`;
  }, [value]);

  if (!value) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm" data-testid="generation-context-summary">
      <span className="shrink-0 text-gray-500">本次使用：</span>
      <div className="min-w-0 flex-1"><OverflowText strategy="truncate">{summary}</OverflowText></div>
      <Button type="text" size="small" className="shrink-0" onClick={() => setOpen(true)}>查看依据</Button>
      <Drawer title="本次生成依据" visible={open} onCancel={() => setOpen(false)} footer={null}>
        <div className="space-y-4 text-sm">
          <div><strong>核心词：</strong>{value.coreKeyword || '未填写（由 AI 根据目标资料判断）'}</div>
          <div><strong>词库类目：</strong>{value.keywordCategory || '未使用'}</div>
          <div><strong>辅助词：</strong>{joined(value.supportingKeywords)}</div>
          <div><strong>实际用词：</strong>{joined(value.usedKeywords)}</div>
          <div><strong>应用规则：</strong>{joined(value.appliedRules)}</div>
          <div><strong>应用模板：</strong>{joined(value.appliedTemplates)}</div>
          <div>
            <strong>资料来源：</strong>
            <div className="mt-2 flex min-w-0 flex-wrap gap-2">
              {value.sourceArtifacts.length
                ? value.sourceArtifacts.map(item => <Tag key={`${item.kind}:${item.id}`}>{item.title || item.kind}</Tag>)
                : '未使用站点资料'}
            </div>
          </div>
          {!!value.warnings.length && <div><strong>提示：</strong>{joined(value.warnings)}</div>}
        </div>
      </Drawer>
    </div>
  );
};
