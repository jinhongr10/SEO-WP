import type { HTMLAttributes, ReactNode } from 'react';
import { Tag as ArcoTag, Tooltip as ArcoTooltip } from '@arco-design/web-react';
import { cn } from './cn';
import type { BadgeTone } from './Badge';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
  className?: string;
  tone?: BadgeTone;
}

const toneColor: Record<BadgeTone, string | undefined> = {
  neutral: undefined,
  muted: 'gray',
  ai: 'arcoblue',
  success: 'green',
  warning: 'orange',
  danger: 'red',
};

export const StatusPill = ({ children, className, tone = 'neutral', ...props }: StatusPillProps) => {
  const label = typeof children === 'string' || typeof children === 'number' ? String(children) : '';
  const tag = (
    <ArcoTag
      color={toneColor[tone]}
      className={cn('ui-status-pill', tone !== 'neutral' && 'ui-status-pill--' + tone, className)}
      data-overflow-policy="truncate"
      aria-label={props['aria-label'] || label || undefined}
      {...(props as any)}
    >
      {children}
    </ArcoTag>
  );
  return label ? <ArcoTooltip content={label}>{tag}</ArcoTooltip> : tag;
};
