"use client";

import { useState, type ReactNode } from "react";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js"
import ChevronsLeft from "lucide-react/dist/esm/icons/chevrons-left.js"
import ChevronsRight from "lucide-react/dist/esm/icons/chevrons-right.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/shared/card-sections";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { AdminLoading } from "@/components/admin/layout/loading";
import {
  TableCell,
  TableRow,
  TableSortButton,
  TableSurface,
} from "@/components/ui/table";
import { TableRightActionsButton } from "@/components/admin/layout/content/table-right-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions";
import { cn } from "@/lib/utils/tailwind";
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider";
import { showActionError } from "@/lib/utils/admin-action-feedback";
import type { AdminSortDirection } from "./hooks";

type AdminTableStatus = {
  tone: "error" | "success";
  text: string;
};

// Directory-only status chip (moved out of ui/table.tsx so that file stays
// byte-aligned with custom-shell). Color tokens are revisited in task 10.
function TableStatusIndicator({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <span
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-2 py-1 text-xs",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
    >
      {children}
    </span>
  );
}

export function AdminTableShell({
  children,
  className,
  controls,
  count,
  error,
  footer,
  icon,
  loading = false,
  onClearSelection,
  selectedCount = 0,
  status,
  title,
  titleActions,
  titleMeta,
}: {
  children: ReactNode;
  className?: string;
  controls?: ReactNode;
  count: number;
  error?: { message: string; onRetry?: () => void } | null;
  footer?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  onClearSelection?: () => void;
  selectedCount?: number;
  status?: AdminTableStatus | null;
  title: ReactNode;
  titleActions?: ReactNode;
  titleMeta?: ReactNode;
}) {
  return (
    <TableSurface className={className} aria-busy={loading}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
          {icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8 [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <span className="text-sm font-medium sm:text-base">{title}</span>
          <Badge variant="secondary">{count}</Badge>
          {status ? (
            <TableStatusIndicator tone={status.tone}>
              {status.text}
            </TableStatusIndicator>
          ) : null}
          {titleMeta}
          {selectedCount > 0 && onClearSelection ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={onClearSelection}
            >
              Clear {selectedCount} selected
            </button>
          ) : null}
          {titleActions ? <div className="ml-auto">{titleActions}</div> : null}
        </div>
        {controls}
      </div>
      {error ? <ErrorBanner message={error.message} onRetry={error.onRetry} /> : null}
      {children}
      {footer}
    </TableSurface>
  );
}

// Thin wrapper over the shared TableSortButton so every table sorts (and looks)
// identically; kept for its established prop shape across the admin screens.
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
    <TableSortButton
      active={active}
      direction={direction}
      onClick={onClick}
      className={className}
    >
      {children}
    </TableSortButton>
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

export function AdminListPending() {
  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell colSpan={100} className="border-0 p-0">
        <AdminLoading />
      </TableCell>
    </TableRow>
  );
}

/**
 * A list that pages by remembering the last row it showed rather than by
 * counting how many rows to skip. It can step one page forward or back, but it
 * cannot jump straight to the last page, so those two arrows stay disabled.
 * Passing this keeps such a list on the same footer as every other list instead
 * of giving it its own pair of Previous/Next buttons.
 */
type AdminListCursor = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
};

export function AdminListFooter({
  cursor,
  currentPage,
  onPageChange,
  onPageSizeChange,
  pageSize,
  total,
}: {
  cursor?: AdminListCursor;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSize: number;
  total: number;
}) {
  const { setPageSize: setContextPageSize } = useSiteSwitcher();
  const [isSavingPageSize, setIsSavingPageSize] = useState(false);
  const totalPages = Math.ceil(total / pageSize);
  const safeTotalPages = totalPages || 1;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));
  const start = total ? (safeCurrentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(safeCurrentPage * pageSize, total);
  const pageSizeOptions = [25, 50, 100].includes(pageSize)
    ? [25, 50, 100]
    : [pageSize, 25, 50, 100].sort((a, b) => a - b);

  const handlePageSizeChange = async (value: string) => {
    const nextPageSize = Number(value);
    setContextPageSize(nextPageSize);
    onPageSizeChange?.(nextPageSize);
    onPageChange(1);

    setIsSavingPageSize(true);
    const result = await updateAdminSettingsAction({ dashboard_page_size: nextPageSize });
    setIsSavingPageSize(false);

    if (result.error) {
      showActionError(`Failed to save rows per page: ${result.error}`);
    }
  };

  return (
    <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span className="hidden sm:inline">Rows per page:</span>
        <Select
          value={pageSize.toString()}
          onValueChange={handlePageSizeChange}
          disabled={isSavingPageSize}
        >
          <SelectTrigger className="h-8">
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
          disabled={Boolean(cursor) || safeCurrentPage === 1}
          aria-label="Go to first page"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() =>
            cursor ? cursor.onPreviousPage() : onPageChange(Math.max(safeCurrentPage - 1, 1))
          }
          disabled={cursor ? !cursor.hasPreviousPage : safeCurrentPage === 1}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() =>
            cursor ? cursor.onNextPage() : onPageChange(Math.min(safeCurrentPage + 1, safeTotalPages))
          }
          disabled={
            cursor ? !cursor.hasNextPage : safeCurrentPage === safeTotalPages || total === 0
          }
          aria-label="Go to next page"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={Boolean(cursor) || safeCurrentPage === safeTotalPages || total === 0}
          aria-label="Go to last page"
        >
          <ChevronsRight className="size-4" />
        </Button>
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
