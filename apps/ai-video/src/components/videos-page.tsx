import * as React from "react"
import { Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  LibraryIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getGenerationErrorMessage,
  loadGeneration,
  listGenerations,
  refreshGenerationStatus,
  retryFailedGeneration,
  type GenerationItem,
  type GenerationStatus,
} from "@/lib/api/generations"

type StatusFilter = "all" | GenerationStatus

const pageSizeOptions = [10, 20, 50]
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function VideosPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])

  const query = useQuery({
    queryKey: ["generations", currentPage, pageSize, statusFilter, searchQuery],
    queryFn: async () => {
      const first = await listGenerations({
        page: currentPage,
        pageSize,
        status: statusFilter,
        search: searchQuery,
      })
      const active = first.generations.filter(isActiveGeneration)
      if (!active.length) return first

      await Promise.all(
        active.map((generation) =>
          refreshGenerationStatus(generation.id).catch(() => undefined)
        )
      )
      return listGenerations({
        page: currentPage,
        pageSize,
        status: statusFilter,
        search: searchQuery,
      })
    },
    refetchInterval: 12_000,
  })

  const retryMutation = useMutation({
    mutationFn: retryFailedGeneration,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["generations"] }),
  })

  const data = query.data
  const generations = data?.generations ?? []
  const error = query.error || retryMutation.error
    ? getGenerationErrorMessage(query.error || retryMutation.error)
    : null

  async function copyUrl(generation: GenerationItem) {
    const url = generation.video_url || generation.provider_result_url
    if (url) {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Generated videos"
        icon={<LibraryIcon className="size-5" />}
        count={data?.total ?? 0}
        status={error ? { tone: "error", text: error } : null}
        controls={
          <>
            <DashboardToolbarSearch
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search prompts"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter)
                setCurrentPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger>
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="generating">Generating</SelectItem>
                <SelectItem value="saving">Saving</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <DashboardToolbarButton asChild>
              <Link to="/admin/modules/ugc-ad-video/create">
                <PlusIcon className="size-4" />
                New Video
              </Link>
            </DashboardToolbarButton>
          </>
        }
        footer={{
          type: "pagination",
          page: data?.page ?? currentPage,
          pageSize: data?.page_size ?? pageSize,
          total: data?.total ?? 0,
          totalPages: data?.total_pages ?? 0,
          onPageChange: setCurrentPage,
          onPageSizeChange: setPageSize,
          pageSizeOptions,
        }}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Prompt</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Provider</TableHead>
              <TableHead column="meta">Created</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!query.isLoading && generations.length === 0}
        emptyText={query.isLoading ? "Loading videos..." : "No videos found."}
        emptyColSpan={5}
      >
        {generations.map((generation) => {
          const url = generation.video_url || generation.provider_result_url
          return (
            <TableRow key={generation.id}>
              <TableCell column="main">
                <Link
                  to="/admin/modules/ugc-ad-video/generations/$generationId"
                  params={{ generationId: generation.id }}
                  className="line-clamp-2 text-sm font-medium hover:underline"
                >
                  {generation.prompt}
                </Link>
                {generation.error ? (
                  <div className="mt-1 text-xs text-destructive">
                    {generation.error}
                  </div>
                ) : null}
              </TableCell>
              <TableCell column="meta">
                <StatusBadge status={generation.status} />
              </TableCell>
              <TableCell column="meta">
                <div className="text-sm capitalize">{generation.provider}</div>
                <div className="text-xs text-muted-foreground">{generation.model}</div>
              </TableCell>
              <TableCell column="meta">
                {dateFormatter.format(new Date(generation.created_at))}
              </TableCell>
              <TableCell column="meta">
                <div className="flex items-center gap-1">
                  <Button
                    asChild
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="View details"
                  >
                    <Link
                      to="/admin/modules/ugc-ad-video/generations/$generationId"
                      params={{ generationId: generation.id }}
                    >
                      <EyeIcon className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!url}
                    onClick={() => copyUrl(generation)}
                    title="Copy URL"
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!url}
                    asChild={Boolean(url)}
                    title="Download"
                  >
                    {url ? (
                      <a href={url} download>
                        <DownloadIcon className="size-4" />
                      </a>
                    ) : (
                      <DownloadIcon className="size-4" />
                    )}
                  </Button>
                  {generation.status === "failed" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(generation.id)}
                      title="Retry"
                    >
                      <RotateCcwIcon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

    </div>
  )
}

function StatusBadge({ status }: { status: GenerationStatus }) {
  const variant = status === "failed" ? "destructive" : "secondary"
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  )
}

