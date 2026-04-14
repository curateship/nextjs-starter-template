"use client";

import type {
  Column,
  ColumnPinningState,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  DollarSign,
  Factory,
  Globe,
  Link,
  Linkedin,
  SlidersHorizontal,
  Tag,
  Users,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Company {
  name: string;
  logo: string;
  categories: string[];
  linkedin: string;
  linkedinUsername: string;
  lastInteraction: string;
  connectionStrength: string;
  twitterFollowers: number;
  employees: number;
  website: string;
  industry: string;
  revenue: string;
}

const defaultCompanies: Company[] = [
  {
    name: "Figma",
    logo: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/figma-icon.svg",
    categories: ["Design", "SaaS"],
    linkedin: "https://linkedin.com/company/figma",
    linkedinUsername: "figma",
    lastInteraction: "2 days ago",
    connectionStrength: "Strong",
    twitterFollowers: 524000,
    employees: 1200,
    website: "https://figma.com",
    industry: "Design Tools",
    revenue: "$500M+",
  },
  {
    name: "Vercel",
    logo: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/vercel-icon.svg",
    categories: ["Cloud", "DevOps"],
    linkedin: "https://linkedin.com/company/vercel",
    linkedinUsername: "vercel",
    lastInteraction: "1 week ago",
    connectionStrength: "Medium",
    twitterFollowers: 312000,
    employees: 450,
    website: "https://vercel.com",
    industry: "Cloud Infrastructure",
    revenue: "$100M+",
  },
  {
    name: "Supabase",
    logo: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/supabase.svg",
    categories: ["Database", "Backend"],
    linkedin: "https://linkedin.com/company/supabase",
    linkedinUsername: "supabase",
    lastInteraction: "3 days ago",
    connectionStrength: "Strong",
    twitterFollowers: 156000,
    employees: 180,
    website: "https://supabase.com",
    industry: "Database",
    revenue: "$50M+",
  },
  {
    name: "GitHub",
    logo: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/github-icon.svg",
    categories: ["DevTools", "Collaboration"],
    linkedin: "https://linkedin.com/company/github",
    linkedinUsername: "github",
    lastInteraction: "Yesterday",
    connectionStrength: "Strong",
    twitterFollowers: 2400000,
    employees: 3000,
    website: "https://github.com",
    industry: "Developer Tools",
    revenue: "$1B+",
  },
  {
    name: "Notion",
    logo: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/notion-icon.svg",
    categories: ["Productivity", "SaaS"],
    linkedin: "https://linkedin.com/company/notion",
    linkedinUsername: "notionhq",
    lastInteraction: "5 days ago",
    connectionStrength: "Medium",
    twitterFollowers: 890000,
    employees: 500,
    website: "https://notion.so",
    industry: "Productivity",
    revenue: "$250M+",
  },
];

interface IconHeaderProps {
  icon: React.ReactNode;
  label: string;
}

const IconHeader = ({ icon, label }: IconHeaderProps) => {
  return (
    <div className="flex items-center gap-1 [&_svg]:size-4">
      {icon}
      {label}
    </div>
  );
};

interface HeaderWithSortingProps {
  column: Column<Company>;
  label: string;
  icon?: React.ReactNode;
}

const HeaderWithSorting = ({ column, label, icon }: HeaderWithSortingProps) => {
  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className="!px-0"
    >
      {icon ? <IconHeader icon={icon} label={label} /> : label}
      {sorted === "asc" ? (
        <ArrowUp className="ml-2 size-4" />
      ) : sorted === "desc" ? (
        <ArrowDown className="ml-2 size-4" />
      ) : (
        <ArrowUpDown className="ml-2 size-4" />
      )}
    </Button>
  );
};

interface FilterCheckboxListProps {
  options: string[];
  selectedValues: string[];
  header: string;
  onFilterChange: (updatedValues: string[] | undefined) => void;
}

const FilterCheckboxList = ({
  options,
  selectedValues,
  header,
  onFilterChange,
}: FilterCheckboxListProps) => {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <div
          key={option}
          className="flex max-w-32 items-center gap-2 sm:max-w-full"
        >
          <Checkbox
            id={`${header}-${option}`}
            checked={selectedValues.includes(option)}
            onCheckedChange={(checked) => {
              const updated = checked
                ? [...selectedValues, option]
                : selectedValues.filter((v) => v !== option);
              onFilterChange(updated.length ? updated : undefined);
            }}
          />
          <Label htmlFor={`${header}-${option}`}>{option}</Label>
        </div>
      ))}
    </div>
  );
};

const categoryIncludesFilter: FilterFn<Company> = (
  row,
  columnId,
  filterValue,
) => {
  const value = row.getValue<string[]>(columnId);
  const filterArray = filterValue as string[];
  if (!filterArray || filterArray.length === 0) return true;
  return filterArray.some((filter) => value.includes(filter));
};

const industryIncludesFilter: FilterFn<Company> = (
  row,
  columnId,
  filterValue,
) => {
  const value = row.getValue<string>(columnId);
  const filterArray = filterValue as string[];
  if (!filterArray || filterArray.length === 0) return true;
  return filterArray.includes(value);
};

