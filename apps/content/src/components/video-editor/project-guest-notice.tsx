import { Card, CardContent } from "@/components/ui/card"

/**
 * What a guest sent from Project reads when the editor can't open for them:
 * a used or expired link, or 12 hours that are up. There is no way into
 * Video from here, because a guest has no account; the way back is the task
 * in Project.
 */
export function ProjectGuestNotice({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/60 p-2 md:p-3">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{text}</p>
        </CardContent>
      </Card>
    </main>
  )
}
