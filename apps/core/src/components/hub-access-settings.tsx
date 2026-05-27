import * as React from "react"
import { CopyIcon, KeyRoundIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  generatePublicReadToken,
  loadPublicReadTokenStatus,
  publicReadTokenError,
} from "@/lib/api/public-read-token"

type Status = Awaited<ReturnType<typeof loadPublicReadTokenStatus>>

export function HubAccessSettings() {
  const [status, setStatus] = React.useState<Status | null>(null)
  const [token, setToken] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setStatus(await loadPublicReadTokenStatus())
    } catch (loadError) {
      setError(publicReadTokenError(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const generate = async () => {
    setGenerating(true)
    setError("")
    setMessage("")
    try {
      const next = await generatePublicReadToken()
      setStatus({ workspace_id: next.workspace_id, has_token: true })
      setToken(next.token)
      setMessage("Token generated. Copy it into Hub.")
    } catch (generateError) {
      setError(publicReadTokenError(generateError))
    } finally {
      setGenerating(false)
    }
  }

  const copy = async (value: string, copiedMessage: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setMessage(copiedMessage)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRoundIcon className="size-4" />
          Hub Access
        </CardTitle>
        <CardDescription>
          Generate the read token Hub uses to fetch published directory data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="h-28 animate-pulse rounded-md bg-muted" />
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="hub-workspace-id">Workspace ID</Label>
              <div className="flex gap-2">
                <Input id="hub-workspace-id" value={status?.workspace_id ?? ""} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copy(status?.workspace_id ?? "", "Workspace ID copied.")}
                  disabled={!status?.workspace_id}
                >
                  <CopyIcon className="size-4" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hub-read-token">Read Token</Label>
              <div className="flex gap-2">
                <Input
                  id="hub-read-token"
                  value={token || (status?.has_token ? "Token already generated" : "")}
                  readOnly
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copy(token, "Read token copied.")}
                  disabled={!token}
                >
                  <CopyIcon className="size-4" />
                  Copy
                </Button>
              </div>
            </div>

            <Button type="button" onClick={generate} disabled={generating}>
              {generating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {status?.has_token ? "Regenerate Token" : "Generate Token"}
            </Button>
          </>
        )}

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
