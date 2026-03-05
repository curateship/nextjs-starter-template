"use client";

import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  type Table as ReactTable,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsUpDown,
  MoreHorizontal,
} from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TransactionStatus =
  | "posted"
  | "pending"
  | "review"
  | "excluded"
  | "completed";

type Transaction = {
  id: string;
  date: string;
  name: string;
  description: string;
  amount: number;
  taxAmount: number;
  category: string;
  counterparty: string;
  tags: string[];
  account: string;
  method: string;
  assigned: string | null;
  status: TransactionStatus;
};

type ColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
};

type UseTableScrollOptions = {
  scrollAmount?: number;
  useColumnWidths?: boolean;
  startFromColumn?: number;
};

type UseStickyColumnsOptions<TData> = {
  table?: ReactTable<TData>;
};

type HorizontalPaginationProps = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  className?: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatDate = (value: string) => dateFormatter.format(new Date(value));

const statusLabels: Record<TransactionStatus, string> = {
  posted: "Posted",
  pending: "Pending",
  review: "Needs review",
  excluded: "Excluded",
  completed: "Completed",
};

const statusStyles: Record<TransactionStatus, string> = {
  posted:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  pending:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10",
  review:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10",
  excluded:
    "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10",
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
};

const transactions: Transaction[] = [
  {
    id: "txn-2082",
    date: "2024-05-14",
    name: "Stripe payout",
    description: "Subscription revenue for April cycle",
    amount: 14825.32,
    taxAmount: 0,
    category: "Revenue",
    counterparty: "Stripe Payments",
    tags: ["Subscriptions", "Recurring"],
    account: "Founders Checking · 0421",
    method: "Transfer",
    assigned: "Hannah Lee",
    status: "posted",
  },
  {
    id: "txn-2081",
    date: "2024-05-13",
    name: "Linear",
    description: "Workspace subscription for product team",
    amount: -320,
    taxAmount: 26.4,
    category: "Software",
    counterparty: "Linear HQ",
    tags: ["Product", "SaaS"],
    account: "Capital One · 5522",
    method: "Card",
    assigned: "Marcus Lin",
    status: "pending",
  },
  {
    id: "txn-2080",
    date: "2024-05-12",
    name: "Mercury FX",
    description: "USD → EUR conversion for Berlin invoices",
    amount: -184.35,
    taxAmount: 0,
    category: "Banking fees",
    counterparty: "Mercury Bank",
    tags: ["International"],
    account: "Treasury · 1189",
    method: "Wire",
    assigned: "Noah Patel",
    status: "review",
  },
  {
    id: "txn-2079",
    date: "2024-05-10",
    name: "Gusto Payroll",
    description: "Cycle #42 · engineering + marketing",
    amount: -48600,
    taxAmount: 8123.45,
    category: "Payroll",
    counterparty: "Gusto",
    tags: ["Payroll", "US"],
    account: "Operating · 7730",
    method: "ACH",
    assigned: null,
    status: "completed",
  },
  {
    id: "txn-2078",
    date: "2024-05-09",
    name: "AWS",
    description: "April usage across edge + inference clusters",
    amount: -9832.11,
    taxAmount: 0,
    category: "Infrastructure",
    counterparty: "Amazon Web Services",
    tags: ["Infra", "Usage"],
    account: "Treasury · 1189",
    method: "Transfer",
    assigned: "Hannah Lee",
    status: "posted",
  },
  {
    id: "txn-2077",
    date: "2024-05-08",
    name: "Ramp",
    description: "Team offsite flights + hotels",
    amount: -6120.88,
    taxAmount: 531.83,
    category: "Travel",
    counterparty: "Ramp Corporate",
    tags: ["Offsite", "Q2"],
    account: "Capital One · 5522",
    method: "Card",
    assigned: "Isabella Cho",
    status: "review",
  },
  {
    id: "txn-2076",
    date: "2024-05-07",
    name: "Notion",
    description: "Enterprise plan for GTM org",
    amount: -850,
    taxAmount: 72.25,
    category: "Software",
    counterparty: "Notion Labs",
    tags: ["GTM", "Contract"],
    account: "Operating · 7730",
    method: "Card",
    assigned: null,
    status: "pending",
  },
  {
    id: "txn-2075",
    date: "2024-05-06",
    name: "Manual adjustment",
    description: "Reconciled hardware swap",
    amount: 0,
    taxAmount: 0,
    category: "Reconciliation",
    counterparty: "Internal",
    tags: [],
    account: "Founders Checking · 0421",
    method: "Manual",
    assigned: "Marcus Lin",
    status: "excluded",
  },
];

