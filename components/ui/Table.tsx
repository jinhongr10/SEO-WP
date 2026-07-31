import type { CSSProperties, HTMLAttributes, TableHTMLAttributes } from 'react';
import { Table as ArcoTable } from '@arco-design/web-react';
import { cn } from './cn';

export type TableShellProps = HTMLAttributes<HTMLDivElement> & {
  minContentWidth?: number | string;
};

export const TableShell = ({ children, className, minContentWidth, style, ...props }: TableShellProps) => {
  const minWidth = typeof minContentWidth === 'number' ? `${minContentWidth}px` : minContentWidth;
  return (
    <div
      className={cn('ui-table-shell', className)}
      data-layout-contract="table-shell"
      data-overflow-policy="x-scroll"
      style={{ ...style, ...(minWidth ? { '--ui-table-min-width': minWidth } : {}) } as CSSProperties}
      {...props}
    >
      <div className="ui-table-shell__content">
        {children}
      </div>
    </div>
  );
};

type CompatibleTableProps = TableHTMLAttributes<HTMLTableElement> & {
  columns?: any[];
  data?: any[];
  rowKey?: string | ((record: any) => string);
  loading?: boolean;
  pagination?: any;
};

export const Table = ({ className, columns, data, rowKey, loading, pagination, children, ...props }: CompatibleTableProps) => {
  if (columns || data) {
    return (
      <ArcoTable
        className={cn('ui-table', className)}
        columns={columns || []}
        data={data || []}
        rowKey={rowKey as any}
        loading={loading}
        pagination={pagination === undefined ? false : pagination}
        {...(props as any)}
      />
    );
  }

  return <table className={cn('ui-table', className)} {...props}>{children}</table>;
};
