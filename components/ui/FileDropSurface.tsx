import React, { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { IconUpload } from '@arco-design/web-react/icon';
import { cn } from './cn';

const matchesAcceptRule = (file: File, rule: string) => {
  const normalizedRule = rule.trim().toLowerCase();
  if (!normalizedRule) return false;
  if (normalizedRule.startsWith('.')) {
    return file.name.toLowerCase().endsWith(normalizedRule);
  }
  const fileType = String(file.type || '').toLowerCase();
  if (normalizedRule.endsWith('/*')) {
    return fileType.startsWith(normalizedRule.slice(0, -1));
  }
  return Boolean(fileType) && fileType === normalizedRule;
};

export const selectAcceptedDropFiles = (
  files: File[],
  accept?: string,
  multiple = true,
) => {
  const rules = String(accept || '')
    .split(',')
    .map(rule => rule.trim())
    .filter(Boolean);
  const acceptedFiles = rules.length
    ? files.filter(file => rules.some(rule => matchesAcceptRule(file, rule)))
    : files;
  return multiple ? acceptedFiles : acceptedFiles.slice(0, 1);
};

const hasFilePayload = (event: React.DragEvent<HTMLDivElement>) => {
  const items = Array.from(event.dataTransfer?.items ?? []) as DataTransferItem[];
  if (items.some(item => item.kind === 'file')) return true;
  return Array.from(event.dataTransfer?.types || []).includes('Files');
};

export type FileDropSurfaceProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDrop'
> & {
  accept?: string;
  activeLabel: ReactNode;
  disabled?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
};

export const FileDropSurface = ({
  accept,
  activeLabel,
  children,
  className,
  disabled = false,
  multiple = true,
  onFiles,
  ...props
}: FileDropSurfaceProps) => {
  const dragDepthRef = useRef(0);
  const [dropActive, setDropActive] = useState(false);

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setDropActive(false);
  };

  useEffect(() => {
    if (disabled) resetDragState();
  }, [disabled]);

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current += 1;
    setDropActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event) || disabled) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDropActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    const files = selectAcceptedDropFiles(
      Array.from(event.dataTransfer?.files || []),
      accept,
      multiple,
    );
    resetDragState();
    if (!disabled && files.length) onFiles(files);
  };

  return (
    <div
      {...props}
      className={cn('ui-file-drop-surface', className)}
      data-drop-active={dropActive ? 'true' : 'false'}
      data-drop-disabled={disabled ? 'true' : 'false'}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      <div
        className="ui-file-drop-surface__overlay"
        aria-hidden={dropActive ? undefined : true}
        role={dropActive ? 'status' : undefined}
      >
        <span className="ui-file-drop-surface__icon"><IconUpload /></span>
        <span className="ui-file-drop-surface__label">{activeLabel}</span>
        <span className="ui-file-drop-surface__hint">松开即可添加文件</span>
      </div>
    </div>
  );
};
