import React from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { Button as ArcoButton, Tabs as ArcoTabs } from '@arco-design/web-react';
import { cn } from './cn';

export const TabsList = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => {
  const tabChildren = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<TabButtonProps>[];
  if (!tabChildren.length) {
    return <div className={cn('ui-tabs-list', className)} role={props.role || 'tablist'} {...props}>{children}</div>;
  }

  const activeIndex = Math.max(0, tabChildren.findIndex(child => child.props.selected));
  return (
    <ArcoTabs
      className={cn('ui-tabs-list', className)}
      data-layout-contract="tabs"
      data-overflow-policy="x-scroll"
      activeTab={String(activeIndex)}
      type="rounded"
      size="small"
      overflow="scroll"
      scrollPosition="auto"
      onChange={key => tabChildren[Number(key)]?.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>)}
      {...(props as any)}
    >
      {tabChildren.map((child, index) => (
        <ArcoTabs.TabPane
          key={String(index)}
          title={(
            <span data-testid={child.props['data-testid']} className="ui-tab__title">
              {child.props.children}
            </span>
          )}
        />
      ))}
    </ArcoTabs>
  );
};

export interface TabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  className?: string;
  key?: React.Key;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  selected?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
}

export const TabButton = ({ className, selected = false, type = 'button', children, ...props }: TabButtonProps) => (
  <ArcoButton
    htmlType={type}
    role="tab"
    aria-selected={selected}
    type={selected ? 'primary' : 'text'}
    size="small"
    className={cn('ui-tab', className)}
    {...(props as any)}
  >
    {children}
  </ArcoButton>
);
