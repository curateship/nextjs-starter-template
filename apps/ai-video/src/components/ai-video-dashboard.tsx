import type * as React from "react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ClockIcon, SparklesIcon, VideoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { listGenerations } from "@/lib/api/generations"

export function AiVideoDashboard() {
  const query = useQuery({
    queryKey: ["dashboard-generations"],
    queryFn: () => listGenerations({ page: 1, pageSize: 5, status: "all" }),
  })
  const generations = query.data?.generations ?? []
  const completed = generations.filter((item) => item.status === "succeeded").length
  const active = generations.filter((item) =>
    ["queued", "generating", "saving"].includes(item.status)
  ).length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">AI Video</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage UGC videos for the current workspace.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/modules/ugc-ad-video/create">
            <SparklesIcon className="size-4" />
            Create video
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Recent videos" value={query.data?.total ?? 0} icon={<VideoIcon />} />
        <Metric label="Completed" value={completed} icon={<SparklesIcon />} />
        <Metric label="Active jobs" value={active} icon={<ClockIcon />} />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">Recent activity</div>
        <div className="divide-y">
          {generations.length ? (
            generations.map((generation) => (
              <div key={generation.id} className="px-4 py-3">
                <div className="line-clamp-1 text-sm">{generation.prompt}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {generation.status.replace("_", " ")} via {generation.provider}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No videos yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactElement
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
        <div className="text-muted-foreground [&_svg]:size-5">{icon}</div>
      </div>
    </div>
  )
}
