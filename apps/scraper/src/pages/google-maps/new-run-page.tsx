import { type FormEvent, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ApiError, createRun } from "@/lib/api"
import { SurfaceCard } from "@/components/surface-card"

export function NewRunPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState("")
  const [area, setArea] = useState("")
  const [maxPlaces, setMaxPlaces] = useState("100")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const response = await createRun({
        keyword: trimmedKeyword,
        area: trimmedArea,
        max_places: parsedMaxPlaces,
      })

      await navigate({
        to: "/google-maps/runs/$runId",
        params: { runId: response.run.id },
      })
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message)
      } else {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to create run")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SurfaceCard
      title="New Google Maps Run"
      description="Runs are fixed to keyword plus area. Proxy rotation and browser isolation stay in the core runtime."
    >
      <form className="grid gap-4 lg:max-w-2xl" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Keyword</span>
          <input
            className="h-11 rounded-2xl border border-input bg-background px-4"
            placeholder="dentist"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Area</span>
          <input
            className="h-11 rounded-2xl border border-input bg-background px-4"
            placeholder="Toronto, Ontario"
            value={area}
            onChange={(event) => setArea(event.target.value)}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Max places</span>
          <input
            className="h-11 rounded-2xl border border-input bg-background px-4"
            inputMode="numeric"
            value={maxPlaces}
            onChange={(event) => setMaxPlaces(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">Default 100. Hard cap 250.</span>
        </label>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Queueing run..." : "Queue run"}
          </button>
        </div>
      </form>
    </SurfaceCard>
  )
}
