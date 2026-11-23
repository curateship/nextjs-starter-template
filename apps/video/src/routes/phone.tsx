import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { CheckIcon, ImagePlusIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getPhoneUploadErrorMessage,
  openPhoneUpload,
  readPhoneSession,
  sendPhoneFile,
} from "@/lib/api/video/phone-uploads"

/**
 * The page a phone opens from the editor's QR code
 * (workspace/docs/phone-uploads.md). The link's secret is after the `#`: the
 * page sends it to the server once and takes it out of the address at once,
 * so a reload or a shared screenshot holds nothing. After that the phone
 * signs in by its own cookie for two hours, for this one project's files.
 *
 * Only the camera roll is offered: the file box asks for videos and pictures
 * and never for the camera (Tyler, 4 Nov 2026: "Camera roll only").
 */
export const Route = createFileRoute("/phone")({
  head: () => ({
    meta: [
      { title: "Send to Video" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PhonePage,
})

/** Where the page keeps the project's name across a reload of the same tab. */
const NAME_KEY = "video-phone-project"

type Stage =
  | { kind: "opening" }
  | { kind: "ready"; projectName: string }
  | { kind: "refused"; title: string; text: string }

type Sent = { key: string; name: string; progress: number; state: "sending" | "done" | "failed"; error?: string }

const REFUSALS = {
  bad: {
    title: "This code doesn't work",
    text: "Scan the code in the editor again. Media → + → From your phone.",
  },
  expired: {
    title: "This code has run out",
    text: "A code works for 15 minutes. Make a new one in the editor: Media → + → From your phone.",
  },
  used: {
    title: "This code was already used",
    text: "A code opens on one phone, once. Make a new one in the editor: Media → + → From your phone.",
  },
  ended: {
    title: "This phone's time is up",
    text: "A phone can send files for two hours. Scan a new code from the editor to go on.",
  },
} as const

function PhonePage() {
  const [stage, setStage] = React.useState<Stage>({ kind: "opening" })
  const [sent, setSent] = React.useState<Sent[]>([])
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const token = window.location.hash.slice(1)
    if (token) window.history.replaceState(null, "", window.location.pathname)
    let live = true
    const opening = token
      ? openPhoneUpload(token).then((view) => {
          if ("refused" in view) return REFUSALS[view.refused]
          window.sessionStorage.setItem(NAME_KEY, view.project_name)
          return view.project_name
        })
      : readPhoneSession().then((session) =>
          session.signed_in ? (window.sessionStorage.getItem(NAME_KEY) ?? "your project") : REFUSALS.bad
        )
    opening
      .then((result) => {
        if (!live) return
        setStage(
          typeof result === "string"
            ? { kind: "ready", projectName: result }
            : { kind: "refused", ...result }
        )
      })
      .catch(() => live && setStage({ kind: "refused", ...REFUSALS.bad }))
    return () => {
      live = false
    }
  }, [])

  async function send(files: FileList | null) {
    if (!files?.length) return
    const queue = Array.from(files).map((file, index) => ({
      file,
      key: `${Date.now()}-${index}-${file.name}`,
    }))
    setSent((current) => [
      ...queue.map(({ file, key }) => ({ key, name: file.name, progress: 0, state: "sending" as const })),
      ...current,
    ])
    const update = (key: string, patch: Partial<Sent>) =>
      setSent((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
    // One at a time: a video already sends four pieces at once.
    for (const { file, key } of queue) {
      try {
        await sendPhoneFile(file, { onProgress: (progress) => update(key, { progress }) })
        update(key, { state: "done", progress: 1 })
      } catch (error) {
        const message = getPhoneUploadErrorMessage(error)
        update(key, { state: "failed", error: message })
        if (message.startsWith("This phone's time")) {
          setStage({ kind: "refused", ...REFUSALS.ended })
          return
        }
      }
    }
  }

  return (
    <main className="flex min-h-svh items-start justify-center bg-muted/60 p-2 md:items-center md:p-3">
      <Card className="w-full max-w-md">
        {stage.kind === "opening" ? (
          <CardContent>
            <LoadingRow label="Opening…" />
          </CardContent>
        ) : stage.kind === "refused" ? (
          <CardHeader>
            <CardTitle>{stage.title}</CardTitle>
            <CardDescription>{stage.text}</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Send to {stage.projectName}</CardTitle>
              <CardDescription>
                Pick videos and photos from your camera roll. They land in the project's Media
                panel as each one finishes. Keep this page open until they're done.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Button type="button" size="lg" onClick={() => fileRef.current?.click()}>
                <ImagePlusIcon />
                Pick videos and photos
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="video/*,image/*"
                multiple
                hidden
                onChange={(event) => {
                  void send(event.target.files)
                  event.target.value = ""
                }}
              />
              {sent.length ? (
                <ul className="grid gap-3" aria-label="Files sent">
                  {sent.map((item) => (
                    <li key={item.key} className="grid gap-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        {item.state === "sending" ? (
                          <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : item.state === "done" ? (
                          <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {item.state === "done"
                            ? "Sent"
                            : item.state === "failed"
                              ? "Not sent"
                              : `${Math.round(item.progress * 100)}%`}
                        </span>
                      </div>
                      {item.state === "sending" ? (
                        <div
                          role="progressbar"
                          aria-label={`Sending ${item.name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(item.progress * 100)}
                          className="h-1.5 overflow-hidden rounded-full bg-muted"
                        >
                          <div
                            className="h-full bg-primary transition-[width]"
                            style={{ width: `${item.progress * 100}%` }}
                          />
                        </div>
                      ) : null}
                      {item.error ? <p className="text-sm text-destructive">{item.error}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </>
        )}
      </Card>
    </main>
  )
}
