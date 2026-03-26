import { config } from '@/lib/config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SsoExchangePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Launch From Hub</CardTitle>
          <CardDescription>
            SEO launch links no longer accept browser-visible login codes. Start the session from Hub instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-border/80 bg-secondary/70 p-4 text-sm text-muted-foreground">
            Open the SEO app from Hub so Hub can create the SEO session before you arrive here.
          </div>
          <a
            className="mt-4 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
            href={`${config.hubAppUrl}/admin/apps-integration`}
          >
            Return to Hub launch page
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
