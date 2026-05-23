"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Loader2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TableCell,
  TableRow,
  TableStatusIndicator,
  TableSurface,
} from "@/components/ui/table";
import { TableRightActionsButton } from "@/components/admin/layout/content/table-right-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/tailwind";
import type { AdminSortDirection } from "./hooks";

type AdminTableStatus = {
  tone: "error" | "success";
  text: string;
};

export function AdminTableShell({
  children,
  className,
  controls,
  count,
  footer,
  icon,
  onClearSelection,
  selectedCount = 0,
  status,
  title,
  titleActions,
}: {
  children: ReactNode;
  className?: string;
  controls?: ReactNode;
  count: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  onClearSelection?: () => void;
  selectedCount?: number;
  status?: AdminTableStatus | null;
  title: ReactNode;
  titleActions?: ReactNode;
}) {
  return (
    <TableSurface className={className}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
          {icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
              {icon}
            </span>
          ) : null}
          <span className="text-sm font-medium sm:text-base">{title}</span>
          <Badge variant="secondary">{count}</Badge>
          {selectedCount > 0 && onClearSelection ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={onClearSelection}
            >
              Clear {selectedCount} selected
            </button>
          ) : null}
          {status ? (
            <TableStatusIndicator tone={status.tone}>
              {status.text}
            </TableStatusIndicator>
          ) : null}
          {titleActions ? <div className="ml-auto">{titleActions}</div> : null}
        </div>
        {controls}
      </div>
      {children}
      {footer ?? <AdminTableFooterSkeleton />}
    </TableSurface>
  );
}

export function AdminSortButton({
  active,
  children,
  className,
  direction,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  direction: AdminSortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 px-0 text-xs font-medium text-foreground outline-none transition-colors hover:text-foreground sm:text-sm",
        className,
      )}
    >
      <span>{children}</span>
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        {!active ? (
          <ChevronsUpDown className="size-3 opacity-50" />
        ) : direction === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )}
      </span>
    </button>
  );
}

export function AdminBulkDeleteButton({
  deleting,
  onClick,
  selectedCount,
}: {
  deleting: boolean;
  onClick: () => void;
  selectedCount: number;
}) {
  if (selectedCount === 0) return null;

  return (
    <TableRightActionsButton
      type="button"
      variant="destructive"
      className="bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40"
      onClick={onClick}
      disabled={deleting}
    >
      {deleting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      Delete ({selectedCount})
    </TableRightActionsButton>
  );
}

export function AdminSelectionBanner({
  allSelected,
  allSelectedMessage,
  itemLabelPlural = "items",
  onClearSelection,
  onSelectAll,
  selectAllLabel,
  selectedCount,
  total,
  visibleCount,
}: {
  allSelected: boolean;
  allSelectedMessage?: ReactNode;
  itemLabelPlural?: string;
  onClearSelection: () => void;
  onSelectAll: () => void;
  selectAllLabel?: ReactNode;
  selectedCount: number;
  total: number;
  visibleCount: number;
}) {
  if (
    visibleCount === 0 ||
    total <= visibleCount ||
    (!allSelected && selectedCount !== visibleCount)
  ) {
    return null;
  }

  return (
    <CardSection className="border-b bg-accent/50 text-center text-sm">
      {allSelected ? (
        <span>
          {allSelectedMessage || (
            <>
              All {total} {itemLabelPlural} selected.
            </>
          )}{" "}
          <button
            type="button"
            onClick={onClearSelection}
            className="text-muted-foreground underline hover:text-foreground"
          >
            Clear selection
          </button>
        </span>
      ) : (
        <span>
          {visibleCount} {itemLabelPlural} on this page are selected.{" "}
          <button
            type="button"
            onClick={onSelectAll}
            className="font-medium underline"
          >
            {selectAllLabel || <>Select all {total}</>}
          </button>
        </span>
      )}
    </CardSection>
  );
}

export function AdminListSkeleton({
  columns = 6,
  actionCount = 2,
  rowCount = 5,
  showCheckbox = true,
  showThumbnail = true,
}: {
  actionCount?: number;
  columns?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  rowCount?: number;
  showCheckbox?: boolean;
  showThumbnail?: boolean;
}) {
  const hasActionColumn = actionCount > 0;
  const middleColumnCount = Math.max(
    0,
    columns - (showCheckbox ? 1 : 0) - 1 - (hasActionColumn ? 1 : 0),
  );

  return (
    <>
      {Array.from({ length: rowCount }, (_, index) => (
        <TableRow key={index}>
          {showCheckbox && (
            <TableCell column="select">
              <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            </TableCell>
          )}
          <TableCell column="main">
            <div className="flex items-center space-x-4">
              {showThumbnail && (
                <div className="h-10 w-10 animate-pulse rounded bg-muted" />
              )}
              <div>
                <div className="mb-2 h-4 w-36 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
              </div>
            </div>
          </TableCell>
          {Array.from({ length: middleColumnCount }, (_, columnIndex) => (
            <TableCell
              key={columnIndex}
              column={columnIndex === 0 ? "meta" : "mutedMeta"}
            >
              <div
                className={cn(
                  "animate-pulse rounded bg-muted",
                  columnIndex === 0 ? "h-5 w-16 rounded-full" : "h-4 w-20",
                )}
              />
            </TableCell>
          ))}
          {hasActionColumn && (
            <TableCell column="meta">
              <div className="flex items-center space-x-1">
                {Array.from({ length: actionCount }, (_, actionIndex) => (
                  <div
                    key={actionIndex}
                    className="h-8 w-8 animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            </TableCell>
          )}
        </TableRow>
      ))}
    </>
  );
}

export function AdminListFooter({
  currentPage,
  onPageChange,
  onPageSizeChange,
  pageSize,
  total,
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const safeTotalPages = totalPages || 1;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));
  const start = total ? (safeCurrentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(safeCurrentPage * pageSize, total);
  const pageSizeOptions = [10, 25, 50].includes(pageSize)
    ? [10, 25, 50]
    : [pageSize, 10, 25, 50].sort((a, b) => a - b);

  return (
    <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span className="hidden sm:inline">Rows per page:</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => onPageSizeChange?.(Number(value))}
          disabled={!onPageSizeChange}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          {start ? `${start}-${end}` : "0"} of {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage === 1}
          aria-label="Go to first page"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(Math.max(safeCurrentPage - 1, 1))}
          disabled={safeCurrentPage === 1}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(Math.min(safeCurrentPage + 1, safeTotalPages))}
          disabled={safeCurrentPage === safeTotalPages || total === 0}
          aria-label="Go to next page"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={safeCurrentPage === safeTotalPages || total === 0}
          aria-label="Go to last page"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AdminTableFooterSkeleton() {
  return (
    <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
      <div className="flex items-center gap-2">
        <Skeleton className="hidden h-4 w-24 sm:block" />
        <Skeleton className="h-8 w-[70px]" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex items-center gap-1">
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
      </div>
    </div>
  );
}

export function AdminTableSummaryFooter({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <div className="bg-muted/50 p-4 text-xs text-muted-foreground sm:text-sm">
      {count} {label}
    </div>
  );
}

export function AdminConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  confirmVariant = "destructive",
  description,
  disabled = false,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
  description: ReactNode;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} variant="outline" disabled={disabled}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            variant={confirmVariant}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminErrorDialog({
  message,
  onOpenChange,
  open,
}: {
  message: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Error</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
  return `${Math.ceil(diffDays / 30)} months ago`;
}
