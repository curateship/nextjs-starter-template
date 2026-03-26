import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, createWorkspace, getSeoUser, listWorkspaces, logoutSeoSession, type SeoUser } from '@/lib/api'
import { config } from '@/lib/config'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Workspace {
  id: string
  name: string
  created_at: string
}

export function HomePage() {
  const [user, setUser] = useState<SeoUser | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceName, setWorkspaceName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        setIsLoading(true)
        setError(null)

        const meResponse = await getSeoUser()
        const workspacesResponse = await listWorkspaces()

        if (!isMounted) {
          return
        }

        setUser(meResponse.user)
        setWorkspaces(workspacesResponse.workspaces)
      } catch (caughtError) {
        if (!isMounted) {
          return
        }

        if (caughtError instanceof ApiError && caughtError.status === 401) {
          setUser(null)
          setWorkspaces([])
          setError(null)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load the SEO app')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [])

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user) {
      setError('SEO session missing. Launch again from Hub.')
      return
    }

    const name = workspaceName.trim()
    if (!name) {
      setError('Workspace name is required')
      return
    }

    try {
      setIsCreating(true)
      setError(null)
      const response = await createWorkspace(name)
      setWorkspaces((current) => [response.workspace, ...current])
      setWorkspaceName('')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to create workspace')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleSignOut() {
    try {
      await logoutSeoSession()
    } catch {
      // The local session should still be cleared even if the API call fails.
    }

    setUser(null)
    setWorkspaces([])
    setError(null)
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Loading SEO Session</CardTitle>
            <CardDescription>Checking the SEO cookie session and loading your workspace data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-border/80 bg-secondary/70 p-4 text-sm text-muted-foreground">
              Loading...
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8">
        <Card className="w-full overflow-hidden">
          <CardHeader className="space-y-4 bg-[linear-gradient(135deg,rgba(58,122,78,0.16),rgba(255,255,255,0.9))]">
            <div className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              whateverseo
            </div>
            <CardTitle className="text-4xl">Hub SSO Required</CardTitle>
            <CardDescription className="max-w-2xl text-base">
              This app only accepts a single-use Hub launch code. Open the SEO app from Hub so the backend can mirror your user and start an SEO session cookie.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-border/80 bg-secondary/70 p-5">
                <p className="text-sm font-semibold">Current state</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  No SEO session is stored in this browser.
                </p>
              </div>
              {error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
              <Button onClick={() => window.location.assign(`${config.hubAppUrl}/admin/apps-integration`)}>
                Open Hub Launch Page
              </Button>
            </div>
            <div className="rounded-3xl border border-border/80 bg-card/90 p-5">
              <p className="text-sm font-semibold">First slice shipped</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Hub-issued one-time launch code</li>
                <li>SEO API redeem flow and local user mirror</li>
                <li>SEO cookie session</li>
                <li>Workspace creation and listing</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <AppShell user={user} onSignOut={handleSignOut}>
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="bg-[linear-gradient(135deg,rgba(58,122,78,0.12),rgba(255,255,255,0.92))]">
            <CardTitle className="text-3xl">Workspace Control</CardTitle>
            <CardDescription>
              This is the first SEO-owned data path. Workspaces are stored in the SEO database, not Hub.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateWorkspace}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="workspaceName">
                  New workspace
                </label>
                <Input
                  id="workspaceName"
                  placeholder="North America keywords"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
              </div>
              <Button disabled={isCreating}>
                {isCreating ? 'Creating workspace...' : 'Create workspace'}
              </Button>
            </form>
            {error ? (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keyword Workflow</CardTitle>
            <CardDescription>
              The keyword run pipeline is next. This shell is ready for the search form and results table.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Next API slice: run a seed keyword, dedupe canonical keywords, and store metric history.</p>
            <p>Current status: auth complete, local SEO session complete, workspace ownership complete.</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>
            {isLoading ? 'Loading workspaces...' : `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} stored in SEO`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/80 bg-secondary/60 p-6 text-sm text-muted-foreground">
              No workspaces yet. Create the first one here, then the keyword run flow can hang off it.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="rounded-3xl border border-border/80 bg-secondary/55 p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Workspace
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{workspace.name}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Created {new Date(workspace.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  )
}
