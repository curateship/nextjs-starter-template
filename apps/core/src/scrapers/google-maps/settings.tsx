import * as React from "react"
import { CheckIcon, Loader2Icon, SaveIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  loadScraperSettings,
  saveScraperSettings,
  scraperError,
} from "@/scrapers/google-maps/api"
import {
  defaultApifyActorId,
  defaultMaxResults,
} from "@/scrapers/google-maps/schema"

export function ScraperSettings({
  onHeaderActionChange,
}: {
  onHeaderActionChange: (action: React.ReactNode) => void
}) {
  const [form, setForm] = React.useState({
    actorId: defaultApifyActorId,
    defaultMaxResults,
    token: "",
  })
  const [hasToken, setHasToken] = React.useState(false)
  const [busy, setBusy] = React.useState(true)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void loadScraperSettings()
      .then(({ settings }) => {
        setForm({
          actorId: settings.actor_id,
          defaultMaxResults: settings.default_max_results,
          token: "",
        })
        setHasToken(settings.has_token)
      })
      .catch((error) => setError(scraperError(error)))
      .finally(() => setBusy(false))
  }, [])

  const save = React.useCallback(async () => {
    setBusy(true)
    setSaved(false)
    setError(null)
    try {
      const { settings } = await saveScraperSettings(form)
      setForm({
        actorId: settings.actor_id,
        defaultMaxResults: settings.default_max_results,
        token: "",
      })
      setHasToken(settings.has_token)
      setSaved(true)
    } catch (error) {
      setError(scraperError(error))
    } finally {
      setBusy(false)
    }
  }, [form])

  React.useEffect(() => {
    onHeaderActionChange(
      <div className="flex items-center gap-3">
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckIcon className="h-4 w-4" />
            Saved
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-8 gap-2 sm:h-9"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <SaveIcon className="h-4 w-4" />
          )}
          {busy ? "Saving" : "Save"}
        </Button>
      </div>
    )

    return () => onHeaderActionChange(null)
  }, [busy, onHeaderActionChange, save, saved])

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Scrapers</h2>
            <p className="text-xs text-muted-foreground">
              Apify provider settings for scraper modules.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="actor-id" label="Apify actor ID">
              <Input
                id="actor-id"
                value={form.actorId}
                onChange={(event) => setForm({ ...form, actorId: event.target.value })}
              />
            </Field>
            <Field id="max-results" label="Default max results">
              <Input
                id="max-results"
                type="number"
                min={1}
                max={500}
                value={form.defaultMaxResults}
                onChange={(event) =>
                  setForm({ ...form, defaultMaxResults: Number(event.target.value) })
                }
              />
            </Field>
            <Field id="apify-token" label="Apify API token">
              <Input
                id="apify-token"
                type="password"
                value={form.token}
                placeholder={hasToken ? "Token saved" : "Paste token"}
                onChange={(event) => setForm({ ...form, token: event.target.value })}
              />
            </Field>
            <div className="grid gap-2">
              <Label>Token status</Label>
              <div className="flex h-9 items-center">
                <Badge variant={hasToken ? "secondary" : "outline"}>
                  {hasToken ? "Connected" : "Not connected"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
