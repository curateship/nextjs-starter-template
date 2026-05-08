"use client"

import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { cn } from "@/lib/utils/tailwind"
import type { AdminSortDirection } from "./hooks"

export function AdminSortButton({
  active,
  children,
  className,
  direction,
  onClick,
}: {
  active: boolean
  children: ReactNode
  className?: string
  direction: AdminSortDirection
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground outline-none transition-colors hover:text-foreground",
        className
      )}
    >
      <span>{children}</span>
      <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">
        {!active ? <ChevronsUpDown className="h-3 w-3 opacity-70" /> : direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </span>
    </button>
  )
}

export function AdminBulkDeleteButton({
  deleting,
  onClick,
  selectedCount,
}: {
  deleting: boolean
  onClick: () => void
  selectedCount: number
}) {
  if (selectedCount === 0) return null

  return (
    <Button variant="destructive" onClick={onClick} disabled={deleting}>
      {deleting ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
          <span className="hidden sm:inline">Deleting...</span>
        </>
      ) : (
        <>
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Delete ({selectedCount})</span>
        </>
      )}
    </Button>
  )
}

export function AdminSelectionBanner({
  allSelected,
  onClearSelection,
  onSelectAll,
  selectedCount,
  total,
  visibleCount,
}: {
  allSelected: boolean
  onClearSelection: () => void
  onSelectAll: () => void
  selectedCount: number
  total: number
  visibleCount: number
}) {
  if (visibleCount === 0 || total <= visibleCount || (!allSelected && selectedCount !== visibleCount)) {
    return null
  }

  return (
    <div className="border-b bg-accent/50 px-6 py-2 text-center text-sm">
      {allSelected ? (
        <span>
          All {total} items selected.{" "}
          <button type="button" onClick={onClearSelection} className="text-muted-foreground underline hover:text-foreground">
            Clear selection
          </button>
        </span>
      ) : (
        <span>
          {visibleCount} items on this page are selected.{" "}
          <button type="button" onClick={onSelectAll} className="font-medium underline">
            Select all {total}
          </button>
        </span>
      )}
    </div>
  )
}

export function AdminListSkeleton({
  columns = 6,
  firstColumnClassName,
  firstColumnSpan = 2,
  rowCount = 5,
  showThumbnail = true,
}: {
  columns?: 5 | 6 | 7 | 8 | 9
  firstColumnClassName?: string
  firstColumnSpan?: 1 | 2 | 3 | 4
  rowCount?: number
  showThumbnail?: boolean
}) {
  const gridClassName = {
    5: "grid-cols-5",
    6: "grid-cols-6",
    7: "grid-cols-7",
    8: "grid-cols-8",
    9: "grid-cols-9",
  }[columns]
  const firstColumnSpanClassName = {
    1: "col-span-1",
    2: "col-span-2",
    3: "col-span-3",
    4: "col-span-4",
  }[firstColumnSpan]
  const middleColumnCount = Math.max(0, columns - firstColumnSpan - 1)

  return (
    <div className="space-y-0">
      {Array.from({ length: rowCount }, (_, index) => (
        <div key={index} className="border-b border-muted/80 p-6">
          <div className={cn("grid items-center gap-4", gridClassName)}>
            <div className={firstColumnSpanClassName}>
              <div className={cn("flex items-center space-x-4", firstColumnClassName)}>
                <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                {showThumbnail && <div className="ml-2 h-12 w-12 animate-pulse rounded bg-muted" />}
                <div>
                  <div className="mb-2 h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
                </div>
              </div>
            </div>
            {Array.from({ length: middleColumnCount }, (_, columnIndex) => (
              <div key={columnIndex}>
                <div className={cn("animate-pulse rounded bg-muted/60", columnIndex === 0 ? "h-5 w-16 rounded-full" : "h-3 w-16")} />
              </div>
            ))}
            <div>
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                <div className="h-8 w-8 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AdminListFooter({
  currentPage,
  onPageChange,
  pageSize,
  total,
}: {
  currentPage: number
  onPageChange: (page: number) => void
  pageSize: number
  total: number
}) {
  if (total <= 0) return null

  return (
    <div className="flex items-center justify-between border-t px-6 py-4">
      <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
      <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={onPageChange} showFirstLast={false} />
    </div>
  )
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
  cancelLabel?: string
  confirmLabel?: string
  confirmVariant?: "default" | "destructive"
  description: ReactNode
  disabled?: boolean
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: ReactNode
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
          <Button onClick={onConfirm} variant={confirmVariant} disabled={disabled}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdminErrorDialog({
  message,
  onOpenChange,
  open,
}: {
  message: string
  onOpenChange: (open: boolean) => void
  open: boolean
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
  )
}

export function formatRelativeDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 1) return "1 day ago"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
  return `${Math.ceil(diffDays / 30)} months ago`
}