const columns: ColumnDef<Transaction>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: {
      width: 48,
      minWidth: 48,
      headerClassName:
        "!px-0 !border-r-0",
      cellClassName:
        "!px-0 !border-r-0",
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium text-foreground">
          {formatDate(row.original.date)}
        </span>
        <span className="text-xs text-muted-foreground">{row.original.id}</span>
      </div>
    ),
    meta: {
      width: 140,
      minWidth: 140,
      headerClassName:
        "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
      cellClassName:
        "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
    cell: ({ row }) => (
      <div className="relative flex flex-col gap-1">
        <span className="font-medium text-foreground">{row.original.name}</span>
        <span className="text-[0.8125rem] text-muted-foreground">
          {row.original.description}
        </span>
      </div>
    ),
    meta: {
      width: 320,
      minWidth: 320,
      headerClassName:
        "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[0.5px] after:bg-border/60",
      cellClassName:
        "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[0.5px] after:bg-border/60",
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Amount" />
    ),
    cell: ({ row }) => (
      <span
        className={cn(
          "font-semibold",
          row.original.amount > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground",
        )}
      >
        {formatCurrency(row.original.amount)}
      </span>
    ),
    meta: {
      width: 150,
      minWidth: 150,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "taxAmount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tax" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.taxAmount ? formatCurrency(row.original.taxAmount) : "—"}
      </span>
    ),
    meta: {
      width: 130,
      minWidth: 130,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className="font-medium">
        {row.original.category}
      </Badge>
    ),
    meta: {
      width: 200,
      minWidth: 200,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "counterparty",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="From / To" />
    ),
    cell: ({ row }) => (
      <div>
        <p className="text-[0.8125rem] font-medium">
          {row.original.counterparty}
        </p>
        <p className="text-xs text-muted-foreground">{row.original.method}</p>
      </div>
    ),
    meta: {
      width: 220,
      minWidth: 220,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "tags",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tags" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-2">
        {row.original.tags.length ? (
          row.original.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="rounded-full">
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
      </div>
    ),
    enableSorting: false,
    meta: {
      width: 260,
      minWidth: 260,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "account",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Account" />
    ),
    cell: ({ row }) => <span>{row.original.account}</span>,
    meta: {
      width: 220,
      minWidth: 220,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "method",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Method" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.original.method}
      </Badge>
    ),
    meta: {
      width: 160,
      minWidth: 160,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "assigned",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Assigned" />
    ),
    cell: ({ row }) =>
      row.original.assigned ? (
        <span className="font-medium">{row.original.assigned}</span>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Unassigned
        </Badge>
      ),
    meta: {
      width: 200,
      minWidth: 200,
    } satisfies ColumnMeta,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className={statusStyles[row.original.status]}>
        {statusLabels[row.original.status]}
      </Badge>
    ),
    meta: {
      width: 160,
      minWidth: 160,
    } satisfies ColumnMeta,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: () => (
      <div className="flex items-center justify-center">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: {
      width: 48,
      minWidth: 48,
      headerClassName:
        "!px-0 md:sticky md:right-0 z-20 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
      cellClassName:
        "!px-0 md:sticky md:right-0 z-20 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
    } satisfies ColumnMeta,
  },
];

