import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from './cn';

export type ActionGroupProps = HTMLAttributes<HTMLDivElement> & {
  minItemWidth?: number | string;
};

export const ActionGroup = ({ className, minItemWidth, style, ...props }: ActionGroupProps) => {
  const minWidth = typeof minItemWidth === 'number' ? `${minItemWidth}px` : minItemWidth;
  return (
    <div
      className={cn('ui-action-group', className)}
      data-layout-contract="action-group"
      style={{ ...style, ...(minWidth ? { '--ui-action-min-width': minWidth } : {}) } as CSSProperties}
      {...props}
    />
  );
};
