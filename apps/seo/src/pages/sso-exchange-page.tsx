import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { exchangeHubSsoToken } from '@/lib/api'
import { saveSeoSession } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SsoExchangePage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')

    if (!token) {
      setError('Hub SSO token is missing')
      return
    }

    const activeToken = token
    let isMounted = true

    async function exchange() {
      try {
        const session = await exchangeHubSsoToken(activeToken)
        if (!isMounted) {
          return
        }
        saveSeoSession(session)
        await navigate({ to: '/' })
      } catch (caughtError) {
        if (!isMounted) {
          return
        }
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to exchange Hub token')
      }
    }

    void exchange()

    return () => {
      isMounted = false
    }
  }, [navigate])

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Starting SEO Session</CardTitle>
          <CardDescription>
            Verifying the Hub token, syncing the local SEO user, and starting the SEO session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-secondary/70 p-4 text-sm text-muted-foreground">
              Processing your login...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