const columns: ColumnDef<Company>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <HeaderWithSorting column={column} label="Company" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <img
          src={row.original.logo}
          alt={row.original.name}
          className="size-4 rounded-md object-contain dark:invert"
        />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
    footer: ({ table }) => {
      const count = table.getRowCount();
      return (
        <p className="text-right">
          {count} <span className="text-muted-foreground">count</span>
        </p>
      );
    },
  },
  {
    accessorKey: "categories",
    header: () => <IconHeader icon={<Tag />} label="Categories" />,
    cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.categories.map((category) => (
          <Badge key={category} variant="secondary">
            {category}
          </Badge>
        ))}
      </div>
    ),
    filterFn: categoryIncludesFilter,
  },
  {
    accessorKey: "industry",
    header: () => <IconHeader icon={<Factory />} label="Industry" />,
    filterFn: industryIncludesFilter,
  },
  {
    accessorKey: "employees",
    header: ({ column }) => (
      <HeaderWithSorting column={column} label="Employees" icon={<Users />} />
    ),
    cell: ({ row }) => <span>{row.original.employees.toLocaleString()}</span>,
  },
  {
    accessorKey: "revenue",
    header: () => <IconHeader icon={<DollarSign />} label="Revenue" />,
    cell: ({ row }) => <Badge variant="outline">{row.original.revenue}</Badge>,
  },
  {
    accessorKey: "connectionStrength",
    header: ({ column }) => (
      <HeaderWithSorting column={column} label="Connection" icon={<Link />} />
    ),
    cell: ({ row }) => {
      const strength = row.original.connectionStrength;
      const variant =
        strength === "Strong"
          ? "default"
          : strength === "Medium"
            ? "secondary"
            : "outline";
      return (
        <div>
          <Badge variant={variant}>{strength}</Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "lastInteraction",
    header: () => <IconHeader icon={<Clock />} label="Last Interaction" />,
  },
  {
    accessorKey: "twitterFollowers",
    header: ({ column }) => (
      <HeaderWithSorting column={column} label="Followers" icon={<Users />} />
    ),
    cell: ({ row }) => (
      <span>{row.original.twitterFollowers.toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "linkedin",
    header: ({ column }) => (
      <HeaderWithSorting column={column} label="LinkedIn" icon={<Linkedin />} />
    ),
    cell: ({ row }) => (
      <a href={row.original.linkedin} target="_blank" rel="noopener noreferrer">
        <span className="text-sm underline">
          {row.original.linkedinUsername}
        </span>
      </a>
    ),
  },
  {
    accessorKey: "website",
    header: ({ column }) => (
      <HeaderWithSorting column={column} label="Website" icon={<Globe />} />
    ),
    cell: ({ row }) => (
      <a
        href={row.original.website}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline"
      >
        {row.original.website.replace("https://", "")}
      </a>
    ),
  },
];

interface CompaniesList1Props {
  className?: string;
  title?: string;
  data?: Company[];
}

const CompaniesList1 = ({
  className,
  title = "Companies",
  data = defaultCompanies,
}: CompaniesList1Props) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: ["select"],
  });

  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    data.forEach((company) => {
      company.categories.forEach((cat) => categories.add(cat));
    });
    return Array.from(categories).sort();
  }, [data]);

  const uniqueIndustries = useMemo(() => {
    const industries = new Set<string>();
    data.forEach((company) => {
      industries.add(company.industry);
    });
    return Array.from(industries).sort();
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnPinningChange: setColumnPinning,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnPinning,
      globalFilter,
      sorting,
      rowSelection,
    },
  });

  const categoryFilter =
    (table.getColumn("categories")?.getFilterValue() as string[]) ?? [];
  const industryFilter =
    (table.getColumn("industry")?.getFilterValue() as string[]) ?? [];

  return (
    <section className={cn("py-32", className)}>
      <div className="container space-y-8">
        <h3 className="text-2xl font-bold">{title}</h3>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input
                type="text"
                placeholder="Search"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="w-full md:w-56"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <SlidersHorizontal className="size-4" />
                    Filters
                    {categoryFilter.length + industryFilter.length > 0 && (
                      <Badge variant="secondary">
                        {categoryFilter.length + industryFilter.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-full max-w-sm space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Category</Label>
                      <FilterCheckboxList
                        options={uniqueCategories}
                        selectedValues={categoryFilter}
                        header="category"
                        onFilterChange={(values) =>
                          table.getColumn("categories")?.setFilterValue(values)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Industry</Label>
                      <FilterCheckboxList
                        options={uniqueIndustries}
                        selectedValues={industryFilter}
                        header="industry"
                        onFilterChange={(values) =>
                          table.getColumn("industry")?.setFilterValue(values)
                        }
                      />
                    </div>
                  </div>
                  {categoryFilter.length + industryFilter.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setColumnFilters([])}
                    >
                      Clear all filters
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-4">
              {sorting.length > 0 && (
                <Button variant="ghost" onClick={() => setSorting([])}>
                  <X />
                  Remove Sorting
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "border-r",
                          header.column.getIsPinned() &&
                            "sticky left-0 z-10 bg-background !px-2",
                        )}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "border-r",
                            cell.column.getIsPinned() &&
                              "sticky left-0 z-10 bg-background",
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 px-5">
                      No companies found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                {table.getFooterGroups().map((footerGroup) => (
                  <TableRow key={footerGroup.id}>
                    {footerGroup.headers.map((header) => (
                      <TableCell
                        key={header.id}
                        className={cn(
                          "border-r",
                          header.column.getIsPinned() &&
                            "sticky left-0 z-10 bg-muted/50",
                        )}
                      >
                        {header.isPlaceholder ? (
                          <td />
                        ) : (
                          flexRender(
                            header.column.columnDef.footer,
                            header.getContext(),
                          )
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableFooter>
            </Table>
          </div>
        </div>
      </div>
    </section>
  );
};

export { CompaniesList1 };
