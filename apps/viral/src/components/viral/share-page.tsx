import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getSavedVideoErrorMessage, pasteViralLink } from "@/lib/api/viral/viral-videos"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type ShareProject = { id: string; name: string }

const LAST_PROJECT_KEY = "viral-share-project"

/**
 * Save from your phone (`workspace/docs/phone-save.md`, task part 22): the
 * page Android's share menu and the iPhone shortcut open with a video's
 * link. It names the link, asks which project, and adds it exactly as Paste
 * a link does, so the server checks the link the same way. The link is only
 * ever handed to that check; nothing here follows it.
 */
export function SharePage({ link, projects }: { link: string | null; projects: ShareProject[] }) {
  const [text, setText] = React.useState(link ?? "")
  const ids = React.useMemo(() => projects.map((project) => project.id), [projects])
  const [projectId, setProjectId] = useRememberedChoice(LAST_PROJECT_KEY, projects[0]?.id ?? "", ids)
  const [busy, setBusy] = React.useState(false)
  const [added, setAdded] = React.useState<{ projectId: string; key: string; name: string; again: boolean } | null>(null)
  const picked = projects.find((project) => project.id === projectId) ?? projects[0] ?? null

  async function add() {
    if (!picked || !text.trim()) {
      showErrorToast(picked ? "Paste a video's link first." : "Make a project first, then share to it.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const pasted = await pasteViralLink(picked.id, text.trim())
      setAdded({ projectId: picked.id, key: pasted.key, name: picked.name, again: pasted.alreadySaved })
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Save to Viral</CardTitle>
        <CardDescription>A video shared from your phone goes into the project you pick, as Paste a link adds it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="viral-share-link">Link</Label>
          <Input
            id="viral-share-link"
            inputMode="url"
            value={text}
            maxLength={2048}
            placeholder="youtube.com/shorts/… or tiktok.com/@name/video/…"
            onChange={(event) => {
              setText(event.target.value)
              setAdded(null)
            }}
          />
          {!link ? <p className="text-sm text-muted-foreground">No link came with the share. Paste one here.</p> : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="viral-share-project">Project</Label>
          {projects.length ? (
            <Select
              value={picked?.id ?? ""}
              onValueChange={(next) => {
                setProjectId(next)
                setAdded(null)
              }}
            >
              <SelectTrigger id="viral-share-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              You have no project to add it to yet. <Link to="/admin/projects" className="underline">Make one first.</Link>
            </p>
          )}
        </div>
        {added ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckIcon className="size-4 shrink-0" aria-hidden />
            {added.again ? `It was already saved, so it is now in ${added.name} too.` : `Added to ${added.name}. It downloads and breaks down in the background.`}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        {added ? (
          <Button asChild variant="outline">
            <Link
              to="/admin/projects/$projectId"
              params={{ projectId: added.projectId }}
              search={{ open: added.key }}
            >
              Open it in {added.name}
            </Link>
          </Button>
        ) : null}
        <Button type="button" onClick={() => void add()} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Add to project
        </Button>
      </CardFooter>
    </Card>
  )
}
