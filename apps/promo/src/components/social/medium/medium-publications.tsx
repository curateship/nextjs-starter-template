import * as React from "react"
import { ArrowLeftIcon, BookOpenIcon, ExternalLinkIcon, Loader2Icon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { changeMediumPublication, getMediumErrorMessage, type MediumPublicationView } from "@/lib/api/social/medium"
import { mediumPublicationUrl } from "@/lib/social/medium/options"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** "@sam and @lee write here", "None of this project's accounts write here", "Not checked yet". */
function writersWords(publication: MediumPublicationView): string {
  if (publication.checking) return "Checking who writes here"
  if (!publication.writersReadAt) return "Not checked yet"
  if (!publication.writers.length) return "None of this project's accounts write here"
  return `${publication.writers.map((writer) => `@${writer.handle}`).join(", ")} ${publication.writers.length === 1 ? "writes" : "write"} here`
}

/**
 * The Publications tab's list (part 32): the Medium publications that suit
 * the project, and which of its accounts Medium says write for each. Medium
 * says that, never a person: Check asks each account's own browser.
 */
export function MediumPublicationsList({
  projectId,
  rows,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
  onChanged,
}: {
  projectId: string
  rows: MediumPublicationView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (publicationId: string) => void
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [slug, setSlug] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!slug.trim()) {
      showErrorToast("Type the publication's address on Medium first.")
      return
    }
    setBusy(true)
    try {
      const added = await changeMediumPublication({ change: "add", projectId, slug: slug.trim() })
      setOpen(false)
      setSlug("")
      await onChanged()
      if (added.checkRefused) showErrorToast(`Added, but not checked yet. ${added.checkRefused}`)
      else toast.success("Added. Each Medium account of the project asks Medium whether it writes there.")
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="flex-1 text-xs text-muted-foreground">Group blogs run by editors. An editor adds an account as a writer, on Medium.</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <DashboardToolbarButton type="button">
              <PlusIcon className="size-4" />
              New publication
            </DashboardToolbarButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3">
            <form className="grid gap-4" onSubmit={add}>
              <div className="grid gap-2">
                <FieldLabel htmlFor="medium-publication-slug">Its address on Medium</FieldLabel>
                <Input id="medium-publication-slug" autoFocus value={slug} placeholder="medium.com/better-programming" onChange={(event) => setSlug(event.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2Icon className="animate-spin" /> : null}
                  Create publication
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="grid justify-items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">The publications could not be read. {error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : loading && !rows.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the publications
          </p>
        ) : !rows.length ? (
          <p className="p-4 text-sm text-muted-foreground">No publications yet. Add one by its address, or from the AI&apos;s ideas behind the keywords&apos; More button.</p>
        ) : (
          <div className="py-1.5">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={row.id === selectedId || undefined}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  row.id === selectedId && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
                )}
              >
                <BookOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{row.name || row.slug}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {writersWords(row)}
                    {row.rules ? " · Rules read" : ""}
                  </span>
                </span>
                {row.checking ? <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Checking" /> : null}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** One publication in the right column: who writes there, its about words, and its rules for the AI (part 33). */
export function MediumPublicationPanel({
  publication,
  onBack,
  onClose,
  onChanged,
}: {
  publication: MediumPublicationView | null
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [rules, setRules] = React.useState(publication?.rules ?? "")
  // Rules Check read from Medium replace the box's words, unless the box was
  // being changed. Worked out while drawing, React's way for state that
  // follows a prop.
  const [shownRules, setShownRules] = React.useState(publication?.rules ?? "")
  if ((publication?.rules ?? "") !== shownRules) {
    setShownRules(publication?.rules ?? "")
    if (rules === shownRules) setRules(publication?.rules ?? "")
  }
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{publication ? publication.name || publication.slug : "A publication"}</span>
        {publication ? (
          <>
            <Hint label="Ask each account's own browser whether it writes here, and read the rules again">
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null || publication.checking}
                onClick={() => void run("check", async () => {
                  await changeMediumPublication({ change: "check", publicationId: publication.id })
                  toast.success("Checking. Each account's own browser asks Medium.")
                })}
              >
                {busy === "check" || publication.checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                Check
              </Button>
            </Hint>
            <Hint label="Take it off this project">
              <Button type="button" size="icon" variant="ghost" aria-label="Take it off this project" onClick={() => setConfirmRemove(true)}>
                <Trash2Icon />
              </Button>
            </Hint>
            <Hint label="Open it on Medium">
              <Button type="button" size="icon" variant="ghost" asChild>
                <a href={mediumPublicationUrl(publication.slug)} target="_blank" rel="noreferrer" aria-label="Open it on Medium">
                  <ExternalLinkIcon />
                </a>
              </Button>
            </Hint>
          </>
        ) : null}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        {!publication ? (
          <p className="p-4 text-sm text-muted-foreground">Click a publication to see who writes there and its rules for the AI.</p>
        ) : (
          <div className="grid gap-4 p-4">
            <p className="text-sm">{writersWords(publication)}.</p>
            {publication.writersReadAt ? <p className="text-xs text-muted-foreground">Checked {postedDateText(publication.writersReadAt).toLowerCase()}.</p> : null}
            {publication.description ? <p className="text-sm text-muted-foreground">{publication.description}</p> : null}
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="medium-publication-rules"
                hint="Read from the story the publication's menu links as its submission guidelines, or pasted here. The AI is given them before it writes an article for this publication."
              >
                Its rules for the AI
              </FieldLabel>
              <Textarea id="medium-publication-rules" className="min-h-32" value={rules} onChange={(event) => setRules(event.target.value)} />
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("rules", async () => {
                    if (rules === publication.rules) {
                      toast.success("Nothing changed, so there was nothing to save.")
                      return
                    }
                    await changeMediumPublication({ change: "rules", publicationId: publication.id, rules })
                    toast.success("Saved. The AI is given these before it writes for this publication.")
                  })}
                >
                  {busy === "rules" ? <Loader2Icon className="animate-spin" /> : null}
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Take this publication off the project?"
        description="It leaves this list and the article Publication menu. Nothing changes on Medium."
        confirmLabel="Take it off"
        loading={busy === "remove"}
        onConfirm={() =>
          publication
            ? void run("remove", async () => {
                await changeMediumPublication({ change: "remove", publicationId: publication.id })
                setConfirmRemove(false)
                onClose()
              })
            : undefined
        }
      />
    </div>
  )
}
