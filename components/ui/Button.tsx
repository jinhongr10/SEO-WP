import { Button as ArcoButton } from '@arco-design/web-react';
import type { ButtonProps as ArcoButtonProps } from '@arco-design/web-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'ai' | 'success' | 'warning' | 'danger' | 'neutral' | 'outline' | 'ghost';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

type NativeButtonType = 'button' | 'submit' | 'reset';

export interface ButtonProps extends Omit<ArcoButtonProps, 'htmlType' | 'size' | 'status' | 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: NativeButtonType;
}

const mapButtonVariant = (variant: ButtonVariant): Pick<ArcoButtonProps, 'type' | 'status'> => {
  if (variant === 'primary' || variant === 'ai') return { type: 'primary' };
  if (variant === 'success') return { type: 'primary', status: 'success' };
  if (variant === 'warning') return { type: 'primary', status: 'warning' };
  if (variant === 'danger') return { type: 'primary', status: 'danger' };
  if (variant === 'outline') return { type: 'outline' };
  if (variant === 'ghost') return { type: 'text' };
  return { type: 'secondary' };
};

const mapButtonSize = (size: ButtonSize): ArcoButtonProps['size'] => {
  if (size === 'xs') return 'mini';
  if (size === 'sm') return 'small';
  if (size === 'lg') return 'large';
  return 'default';
};

export const Button = ({
  className,
  variant = 'neutral',
  size = 'md',
  type = 'button',
  children,
  ...props
}: ButtonProps) => {
  const visual = mapButtonVariant(variant);
  return (
    <ArcoButton
      htmlType={type}
      type={visual.type}
      status={visual.status}
      size={mapButtonSize(size)}
      iconOnly={size === 'icon'}
      className={cn('ui-button', 'ui-button--' + variant, size !== 'md' && 'ui-button--' + size, className)}
      {...props}
    >
      {children}
    </ArcoButton>
  );
};
