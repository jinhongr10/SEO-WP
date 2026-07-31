import type { ReactNode } from 'react';
import { Button as ArcoButton } from '@arco-design/web-react';
import type { ButtonProps as ArcoButtonProps } from '@arco-design/web-react';
import { cn } from './cn';
import { OverflowText } from './OverflowText';

export interface NavigationCardButtonProps extends Omit<ArcoButtonProps, 'children' | 'type'> {
  count?: ReactNode;
  description: string;
  selected?: boolean;
  title: string;
}

export const NavigationCardButton = ({
  className,
  count,
  description,
  selected = false,
  title,
  ...props
}: NavigationCardButtonProps) => (
  <ArcoButton
    {...props}
    htmlType={props.htmlType || 'button'}
    type="text"
    aria-pressed={selected}
    className={cn('ui-navigation-card', selected && 'ui-navigation-card--selected', className)}
    data-layout-contract="navigation-card"
  >
    <div className="ui-navigation-card__content">
      <div className="ui-navigation-card__copy">
        <OverflowText strategy="wrap" className="ui-navigation-card__title">
          {title}
        </OverflowText>
        <OverflowText
          strategy="truncate"
          rows={2}
          className="ui-navigation-card__description"
          data-navigation-card-description
        >
          {description}
        </OverflowText>
      </div>
      {count !== undefined ? <span className="ui-navigation-card__count">{count}</span> : null}
    </div>
  </ArcoButton>
);
