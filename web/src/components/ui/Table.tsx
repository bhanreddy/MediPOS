import React, { createContext, useContext } from "react";

import clsx from "clsx";
import { twMerge } from "tailwind-merge";

const InTableHeader = createContext(false);

// --- NEW PRIMITIVES FOR FLEXIBLE TABLES (PHASE 5+) ---

const TableBase = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="premium-table w-full overflow-x-auto border border-border rounded-lg bg-surface">
    <table
      ref={ref}
      className={twMerge(
        clsx("w-full border-collapse text-left text-sm", className),
      )}
      {...props}
    />
  </div>
));
TableBase.displayName = "TableBase";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <InTableHeader.Provider value={true}><thead
    ref={ref}
    className={twMerge(
      clsx("bg-surface-elevated border-b border-border", className),
    )}
    {...props}
  /></InTableHeader.Provider>
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={twMerge(
      clsx(
        "divide-y divide-border/70 bg-surface text-sm tabular-nums",
        className,
      ),
    )}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={twMerge(
      clsx("hover:bg-bg-primary/50 transition-colors", className),
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const header = useContext(InTableHeader);
  const Cell = header ? 'th' : 'td';
  return <Cell ref={ref} scope={header ? 'col' : undefined}
    className={twMerge(clsx("px-4 py-3 align-middle", className))} {...props} />;
});
TableCell.displayName = "TableCell";

// --- HYBRID TABLE COMPONENT ---

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  headers?: string[];
  data?: any[];
  renderRow?: (item: any, index: number) => React.ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: React.ReactNode;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      headers,
      data,
      renderRow,
      className = "",
      isEmpty,
      emptyMessage = "No records found in this view.",
      children,
      ...props
    },
    ref,
  ) => {
    // If children are provided, act as the primitive wrapper (Phase 5 usage)
    if (children) {
      return (
        <TableBase ref={ref} className={className} {...props}>
          {children}
        </TableBase>
      );
    }

    // Otherwise, act as the legacy monolithic component
    const shouldShowEmpty =
      isEmpty !== undefined ? isEmpty : data?.length === 0;

    return (
      <TableBase ref={ref} className={className} {...props}>
        {headers && (
          <TableHeader>
            <tr>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-xs font-semibold text-muted whitespace-nowrap first:pl-6"
                >
                  {header}
                </th>
              ))}
            </tr>
          </TableHeader>
        )}
        <TableBody>
          {!shouldShowEmpty && data && renderRow ? (
            data.map((item, index) => renderRow(item, index))
          ) : (
            <tr>
              <td
                colSpan={headers?.length || 1}
                className="px-6 py-16 text-center text-sm text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </TableBody>
      </TableBase>
    );
  },
);
Table.displayName = "Table";
