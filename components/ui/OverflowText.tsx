import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Tooltip as ArcoTooltip } from '@arco-design/web-react';
import { cn } from './cn';

export type OverflowTextStrategy = 'wrap' | 'truncate' | 'break-anywhere';

export type OverflowTextProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  strategy?: OverflowTextStrategy;
  rows?: number;
  tooltip?: boolean;
};

const textValue = (value: ReactNode) => (
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''
);

export const OverflowText = ({
  children,
  className,
  strategy = 'wrap',
  rows = 1,
  style,
  tooltip = true,
  ...props
}: OverflowTextProps) => {
  const label = textValue(children);
  const overflowPolicy = strategy === 'truncate' ? 'truncate' : undefined;
  const mergedStyle = {
    ...style,
    ...(strategy === 'truncate' ? { '--ui-overflow-rows': Math.max(1, rows) } : {}),
  } as CSSProperties;
  const node = (
    <span
      className={cn('ui-overflow-text', `ui-overflow-text--${strategy}`, className)}
      data-layout-contract={`text-${strategy}`}
      data-overflow-policy={overflowPolicy}
      aria-label={props['aria-label'] || (strategy === 'truncate' && label ? label : undefined)}
      style={mergedStyle}
      {...props}
    >
      {children}
    </span>
  );

  if (strategy !== 'truncate' || !tooltip || !label) return node;
  return <ArcoTooltip content={label}>{node}</ArcoTooltip>;
};
