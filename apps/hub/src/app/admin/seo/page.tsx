import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getSeoAppUrl, isUsingSeoDevDefaults } from '@/lib/seo/sso'

export default function SeoLaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return <SeoLaunchPageContent searchParams={searchParams} />
}

async function SeoLaunchPageContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const seoAppUrl = getSeoAppUrl()
  const usingSeoDevDefaults = isUsingSeoDevDefaults()

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">SEO App</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          This launches the separate SEO system with a short-lived Hub-issued SSO token.
        </p>
      </div>

      <Card className="mx-0 max-w-3xl">
        <CardHeader>
          <CardTitle>Launch SEO</CardTitle>
          <CardDescription>
            Hub owns auth and access. The SEO app receives a signed token, mirrors the user locally, and starts its own session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usingSeoDevDefaults ? (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">
              Using local dev defaults for SEO launch. Hub will target <code>{seoAppUrl}</code>.
            </div>
          ) : null}

          {!usingSeoDevDefaults && !seoAppUrl ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Set <code>SEO_APP_URL</code> in Hub before launching the SEO app.
            </div>
          ) : null}

          {params.error === 'no-access' ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This account does not currently have SEO access.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/api/seo/launch">Open SEO App</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/api/seo/sso">View SSO Payload</Link>
            </Button>
          </div>

          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p>Hub launch URL: {seoAppUrl ?? 'Not configured'}</p>
            <p>Current MVP access rule: only <code>super_admin</code> users are entitled.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