function useStickyColumns<TData>({ table }: UseStickyColumnsOptions<TData>) {
  const isVisible = React.useCallback(
    (id: string) =>
      table
        ?.getAllLeafColumns()
        .some((column) => column.id === id && column.getIsVisible()) ?? true,
    [table],
  );

  const stickyPositions = React.useMemo(() => {
    let position = 0;
    const positions: Record<string, number> = {};

    positions.select = position;
    position += 48;

    if (isVisible("date")) {
      positions.date = position;
      position += 140;
    }

    if (isVisible("description")) {
      positions.description = position;
      position += 320;
    }

    return positions;
  }, [isVisible]);

  const getStickyStyle = React.useCallback(
    (columnId: string) => {
      const left = stickyPositions[columnId];
      if (left === undefined) return undefined;
      return {
        "--stick-left": `${left}px`,
      } as React.CSSProperties;
    },
    [stickyPositions],
  );

  const getStickyClassName = React.useCallback(
    (columnId: string, baseClassName?: string, isHeader = false) => {
      const stickyColumns = ["select", "date", "description"];
      const isSticky = stickyColumns.includes(columnId);
      return cn(
        baseClassName,
        isSticky && "md:sticky md:left-[var(--stick-left)]",
        isSticky && "isolate",
        isSticky && (isHeader ? "z-30" : "z-20"),
      );
    },
    [],
  );

  return {
    getStickyStyle,
    getStickyClassName,
  };
}

