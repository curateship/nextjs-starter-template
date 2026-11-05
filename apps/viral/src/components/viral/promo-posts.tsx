import * as React from "react"
import { CopyIcon, ExternalLinkIcon, Loader2Icon, MegaphoneIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FitLabel, TipButton } from "@/components/viral/send-to-video"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  loadPromoPostPrice,
  loadPromoProjects,
  loadVaultPosts,
  sendPromoPostFn,
  writePromoPostFn,
  type PromoProjectOption,
} from "@/lib/api/viral/viral-promo"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatCount } from "@/lib/viral/creators"
import {
  PROMO_POST_LIMITS,
  PROMO_POST_NETWORK_NAMES,
  PROMO_POST_NETWORKS,
  REDDIT_TITLE_LIMIT,
  sendsToPromo,
  type PromoPostNetwork,
  type PromoPostSend,
  type VaultPost,
} from "@/lib/viral/promo-link"

type Projects = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; projects: PromoProjectOption[] }

/**
 * Write a post for Promo (task part 20, `workspace/docs/promo-connection.md`):
 * a footer button on a vault idea that opens a window. Pick X, Threads,
 * LinkedIn or Reddit and press Write; the AI writes the post from the idea's
 * analysis and notes. The words can be changed, then Send to Promo leaves
 * them as a draft in the Promo project picked. Nothing is posted until
 * somebody presses Post in Promo. A Threads post is for Copy only, because
 * Promo has no Threads.
 */
export function WritePostForPromoButton({ itemId, className }: { itemId: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <TipButton type="button" variant="outline" className={className} tip="Write a post for Promo" onClick={() => setOpen(true)}>
        <MegaphoneIcon />
        <FitLabel full="Post for Promo" />
      </TipButton>
      <PromoPostDialog open={open} itemId={itemId} onClose={() => setOpen(false)} />
    </>
  )
}

