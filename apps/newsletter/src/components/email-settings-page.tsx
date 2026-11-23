import * as React from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import {
  createWorkspaceConnection,
  getSettingsErrorMessage,
  loadConnections,
  loadEmailSettings,
  revokeWorkspaceConnection,
  saveWorkspaceEmailSettings,
  type ConnectionItem,
} from "@/lib/api/newsletter-settings"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function EmailSettingsPage() {
  const [error, setError] = React.useState<string | null>(null)

  return (
    <div className="w-full pb-8">
      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <CardGroup>
        <ResendSettingsCard onError={setError} />
        <ConnectionsCard onError={setError} />
      </CardGroup>
    </div>
  )
}

function ResendSettingsCard({
  onError,
}: {
  onError: (message: string | null) => void
}) {
  const [fromName, setFromName] = React.useState("")
  const [fromEmail, setFromEmail] = React.useState("")
  const [apiKey, setApiKey] = React.useState("")
  const [hasApiKey, setHasApiKey] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    let active = true
    loadEmailSettings()
      .then((settings) => {
        if (!active) return
        setFromName(settings.fromName)
        setFromEmail(settings.fromEmail)
        setHasApiKey(settings.hasApiKey)
      })
      .catch((loadError) => onError(getSettingsErrorMessage(loadError)))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [onError])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    onError(null)
    try {
      const settings = await saveWorkspaceEmailSettings({
        fromEmail,
        fromName,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
      })
      setHasApiKey(settings.hasApiKey)
      setApiKey("")
      setSaved(true)
    } catch (saveError) {
      onError(getSettingsErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email sending (Resend)</CardTitle>
        <CardDescription>
          Automations send email through Resend using this workspace's API key
          and from-address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="from-name">From name</Label>
            <Input
              id="from-name"
              value={fromName}
              disabled={loading || saving}
              placeholder="My Newsletter"
              onChange={(event) => setFromName(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from-email">From email</Label>
            <Input
              id="from-email"
              type="email"
              value={fromEmail}
              disabled={loading || saving}
              placeholder="hello@yourdomain.com"
              onChange={(event) => setFromEmail(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="resend-api-key">Resend API key</Label>
          <Input
            id="resend-api-key"
            type="password"
            value={apiKey}
            disabled={loading || saving}
            placeholder={hasApiKey ? "••••••••••••••••" : "re_..."}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {hasApiKey
              ? "A key is saved. Leave blank to keep it."
              : "Stored encrypted. Create one at resend.com."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={loading || saving}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save
          </Button>
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckIcon className="size-3.5" /> Saved
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionsCard({
  onError,
}: {
  onError: (message: string | null) => void
}) {
  const [connections, setConnections] = React.useState<ConnectionItem[]>([])
  const [createOpen, setCreateOpen] = React.useState(false)
  const [revoking, setRevoking] = React.useState<ConnectionItem | null>(null)

  const refresh = React.useCallback(() => {
    loadConnections()
      .then((data) => setConnections(data.connections))
      .catch((loadError) => onError(getSettingsErrorMessage(loadError)))
  }, [onError])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection keys</CardTitle>
        <CardDescription>
          Other apps push signups into this workspace's automations with a
          connection key. The trigger's Source filter matches the app key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New connection
          </Button>
        </div>

        <TableSurface>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead column="main">Name</TableHead>
                <TableHead column="meta">App key</TableHead>
                <TableHead column="meta" className="hidden sm:table-cell">
                  Secret
                </TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  Last used
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  Created
                </TableHead>
                <TableHead column="meta">Status</TableHead>
                <TableHead column="meta" className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No connections yet. Create one to let another app send
                    contacts here.
                  </TableCell>
                </TableRow>
              ) : (
                connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell column="main" className="font-medium">
                      {connection.name}
                    </TableCell>
                    <TableCell column="meta">
                      <code className="text-xs">{connection.appKey}</code>
                    </TableCell>
                    <TableCell
                      column="meta"
                      className="hidden text-muted-foreground sm:table-cell"
                    >
                      <code className="text-xs">
                        {connection.secretPrefix}…
                      </code>
                    </TableCell>
                    <TableCell
                      column="meta"
                      className="hidden text-muted-foreground md:table-cell"
                    >
                      {connection.lastUsedAt
                        ? dateFormatter.format(new Date(connection.lastUsedAt))
                        : "Never"}
                    </TableCell>
                    <TableCell
                      column="meta"
                      className="hidden text-muted-foreground lg:table-cell"
                    >
                      {dateFormatter.format(new Date(connection.created_at))}
                    </TableCell>
                    <TableCell column="meta">
                      <Badge
                        variant={connection.revokedAt ? "outline" : "secondary"}
                      >
                        {connection.revokedAt ? "Revoked" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell column="meta" className="w-10">
                      {!connection.revokedAt ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Revoke ${connection.name}`}
                          onClick={() => setRevoking(connection)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableSurface>
      </CardContent>

      <CreateConnectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
        onError={onError}
      />
      <RevokeConnectionDialog
        connection={revoking}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        onRevoked={refresh}
        onError={onError}
      />
    </Card>
  )
}

function CreateConnectionDialog({
  open,
  onOpenChange,
  onCreated,
  onError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  onError: (message: string | null) => void
}) {
  const [name, setName] = React.useState("")
  const [appKey, setAppKey] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [secret, setSecret] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const close = () => {
    onOpenChange(false)
    setName("")
    setAppKey("")
    setSecret(null)
    setCopied(false)
  }

  const handleCreate = async () => {
    setCreating(true)
    onError(null)
    try {
      const created = await createWorkspaceConnection({ name, appKey })
      setSecret(created.secret)
      onCreated()
    } catch (createError) {
      onError(getSettingsErrorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New connection</DialogTitle>
          <DialogDescription>
            {secret
              ? "Copy the secret now — it is shown only once."
              : "Name the source app and give it a short app key."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {secret ? (
            <div className="grid gap-1">
              <Label htmlFor="connection-secret">Connection secret</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="connection-secret"
                  readOnly
                  value={secret}
                  className="font-mono text-xs"
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Copy secret"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Send it in the Authorization header:{" "}
                <code>Bearer {"<secret>"}</code>
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <Label htmlFor="connection-name">Name</Label>
                <Input
                  id="connection-name"
                  value={name}
                  placeholder="AI Trading"
                  disabled={creating}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="connection-app-key">App key</Label>
                <Input
                  id="connection-app-key"
                  value={appKey}
                  placeholder="ai-trading"
                  disabled={creating}
                  onChange={(event) => setAppKey(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, digits, and dashes. Contacts from this
                  connection get this value as their source.
                </p>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter variant="plain">
          {secret ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={creating || !name.trim() || !appKey.trim()}
              >
                {creating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Create
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevokeConnectionDialog({
  connection,
  onOpenChange,
  onRevoked,
  onError,
}: {
  connection: ConnectionItem | null
  onOpenChange: (open: boolean) => void
  onRevoked: () => void
  onError: (message: string | null) => void
}) {
  const [revoking, setRevoking] = React.useState(false)

  const handleRevoke = async () => {
    if (!connection) return
    setRevoking(true)
    onError(null)
    try {
      await revokeWorkspaceConnection(connection.id)
      onRevoked()
      onOpenChange(false)
    } catch (revokeError) {
      onError(getSettingsErrorMessage(revokeError))
    } finally {
      setRevoking(false)
    }
  }

  return (
    <Dialog open={Boolean(connection)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Revoke connection</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Revoke <span className="font-medium">{connection?.name}</span>? The
            app using this key immediately loses access.
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={revoking}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleRevoke}
            disabled={revoking}
          >
            {revoking ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