function useTableScroll(options: UseTableScrollOptions = {}) {
  const {
    scrollAmount = 120,
    useColumnWidths = false,
    startFromColumn = 0,
  } = options;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [isScrollable, setIsScrollable] = React.useState(false);
  const currentColumnIndex = React.useRef(startFromColumn);
  const isScrollingProgrammatically = React.useRef(false);
  const scrollTimeoutRef = React.useRef<number | undefined>(undefined);

  const getColumnPositions = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return [];

    const table = container.querySelector("table");
    if (!table) return [];

    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return [];

    const columns = Array.from(headerRow.querySelectorAll("th"));
    const positions: number[] = [];
    let currentPosition = 0;

    for (const column of columns) {
      positions.push(currentPosition);
      currentPosition += (column as HTMLElement).offsetWidth;
    }

    return positions;
  }, []);

  const syncColumnIndex = React.useCallback(() => {
    const container = containerRef.current;
    if (!container || !useColumnWidths || isScrollingProgrammatically.current)
      return;

    const allColumnPositions = getColumnPositions();
    if (allColumnPositions.length === 0) return;

    const currentScrollLeft = container.scrollLeft;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;

    if (currentScrollLeft <= 10) {
      currentColumnIndex.current = startFromColumn;
      return;
    }
    if (currentScrollLeft >= maxScrollLeft - 10) {
      currentColumnIndex.current = allColumnPositions.length - 1;
      return;
    }

    let accumulatedDistance = 0;
    let detectedColumn = startFromColumn;

    for (let i = startFromColumn; i < allColumnPositions.length - 1; i++) {
      const columnStart = allColumnPositions[i] ?? 0;
      const columnEnd = allColumnPositions[i + 1] ?? 0;
      const columnWidth = columnEnd - columnStart;
      const nextDistance = accumulatedDistance + columnWidth;

      if (
        Math.abs(currentScrollLeft - accumulatedDistance) <=
        Math.abs(currentScrollLeft - nextDistance)
      ) {
        detectedColumn = i;
        break;
      }

      accumulatedDistance = nextDistance;
      detectedColumn = i + 1;
    }

    currentColumnIndex.current = Math.max(
      startFromColumn,
      Math.min(detectedColumn, allColumnPositions.length - 1),
    );
  }, [useColumnWidths, startFromColumn, getColumnPositions]);

  const checkScrollability = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollWidth, clientWidth } = container;
    const isScrollableTable = scrollWidth > clientWidth;

    if (useColumnWidths) {
      syncColumnIndex();

      const allColumnPositions = getColumnPositions();
      const maxColumnIndex = allColumnPositions.length - 1;

      const newCanScrollLeft =
        currentColumnIndex.current > startFromColumn ||
        container.scrollLeft > 10;
      const newCanScrollRight = currentColumnIndex.current < maxColumnIndex;

      setIsScrollable(isScrollableTable);
      setCanScrollLeft(newCanScrollLeft);
      setCanScrollRight(newCanScrollRight);
    } else {
      const { scrollLeft } = container;
      setIsScrollable(isScrollableTable);
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, [useColumnWidths, startFromColumn, getColumnPositions, syncColumnIndex]);

  const scrollLeft = React.useCallback(
    (smooth = true) => {
      const container = containerRef.current;
      if (!container) return;

      if (useColumnWidths) {
        const allColumnPositions = getColumnPositions();
        if (allColumnPositions.length === 0) return;

        if (
          currentColumnIndex.current <= startFromColumn &&
          container.scrollLeft <= 0
        ) {
          return;
        }

        if (
          currentColumnIndex.current <= startFromColumn &&
          container.scrollLeft > 0
        ) {
          isScrollingProgrammatically.current = true;
          container.scrollTo({
            left: 0,
            behavior: "smooth",
          });

          window.setTimeout(() => {
            isScrollingProgrammatically.current = false;
            syncColumnIndex();
            checkScrollability();
          }, 500);
          return;
        }

        const originalColumnIndex = currentColumnIndex.current;
        currentColumnIndex.current = currentColumnIndex.current - 1;

        const currentScrollLeft = container.scrollLeft;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;

        let targetScrollLeft: number;

        if (Math.abs(currentScrollLeft - maxScrollLeft) < 10) {
          const lastColumnStart = allColumnPositions[originalColumnIndex] ?? 0;
          const lastColumnEnd =
            allColumnPositions[originalColumnIndex + 1] ??
            lastColumnStart + 150;
          const lastColumnWidth = lastColumnEnd - lastColumnStart;

          targetScrollLeft = Math.max(0, currentScrollLeft - lastColumnWidth);
        } else {
          targetScrollLeft = 0;
          for (let i = startFromColumn; i < currentColumnIndex.current; i++) {
            const columnStart = allColumnPositions[i] ?? 0;
            const columnEnd = allColumnPositions[i + 1] ?? 0;
            const columnWidth = columnEnd - columnStart;
            targetScrollLeft += columnWidth;
          }
        }

        isScrollingProgrammatically.current = true;

        container.scrollTo({
          left: targetScrollLeft,
          behavior: "smooth",
        });

        window.setTimeout(() => {
          isScrollingProgrammatically.current = false;
          syncColumnIndex();
          checkScrollability();
        }, 500);
      } else {
        container.scrollBy({
          left: -scrollAmount,
          behavior: smooth ? "smooth" : "auto",
        });
      }
    },
    [
      checkScrollability,
      getColumnPositions,
      scrollAmount,
      startFromColumn,
      syncColumnIndex,
      useColumnWidths,
    ],
  );

  const scrollRight = React.useCallback(
    (smooth = true) => {
      const container = containerRef.current;
      if (!container) return;

      if (useColumnWidths) {
        const allColumnPositions = getColumnPositions();
        if (allColumnPositions.length === 0) return;
        const maxColumnIndex = allColumnPositions.length - 1;

        if (currentColumnIndex.current >= maxColumnIndex) {
          return;
        }

        currentColumnIndex.current = currentColumnIndex.current + 1;

        isScrollingProgrammatically.current = true;

        if (currentColumnIndex.current === maxColumnIndex) {
          container.scrollTo({
            left: container.scrollWidth - container.clientWidth,
            behavior: "smooth",
          });
        } else {
          let targetScrollLeft = 0;
          for (let i = startFromColumn; i < currentColumnIndex.current; i++) {
            const columnStart = allColumnPositions[i] ?? 0;
            const columnEnd = allColumnPositions[i + 1] ?? 0;
            targetScrollLeft += columnEnd - columnStart;
          }

          container.scrollTo({
            left: targetScrollLeft,
            behavior: "smooth",
          });
        }

        window.setTimeout(() => {
          isScrollingProgrammatically.current = false;
          syncColumnIndex();
          checkScrollability();
        }, 500);
      } else {
        container.scrollBy({
          left: scrollAmount,
          behavior: smooth ? "smooth" : "auto",
        });
      }
    },
    [
      checkScrollability,
      getColumnPositions,
      scrollAmount,
      startFromColumn,
      syncColumnIndex,
      useColumnWidths,
    ],
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    currentColumnIndex.current = startFromColumn;
    checkScrollability();

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;

      if (scrollTimeoutRef.current !== undefined) {
        window.clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = window.setTimeout(() => {
        checkScrollability();
      }, 100);
    };

    const handleResize = () => {
      currentColumnIndex.current = startFromColumn;
      checkScrollability();
    };

    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        currentColumnIndex.current = startFromColumn;
        checkScrollability();
      });

      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (scrollTimeoutRef.current !== undefined) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [checkScrollability, startFromColumn]);

  return {
    containerRef,
    canScrollLeft,
    canScrollRight,
    isScrollable,
    scrollLeft,
    scrollRight,
  };
}

