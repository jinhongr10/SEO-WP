import type { HTMLAttributes, ReactNode } from 'react';
import { Tag as ArcoTag, Tooltip as ArcoTooltip } from '@arco-design/web-react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'muted' | 'ai' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
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

export const Badge = ({ children, className, tone = 'neutral', ...props }: BadgeProps) => {
  const label = typeof children === 'string' || typeof children === 'number' ? String(children) : '';
  const tag = (
    <ArcoTag
      color={toneColor[tone]}
      className={cn('ui-badge', tone !== 'neutral' && 'ui-badge--' + tone, className)}
      data-overflow-policy="truncate"
      aria-label={props['aria-label'] || label || undefined}
      {...(props as any)}
    >
      {children}
    </ArcoTag>
  );
  return label ? <ArcoTooltip content={label}>{tag}</ArcoTooltip> : tag;
};
