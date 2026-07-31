import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  actions?: ReactNode;
  children?: ReactNode;
  start?: ReactNode;
}

export const Toolbar = ({ actions, children, className, start, ...props }: ToolbarProps) => (
  <div className={cn('ui-toolbar', className)} data-layout-contract="toolbar" {...props}>
    <div className="ui-toolbar__start">{start ?? children}</div>
    {actions ? <div className="ui-toolbar__actions">{actions}</div> : null}
  </div>
);
