import { useEffect, useState } from "react"
import { DataTable4 } from "@/components/data-table4"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

  async function handleCreate() {
    if (submitting) {
      return
    }

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Scrape</DialogTitle>
          <DialogDescription>
            {error ?? "Set the Google Maps input, cadence, and timezone for this scrape."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="keyword">Keyword</Label>
            <Input
              id="keyword"
              placeholder="dentist"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="area">Area</Label>
            <Input
              id="area"
              placeholder="Toronto, Ontario"
              value={area}
              onChange={(event) => setArea(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxPlaces">Max places</Label>
              <Input
                id="maxPlaces"
                inputMode="numeric"
                value={maxPlaces}
                onChange={(event) => setMaxPlaces(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cadence">Cadence</Label>
              <Select
                value={cadence}
                onValueChange={(value) => setCadence(value as "daily" | "weekly" | "monthly")}
              >
                <SelectTrigger
                  id="cadence"
                  className="rounded-md data-[size=default]:h-9 data-[size=default]:px-3"
                >
                  <SelectValue placeholder="Select cadence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleCreate()}>
            Create Scrape
          </Button>
        </DialogFooter>
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
