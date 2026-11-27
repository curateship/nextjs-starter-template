import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * The one card a guest sent from Project sees when they can't get in: what
 * happened and what to do. No sign-in and no links, because they have no
 * Promo account.
 */
export function GuestNotice({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/60 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{text}</p>
        </CardContent>
      </Card>
    </main>
  )
}
