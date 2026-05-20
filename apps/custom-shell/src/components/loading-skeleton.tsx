import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"

export function ShellLoadingSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 border-r p-4 md:block">
        <Skeleton className="mb-6 h-8 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-4">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </div>
  )
}

export function LoginLoadingSkeleton() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="mb-6 h-4 w-40" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  )
}

type TableRowsSkeletonColumn = {
  cellClassName?: string
  skeletonClassName: string
}

export function TableRowsSkeleton({
  columns,
  rows = 6,
}: {
  columns: TableRowsSkeletonColumn[]
  rows?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow key={index}>
          {columns.map((column, columnIndex) => (
            <TableCell key={columnIndex} className={column.cellClassName}>
              <Skeleton className={column.skeletonClassName} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function MediaGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="aspect-square w-full" />
      ))}
    </div>
  )
}
