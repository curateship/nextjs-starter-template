import type { ReactNode } from 'react'
import type { SeoSessionUser } from '@/lib/session'
import { Button } from '@/components/ui/button'

export function AppShell({
  user,
  onSignOut,
  children,
}: {
  user: SeoSessionUser
  onSignOut: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,244,0.96))] p-6 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.35)]">
          <div className="space-y-2">
            <div className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              whateverseo
            </div>
            <h1 className="text-3xl font-semibold">Keyword Research</h1>
            <p className="text-sm text-muted-foreground">
              Separate SEO system. Separate database. Hub-authenticated access.
            </p>
          </div>

          <div className="mt-8 space-y-4 rounded-3xl bg-secondary/70 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">User</p>
              <p className="mt-1 text-sm font-semibold">{user.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/80 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Role</p>
                <p className="mt-1 text-sm font-semibold">{user.role}</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Access</p>
                <p className="mt-1 text-sm font-semibold">
                  {user.seo_access ? 'Enabled' : 'Blocked'}
                </p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start" onClick={onSignOut}>
              Clear SEO Session
            </Button>
          </div>
        </aside>

        <main className="space-y-6">{children}</main>
      </div>
    </div>
  )
}