const HorizontalPagination = ({
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
  className,
}: HorizontalPaginationProps) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="icon"
        disabled={!canScrollLeft}
        className="h-7 w-7"
        onClick={onScrollLeft}
        aria-label="Scroll left"
      >
        <ArrowLeft
          className={cn(
            "h-3.5 w-3.5",
            canScrollLeft ? "text-primary" : "text-muted-foreground",
          )}
        />
      </Button>
      <Button
        variant="outline"
        size="icon"
        disabled={!canScrollRight}
        className="h-7 w-7"
        onClick={onScrollRight}
        aria-label="Scroll right"
      >
        <ArrowRight
          className={cn(
            "h-3.5 w-3.5",
            canScrollRight ? "text-primary" : "text-muted-foreground",
          )}
        />
      </Button>
    </div>
  );
};

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
};

const DataTableColumnHeader = <TData, TValue>({
  column,
  title,
}: DataTableColumnHeaderProps<TData, TValue>) => {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();

  if (!canSort) {
    return (
      <div className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <span>{title}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-1.5",
        "py-2 text-[0.8125rem]",
        "text-muted-foreground hover:text-foreground",
        "cursor-pointer outline-none transition-colors",
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">
        {sorted === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : sorted === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-70" />
        )}
      </span>
    </button>
  );
};

