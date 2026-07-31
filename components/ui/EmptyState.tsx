import type { HTMLAttributes, ReactNode } from 'react';
import { Empty as ArcoEmpty } from '@arco-design/web-react';
import { cn } from './cn';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

export const EmptyState = ({ className, title, body, action, ...props }: EmptyStateProps) => (
  <div className={cn('ui-empty', className)} {...props}>
    <ArcoEmpty
      description={(
        <span>
          <span className="ui-empty__title">{title}</span>
          {body && <span className="ui-empty__body mt-2 block">{body}</span>}
        </span>
      )}
    >
      {action}
    </ArcoEmpty>
  </div>
);
