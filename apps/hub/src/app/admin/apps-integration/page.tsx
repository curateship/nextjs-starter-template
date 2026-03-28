import Link from 'next/link'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/dashboard/StickyHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getSeoAppUrl, isUsingSeoDevDefaults } from '@/lib/actions/seo/sso'
import { AlertTriangle } from 'lucide-react'

type LinkedApp = {
  name: string
  status: 'Linked' | 'Needs config'
  appUrl: string | null
  authOwner: string
  billingOwner: string
  actionUrl: string
  actionLabel: string
  note: string
}

function getLinkedApps(): LinkedApp[] {
  const usingSeoDevDefaults = isUsingSeoDevDefaults()

  try {
    return [
      {
        name: 'SEO',
        status: 'Linked',
        appUrl: getSeoAppUrl(),
        authOwner: 'Hub',
        billingOwner: 'Hub',
        actionUrl: '/api/seo/launch',
        actionLabel: 'Launch',
        note: usingSeoDevDefaults
          ? 'Using local SEO dev defaults.'
          : 'Launched from Hub with a one-time code.',
      },
    ]
  } catch {
    return [
      {
        name: 'SEO',
        status: 'Needs config',
        appUrl: null,
        authOwner: 'Hub',
        billingOwner: 'Hub',
        actionUrl: '/api/seo/launch',
        actionLabel: 'Launch',
        note: 'Set SEO_APP_URL before launching this app.',
      },
    ]
  }
}

export default async function AppsIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const linkedApps = getLinkedApps()

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: 'Apps Integration' }]} />

          {params.error === 'no-access' ? (
            <Alert variant="destructive" className="mx-4 mb-6">
              <AlertTriangle />
              <AlertDescription>
                This account does not currently have SEO access.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 text-[0.8125rem]">App</div>
                <div className="text-[0.8125rem]">Launch URL</div>
                <div className="text-[0.8125rem]">Auth</div>
                <div className="text-[0.8125rem]">Billing</div>
                <div className="text-[0.8125rem]">Status</div>
                <div className="text-[0.8125rem]">Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {linkedApps.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No linked apps found</p>
                </div>
              ) : (
                linkedApps.map((app) => (
                  <div key={app.name} className="p-6">
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                            {app.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{app.name}</p>
                            <p className="truncate text-sm text-muted-foreground">{app.note}</p>
                          </div>
                        </div>
                      </div>

                      <div className="truncate text-sm text-muted-foreground">
                        {app.appUrl ?? 'Not configured'}
                      </div>
                      <div className="text-sm text-foreground">{app.authOwner}</div>
                      <div className="text-sm text-foreground">{app.billingOwner}</div>
                      <div>
                        <Badge variant={app.status === 'Linked' ? 'default' : 'outline'}>
                          {app.status}
                        </Badge>
                      </div>
                      <div>
                        <Button asChild size="sm" variant="outline">
                          <Link href={app.actionUrl} target="_blank" rel="noopener noreferrer">
                            {app.actionLabel}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </AdminLayout>
    </>
  )
}
