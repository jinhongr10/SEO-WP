import React, { forwardRef } from 'react';
import type { ChangeEvent, HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Input as ArcoInput, Select as ArcoSelect } from '@arco-design/web-react';
import { cn } from './cn';

export const Field = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-field', className)} {...props} />
);

export const FieldLabel = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('ui-field__label', className)} {...props} />
);

export const FieldHint = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-field__hint', className)} {...props} />
);

const createInputChangeEvent = <T extends HTMLInputElement | HTMLTextAreaElement>(value: string, name?: string) => ({
  target: { value, name },
  currentTarget: { value, name },
}) as unknown as ChangeEvent<T>;

export const createSelectChangeEvent = (value: unknown, name?: string) => ({
  target: { value, name },
  currentTarget: { value, name },
}) as unknown as ChangeEvent<HTMLSelectElement>;

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, onChange, type, name, ...props }, ref) => {
  const inputProps = { ...props } as Record<string, unknown>;
  delete inputProps.size;
  const Component = type === 'password' ? ArcoInput.Password : ArcoInput;
  return (
    <Component
      ref={ref as any}
      className={cn('ui-input', className)}
      name={name}
      type={type === 'password' ? undefined : type}
      onChange={(value: string, event: Event) => onChange?.((event as unknown as ChangeEvent<HTMLInputElement>) || createInputChangeEvent<HTMLInputElement>(value, name))}
      {...(inputProps as any)}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, onChange, name, rows, ...props }, ref) => {
  const textareaProps = { ...props } as Record<string, unknown>;
  delete textareaProps.size;
  return (
    <ArcoInput.TextArea
      ref={ref as any}
      className={cn('ui-textarea', className)}
      name={name}
      rows={rows}
      onChange={(value: string, event: Event) => onChange?.((event as unknown as ChangeEvent<HTMLTextAreaElement>) || createInputChangeEvent<HTMLTextAreaElement>(value, name))}
      {...(textareaProps as any)}
    />
  );
});

type CompatibleSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> & {
  onChange?: SelectHTMLAttributes<HTMLSelectElement>['onChange'];
  size?: SelectHTMLAttributes<HTMLSelectElement>['size'] | 'mini' | 'small' | 'default' | 'large';
  dropdownMenuClassName?: string | string[];
  dropdownMenuStyle?: React.CSSProperties;
  triggerProps?: Record<string, unknown>;
};

const getOptionValue = (value: unknown, label: React.ReactNode) => String(value ?? (typeof label === 'string' || typeof label === 'number' ? label : ''));

export const Select = forwardRef<HTMLSelectElement, CompatibleSelectProps>(({
  className,
  children,
  onChange,
  value,
  defaultValue,
  disabled,
  name,
  placeholder,
  ...props
}, ref) => {
  const options = React.Children.toArray(children)
    .filter(React.isValidElement)
    .map(child => {
      const element = child as React.ReactElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>;
      const label = element.props.children;
      return {
        label,
        value: getOptionValue(element.props.value, label),
        disabled: element.props.disabled,
      };
    });
  const selectProps = { ...props } as Record<string, unknown>;
  delete selectProps.multiple;
  delete selectProps.size;

  return (
    <>
      <ArcoSelect
        ref={ref as any}
        className={cn('ui-select', className)}
        options={options as any}
        value={value as any}
        defaultValue={defaultValue as any}
        disabled={disabled}
        placeholder={placeholder}
        onChange={nextValue => onChange?.(createSelectChangeEvent(nextValue, name))}
        {...(selectProps as any)}
      />
      <select
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={value as any}
        defaultValue={defaultValue as any}
        disabled={disabled}
        onChange={() => undefined}
        className="sr-only ui-select-native-mirror"
      >
        {children}
      </select>
    </>
  );
});