function PromoPostDialog({ open, itemId, onClose }: { open: boolean; itemId: string; onClose: () => void }) {
  const [network, setNetwork] = React.useState<PromoPostNetwork>("x")
  const [written, setWritten] = React.useState<PromoPostSend | null>(null)
  const [title, setTitle] = React.useState("")
  const [pieces, setPieces] = React.useState<string[]>([])
  const [projectId, setProjectId] = React.useState("")
  const [projects, setProjects] = React.useState<Projects>({ state: "loading" })
  const [price, setPrice] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState<"write" | "send" | null>(null)
  // A network picked while the written words hold edits, waiting on "Discard changes?".
  const [askingFor, setAskingFor] = React.useState<PromoPostNetwork | null>(null)

  // Every opening starts with nothing written.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setAskingFor(null)
    if (open) {
      setWritten(null)
      setTitle("")
      setPieces([])
      setProjects({ state: "loading" })
    }
  }

  // Words changed by hand since the AI wrote them, and not yet sent.
  const edited =
    written !== null &&
    written.status !== "sent" &&
    (title !== written.title ||
      pieces.length !== written.pieces.length ||
      pieces.some((piece, index) => piece !== written.pieces[index]))

  /** Another network starts again: the words written for the old one go. */
  function switchNetwork(next: PromoPostNetwork) {
    setNetwork(next)
    setWritten(null)
    setTitle("")
    setPieces([])
  }

  function pickNetwork(next: PromoPostNetwork) {
    if (next === (written?.network ?? network)) return
    if (edited) setAskingFor(next)
    else switchNetwork(next)
  }

  const [reloads, setReloads] = React.useState(0)
  React.useEffect(() => {
    if (!open) return
    let live = true
    loadPromoPostPrice().then(
      (answer) => {
        if (live) setPrice(answer.cents)
      },
      () => undefined
    )
    loadPromoProjects().then(
      (list) => {
        if (!live) return
        setProjects({ state: "ready", projects: list })
        setProjectId((current) => (list.some((one) => one.id === current) ? current : (list[0]?.id ?? "")))
      },
      (error: unknown) => {
        if (live) setProjects({ state: "failed", error: getViralErrorMessage(error) })
      }
    )
    return () => {
      live = false
    }
  }, [open, reloads])

  async function write() {
    setBusy("write")
    dismissErrorToast()
    try {
      const next = await writePromoPostFn(itemId, network)
      setWritten(next)
      setTitle(next.title)
      setPieces(next.pieces)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    if (!written) return
    if (!projectId) {
      showErrorToast("Pick the Promo project it goes to first.")
      return
    }
    setBusy("send")
    dismissErrorToast()
    try {
      const sent = await sendPromoPostFn({ sendId: written.id, promoProjectId: projectId, title, pieces })
      setWritten(sent)
      const name = projects.state === "ready" ? projects.projects.find((one) => one.id === projectId)?.name : null
      toast.success(`It's a draft in ${name ?? "Promo"}. Press Post there when it's ready.`)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    const words = [network === "reddit" ? title : "", ...pieces].filter(Boolean).join("\n\n")
    try {
      await navigator.clipboard.writeText(words)
      toast.success("Post copied.")
    } catch {
      showErrorToast("The browser wouldn't copy it. Select the words and copy them by hand.")
    }
  }

  const sent = written?.status === "sent"
  const limit = PROMO_POST_LIMITS[written?.network ?? network]
  const toPromo = sendsToPromo(written?.network ?? network)

  return (
    <>
      <FormDialog open={open} dirty={written !== null && !sent} busy={busy !== null} onClose={onClose}>
        {(requestClose) => (
          <DialogContent variant="admin" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Write a post for Promo</DialogTitle>
              <DialogDescription>
                The AI turns this idea into a post. It goes to a Promo project as a draft, and nothing is posted until you press Post in Promo.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Network</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="viral-promo-network">Write it for</Label>
                    <Select
                      value={written?.network ?? network}
                      onValueChange={(value) => pickNetwork(value as PromoPostNetwork)}
                    >
                      <SelectTrigger id="viral-promo-network" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMO_POST_NETWORKS.map((one) => (
                          <SelectItem key={one} value={one}>
                            {PROMO_POST_NETWORK_NAMES[one]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sendsToPromo(network)
                      ? `Writing costs about ${price ?? 1} cent${price === null || price === 1 ? "" : "s"} of AI.`
                      : `Promo has no Threads, so a Threads post is for Copy. Writing costs about ${price ?? 1} cent${price === null || price === 1 ? "" : "s"} of AI.`}
                  </p>
                </CardContent>
              </Card>

              {written ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The post</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {written.network === "reddit" ? (
                      <div className="grid gap-2">
                        <Label htmlFor="viral-promo-title">Title</Label>
                        <Input
                          id="viral-promo-title"
                          value={title}
                          maxLength={REDDIT_TITLE_LIMIT}
                          disabled={sent}
                          onChange={(event) => setTitle(event.target.value)}
                        />
                      </div>
                    ) : null}
                    {pieces.map((piece, index) => (
                      <div key={index} className="grid gap-2">
                        <Label htmlFor={`viral-promo-piece-${index}`}>
                          {pieces.length > 1 ? `Post ${index + 1} of ${pieces.length}` : written.network === "reddit" ? "Body" : "Words"}
                        </Label>
                        <Textarea
                          id={`viral-promo-piece-${index}`}
                          rows={written.network === "x" ? 3 : 6}
                          value={piece}
                          disabled={sent}
                          aria-invalid={piece.length > limit || undefined}
                          onChange={(event) => setPieces((current) => current.map((one, at) => (at === index ? event.target.value : one)))}
                        />
                        <p className={piece.length > limit ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          {piece.length} of {limit} characters
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {written && toPromo ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Promo project</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {projects.state === "loading" ? (
                      <LoadingRow label="Asking Promo for its projects" />
                    ) : projects.state === "failed" ? (
                      <ErrorRow message={projects.error} onRetry={() => setReloads((count) => count + 1)} />
                    ) : projects.projects.length ? (
                      <div className="grid gap-2">
                        <Label htmlFor="viral-promo-project">Leave the draft in</Label>
                        <Select value={projectId} disabled={sent} onValueChange={setProjectId}>
                          <SelectTrigger id="viral-promo-project" className="w-full">
                            <SelectValue placeholder="Pick a project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Promo has no projects yet. Make one in Promo first.</p>
                    )}
                    {written.status === "failed" && written.error ? <ErrorRow message={`Promo said: ${written.error}`} /> : null}
                    {sent ? (
                      <p className="text-sm text-muted-foreground">
                        It's a draft in Promo. Press Post there when it's ready, and Viral hears when it's up.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              {sent ? (
                <>
                  {written?.draftUrl ? (
                    <Button variant="outline" asChild>
                      <a href={written.draftUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLinkIcon />
                        Open in Promo
                      </a>
                    </Button>
                  ) : null}
                  <Button type="button" onClick={onClose}>
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={requestClose}>
                    Cancel
                  </Button>
                  {written ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => void copy()}>
                        <CopyIcon />
                        Copy
                      </Button>
                      {toPromo ? (
                        <Button type="button" disabled={busy !== null} onClick={() => void send()}>
                          {busy === "send" ? <Loader2Icon className="animate-spin" /> : null}
                          Send to Promo
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button type="button" disabled={busy !== null} onClick={() => void write()}>
                      {busy === "write" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                      Write
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={askingFor !== null}
        onOpenChange={(next) => (next ? undefined : setAskingFor(null))}
        title="Discard changes?"
        description="You changed the written words. Picking another network throws them away. Press Write again for the new one."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          if (askingFor) switchNetwork(askingFor)
          setAskingFor(null)
        }}
      />
    </>
  )
}

const NETWORK_WORDS: Record<string, string> = { x: "X", linkedin: "LinkedIn", tiktok: "TikTok", instagram: "Instagram", reddit: "Reddit" }

/**
 * How your version did (task part 21): your own posts of the idea, as Promo
 * reported them, each with its latest views beside the original's numbers.
 * Nothing shows until Promo has reported a post.
 */
export function YourPostRows({ itemId, refreshKey }: { itemId: string; refreshKey?: unknown }) {
  const [posts, setPosts] = React.useState<VaultPost[]>([])
  React.useEffect(() => {
    let live = true
    loadVaultPosts(itemId).then(
      (list) => {
        if (live) setPosts(list)
      },
      () => undefined
    )
    return () => {
      live = false
    }
  }, [itemId, refreshKey])

  if (!posts.length) return null
  return (
    <>
      {posts.map((post) => (
        <div key={post.id} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            <a href={post.url} target="_blank" rel="noreferrer noopener" className="underline-offset-4 hover:underline">
              Your {NETWORK_WORDS[post.network] ?? post.network} views
            </a>
          </dt>
          <dd className="min-w-0 text-right font-medium">{formatCount(post.views)}</dd>
        </div>
      ))}
    </>
  )
}