export const DataTable26 = () => {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data: transactions,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  const { getStickyStyle, getStickyClassName } = useStickyColumns({ table });

  const tableScroll = useTableScroll({
    useColumnWidths: true,
    startFromColumn: 3,
  });

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const visibleColumnIds = table.getVisibleLeafColumns().map((column) => column.id);
  const actionsColumnIndex = visibleColumnIds.indexOf("actions");
  const rightStickyDividerTargetId =
    actionsColumnIndex > 0 ? visibleColumnIds[actionsColumnIndex - 1] : null;

  return (
    <section className="py-32">
      <div className="container">
        <div className="mb-8 text-left">
          <h2 className="text-2xl font-bold tracking-tight">
            Transactions table with horizontal controls
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Sticky primary columns, keyboard-friendly scroll controls, and a
            responsive actions rail keep dense financial data easy to scan.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/60 bg-card [--dt-cell-bg:var(--background)] [--dt-header-bg:var(--muted)] [--dt-row-hover-bg:color-mix(in_oklab,var(--background)_98%,var(--foreground)_2%)] [--dt-row-selected-bg:color-mix(in_oklab,var(--background)_98%,var(--foreground)_2%)] [--dt-row-selected-hover-bg:color-mix(in_oklab,var(--background)_96%,var(--foreground)_4%)] dark:[--dt-header-bg:var(--card)] dark:[--dt-row-hover-bg:var(--muted)] dark:[--dt-row-selected-bg:var(--muted)] dark:[--dt-row-selected-hover-bg:color-mix(in_oklab,var(--muted)_80%,var(--foreground)_20%)]">
          <div
            ref={tableScroll.containerRef}
            className="overflow-x-auto overscroll-x-none"
          >
            <table className="w-full min-w-[1200px] caption-bottom text-[0.8125rem]">
              <TableHeader className="sticky top-0 z-10 border-b-[0.5px] border-border/60 bg-[var(--dt-header-bg)]">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="!border-0 hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => {
                      const meta =
                        (header.column.columnDef.meta as ColumnMeta) ?? {};
                      const sizeStyle: React.CSSProperties = {};
                      if (meta.width !== undefined) {
                        sizeStyle.width =
                          typeof meta.width === "number"
                            ? `${meta.width}px`
                            : meta.width;
                      }
                      if (meta.minWidth !== undefined) {
                        sizeStyle.minWidth =
                          typeof meta.minWidth === "number"
                            ? `${meta.minWidth}px`
                            : meta.minWidth;
                      }
                      if (meta.maxWidth !== undefined) {
                        sizeStyle.maxWidth =
                          typeof meta.maxWidth === "number"
                            ? `${meta.maxWidth}px`
                            : meta.maxWidth;
                      }
                      const baseClassName = cn(
                        "relative !h-11 border-r-[0.5px] border-border/60 bg-[var(--dt-header-bg)] !px-3 text-left align-middle !text-[0.8125rem] font-medium !text-muted-foreground whitespace-nowrap last:border-r-0",
                        header.column.id === rightStickyDividerTargetId &&
                          "!border-r-0",
                        meta.headerClassName,
                      );

                      const stickyStyle =
                        header.column.id === "actions"
                          ? undefined
                          : getStickyStyle(header.column.id);

                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          className={getStickyClassName(
                            header.column.id,
                            baseClassName,
                            true,
                          )}
                          style={{ ...sizeStyle, ...(stickyStyle ?? {}) }}
                        >
                          {header.isPlaceholder ? null : header.column.id ===
                            "description" ? (
                            <div className="flex items-center justify-between gap-2">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              <HorizontalPagination
                                canScrollLeft={tableScroll.canScrollLeft}
                                canScrollRight={tableScroll.canScrollRight}
                                onScrollLeft={tableScroll.scrollLeft}
                                onScrollRight={tableScroll.scrollRight}
                                className="hidden md:flex"
                              />
                            </div>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className="group h-11 !border-b-[0.5px] border-border/60 bg-[var(--dt-row-bg)] [--dt-row-bg:var(--dt-cell-bg)] transition-colors hover:[--dt-row-bg:var(--dt-row-hover-bg)] data-[state=selected]:[--dt-row-bg:var(--dt-row-selected-bg)] data-[state=selected]:hover:[--dt-row-bg:var(--dt-row-selected-hover-bg)] last:border-b-0"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta =
                          (cell.column.columnDef.meta as ColumnMeta) ?? {};
                        const sizeStyle: React.CSSProperties = {};
                        if (meta.width !== undefined) {
                          sizeStyle.width =
                            typeof meta.width === "number"
                              ? `${meta.width}px`
                              : meta.width;
                        }
                        if (meta.minWidth !== undefined) {
                          sizeStyle.minWidth =
                            typeof meta.minWidth === "number"
                              ? `${meta.minWidth}px`
                              : meta.minWidth;
                        }
                        if (meta.maxWidth !== undefined) {
                          sizeStyle.maxWidth =
                            typeof meta.maxWidth === "number"
                              ? `${meta.maxWidth}px`
                              : meta.maxWidth;
                        }
                        const baseClassName = cn(
                          "relative h-11 border-r-[0.5px] border-border/60 bg-[var(--dt-row-bg)] !px-3 !py-2 align-middle !text-[0.8125rem] text-foreground whitespace-nowrap last:border-r-0",
                          cell.column.id === rightStickyDividerTargetId &&
                            "!border-r-0",
                          meta.cellClassName,
                        );

                        const stickyStyle =
                          cell.column.id === "actions"
                            ? undefined
                            : getStickyStyle(cell.column.id);

                        return (
                          <TableCell
                            key={cell.id}
                            className={getStickyClassName(
                              cell.column.id,
                              baseClassName,
                              false,
                            )}
                            style={{ ...sizeStyle, ...(stickyStyle ?? {}) }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnCount}
                      className="h-24 text-center text-[0.8125rem] text-muted-foreground"
                    >
                      No transactions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