export function GenerationResultPage({ generationId }: { generationId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["generation", generationId],
    queryFn: () => loadGeneration(generationId),
    refetchInterval: (query) =>
      query.state.data && isActiveGeneration(query.state.data) ? 12_000 : false,
  })
  const refreshMutation = useMutation({
    mutationFn: () => refreshGenerationStatus(generationId),
    onSuccess: (generation) => {
      queryClient.setQueryData(["generation", generationId], generation)
      queryClient.invalidateQueries({ queryKey: ["generations"] })
    },
  })
  const retryMutation = useMutation({
    mutationFn: () => retryFailedGeneration(generationId),
    onSuccess: (generation) => {
      queryClient.setQueryData(["generation", generationId], generation)
      queryClient.invalidateQueries({ queryKey: ["generations"] })
    },
  })
  const generation = query.data
  const url = generation?.video_url || generation?.provider_result_url
  const error =
    query.error || refreshMutation.error || retryMutation.error
      ? getGenerationErrorMessage(
          query.error || refreshMutation.error || retryMutation.error
        )
      : null

  async function copyUrl() {
    if (url) await navigator.clipboard.writeText(url)
  }

  return (
    <div className="w-full pb-8">
      <div className="mb-4">
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to="/admin/modules/ugc-ad-video">UGC Ad Video</Link>
        </Button>
      </div>

      <DashboardTable
        title="Video result"
        count={generation ? 1 : 0}
        status={error ? { tone: "error", text: error } : null}
        controls={
          <>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={!generation || refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
            >
              {refreshMutation.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              Refresh
            </DashboardToolbarButton>
            {generation?.status === "failed" ? (
              <DashboardToolbarButton
                type="button"
                disabled={retryMutation.isPending}
                onClick={() => retryMutation.mutate()}
              >
                <RotateCcwIcon className="size-4" />
                Retry
              </DashboardToolbarButton>
            ) : null}
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Video</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Provider</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!query.isLoading && !generation}
        emptyText={query.isLoading ? "Loading result..." : "Generation not found."}
        emptyColSpan={4}
        footer={{ type: "summary", count: generation ? 1 : 0, label: "result" }}
      >
        {generation ? (
          <TableRow>
            <TableCell column="main">
              {generation.video_url ? (
                <video
                  src={generation.video_url}
                  controls
                  className="mb-3 aspect-video w-full max-w-xl rounded-md bg-black"
                />
              ) : null}
              <div className="line-clamp-3 text-sm">{generation.prompt}</div>
              {generation.error ? (
                <div className="mt-1 text-xs text-destructive">
                  {generation.error}
                </div>
              ) : null}
            </TableCell>
            <TableCell column="meta">
              <StatusBadge status={generation.status} />
            </TableCell>
            <TableCell column="meta">
              <div className="text-sm capitalize">{generation.provider}</div>
              <div className="text-xs text-muted-foreground">{generation.model}</div>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!url}
                  onClick={() => void copyUrl()}
                  title="Copy URL"
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!url}
                  asChild={Boolean(url)}
                  title="Download"
                >
                  {url ? (
                    <a href={url} download>
                      <DownloadIcon className="size-4" />
                    </a>
                  ) : (
                    <DownloadIcon className="size-4" />
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ) : null}
      </DashboardTable>

      {generation ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Detail label="Prompt" value={generation.prompt} multiline />
          <Detail
            label="Created"
            value={dateFormatter.format(new Date(generation.created_at))}
          />
          {generation.error ? (
            <Detail label="Error" value={generation.error} multiline />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Detail({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={multiline ? "whitespace-pre-wrap text-sm" : "text-sm"}>
        {value}
      </div>
    </div>
  )
}

function isActiveGeneration(generation: GenerationItem) {
  return ["queued", "writing_prompt", "generating", "saving"].includes(
    generation.status
  )
}
