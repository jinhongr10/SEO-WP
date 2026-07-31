import type { HTMLAttributes } from 'react';
import { Card as ArcoCard } from '@arco-design/web-react';
import { cn } from './cn';

export const Panel = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <ArcoCard className={cn('ui-panel', className)} bordered bodyStyle={{ padding: 0 }} {...(props as any)} />
);

export const PanelHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-panel__header', className)} {...props} />
);

export const PanelHeaderActions = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-panel__header-actions', className)} data-layout-contract="action-group" {...props} />
);

export const PanelContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-panel__content', className)} {...props} />
);

export const PanelTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('ui-panel__title', className)} {...props} />
);

export const PanelDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('ui-panel__description', className)} {...props} />
);
