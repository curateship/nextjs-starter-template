import { type FormEvent, useEffect, useState } from "react"
import { DataTable4 } from "@/components/data-table4"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DashboardContent } from "@/components/dashboard-content"
import {
  createSchedule,
  listRuns,
  type RunSummary,
  type ScheduleRecord,
} from "@/lib/api"

const defaultTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto"

function CreateScrapeModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (schedule: ScheduleRecord) => void
}) {
  const [keyword, setKeyword] = useState("")
  const [area, setArea] = useState("")
  const [maxPlaces, setMaxPlaces] = useState("100")
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("daily")
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setKeyword("")
    setArea("")
    setMaxPlaces("100")
    setCadence("daily")
    setTimezone(defaultTimezone)
    setError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)

    if (!nextOpen) {
      setError(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedKeyword = keyword.trim()
    const trimmedArea = area.trim()
    const parsedMaxPlaces = Number(maxPlaces)

    if (!trimmedKeyword || !trimmedArea) {
      setError("Keyword and area are required")
      return
    }

    if (!Number.isInteger(parsedMaxPlaces) || parsedMaxPlaces < 1 || parsedMaxPlaces > 250) {
      setError("Max places must be an integer between 1 and 250")
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const response = await createSchedule({
        keyword: trimmedKeyword,
        area: trimmedArea,
        max_places: parsedMaxPlaces,
        cadence,
        timezone: timezone.trim() || defaultTimezone,
      })

      onCreated(response.schedule)
      resetForm()
      onOpenChange(false)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create scrape")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Scrape</DialogTitle>
          <DialogDescription>
            Set the Google Maps input, cadence, and timezone for this scrape.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Keyword</span>
            <Input
              className="h-11 rounded-2xl px-4"
              placeholder="dentist"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Area</span>
            <Input
              className="h-11 rounded-2xl px-4"
              placeholder="Toronto, Ontario"
              value={area}
              onChange={(event) => setArea(event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Max places</span>
            <Input
              className="h-11 rounded-2xl px-4"
              inputMode="numeric"
              value={maxPlaces}
              onChange={(event) => setMaxPlaces(event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Cadence</span>
            <Select
              value={cadence}
              onValueChange={(value) => setCadence(value as "daily" | "weekly" | "monthly")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select cadence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Timezone</span>
            <Input
              className="h-11 rounded-2xl px-4"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button type="submit" size="lg" disabled={submitting} className="justify-center rounded-2xl">
            {submitting ? "Saving..." : "Create Scrape"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function OverviewPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const response = await listRuns()

        if (!active) {
          return
        }

        setRuns(response.runs)
      } catch (caughtError) {
        if (!active) {
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load runs")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return (
    <DashboardContent>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Recent Google Maps runs live here. Create new scrapes from the modal.
          </p>
        </div>
        <Button size="lg" onClick={() => setCreateModalOpen(true)}>
          Create Scrape
        </Button>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading runs...</p>
      ) : (
        <DataTable4 runs={runs} />
      )}

      <CreateScrapeModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreated={(schedule) => {
          setNotice(`Scrape scheduled for ${schedule.keyword} in ${schedule.area}.`)
        }}
      />
    </DashboardContent>
  )
}
