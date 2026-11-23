import * as React from "react"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CopyIcon,
  ListOrderedIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  ChevronRightIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UsersIcon,
  ZapIcon,
} from "lucide-react"
import { Link } from "@tanstack/react-router"

import { ActionRow, TextPickRow } from "@/components/crm/crm-record-menu"
import { EmailPage, type EmailEditableFields } from "@/components/crm/email-page"
import { SequenceStatsCard, useSequenceStats } from "@/components/crm/sequence-stats"
import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { keepOpenForInnerBoxes, PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getSequenceErrorMessage,
  saveSequence,
  sendSequenceTestEmail,
  type SequenceItem,
} from "@/lib/api/email/sequences"
import { WAIT_MAX_DAYS } from "@/lib/automations/nodes/wait"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import {
  describeSequenceWait,
  newSequenceEmail,
  SEQUENCE_MAX_EMAILS,
  sequenceProblems,
  type SequenceEmail,
  type SequenceSteps,
  type SequenceWait,
} from "@/lib/broadcasts/sequence-graph"
import { sequenceEmailLine } from "@/lib/broadcasts/sequence-progress"
import { plural } from "@/lib/format/plural"
import { useAutoSave } from "@/lib/hooks/use-auto-save"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { SequenceEmailStats } from "@/server/email/sequence-stats"

type Draft = { name: string; steps: SequenceSteps }

/** When an email goes, as its row and its header say it. */
function whenOf(email: SequenceEmail, index: number) {
  return index === 0 ? "Right away" : describeSequenceWait(email.wait)
}

/**
 * One sequence on the right (`workspace/docs/email/sequences.md`): its emails
 * in order, each opening in the newsletter editor, and the automations that
 * send it. The name, Make a copy and Delete are in its ⋮; the footer says
 * whether every email is ready and how many people are in it. Who gets it,
 * and when, is set in an automation's Send sequence step.
 *
 * Everything typed saves 700ms after the last change, the name and the
 * emails together, as one save of the sequence.
 */
export function SequenceRecord({
  initial,
  blockDefaults,
  onListChanged,
  onCopy,
  onDelete,
}: {
  initial: SequenceItem
  blockDefaults: BroadcastBlockDefaults
  onListChanged: () => void
  onCopy: (id: string) => void
  onDelete: (item: SequenceItem) => void
}) {
  const [sequence, setSequence] = React.useState(initial)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [openEmailId, setOpenEmailId] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)
  const stats = useSequenceStats(initial.id)

  const listChangedRef = React.useRef(onListChanged)
  React.useEffect(() => {
    listChangedRef.current = onListChanged
  })

  // The server's last word, for comparing a save against without a state updater.
  const shownRef = React.useRef(initial)
  const show = React.useCallback((next: SequenceItem) => {
    shownRef.current = next
    setSequence(next)
  }, [])

  const save = React.useCallback(
    async (next: Draft) => {
      const before = shownRef.current
      const saved = await saveSequence({ id: initial.id, name: next.name, steps: next.steps })
      show(saved)
      // The list shows the name and how many emails, so it is read again only when those move.
      if (before.name !== saved.name || before.steps?.emails.length !== saved.steps?.emails.length) {
        listChangedRef.current()
      }
    },
    [initial.id, show]
  )
  const { value: draft, change, saveNow } = useAutoSave<Draft | null>(
    initial.steps ? { name: initial.name, steps: initial.steps } : null,
    {
      save: (next) => (next ? save(next) : Promise.resolve()),
      describeError: getSequenceErrorMessage,
    }
  )

  if (!draft) {
    return (
      <RecordFrame
        avatar={<ListOrderedIcon aria-hidden />}
        title={sequence.name}
        hideLabel="Hide the sequence"
        body={
          <p className="py-6 text-center text-sm text-muted-foreground">
            This sequence's steps were changed somewhere other than this tab, so they cannot be shown as a list of emails.
          </p>
        }
      />
    )
  }

  const steps = draft.steps
  const editSteps = (update: (current: SequenceSteps) => SequenceSteps) =>
    change((current) => (current ? { ...current, steps: update(current.steps) } : current))
  const editEmail = (id: string, update: (email: SequenceEmail) => SequenceEmail) =>
    editSteps((current) => ({ ...current, emails: current.emails.map((email) => (email.id === id ? update(email) : email)) }))

  const addEmail = (afterIndex: number) => {
    if (steps.emails.length >= SEQUENCE_MAX_EMAILS) {
      showErrorToast(`A sequence holds up to ${SEQUENCE_MAX_EMAILS} emails.`)
      return
    }
    const made = newSequenceEmail(false)
    editSteps((current) => {
      const emails = [...current.emails]
      emails.splice(afterIndex + 1, 0, made)
      return { ...current, emails }
    })
    setOpenEmailId(made.id)
  }
  const moveEmail = (index: number, by: -1 | 1) =>
    editSteps((current) => {
      const emails = [...current.emails]
      const [moved] = emails.splice(index, 1)
      emails.splice(index + by, 0, moved!)
      return { ...current, emails: settleFirstWait(emails) }
    })
  const removeEmail = (id: string) => {
    if (steps.emails.length === 1) {
      showErrorToast("A sequence needs at least one email. Delete the sequence from its ⋮ instead.")
      return
    }
    editSteps((current) => ({ ...current, emails: settleFirstWait(current.emails.filter((email) => email.id !== id)) }))
    if (openEmailId === id) setOpenEmailId(null)
  }

  const openIndex = steps.emails.findIndex((email) => email.id === openEmailId)
  const openEmail = openIndex >= 0 ? steps.emails[openIndex]! : null

  // What would stop the Send sequence step, first problem first. An
  // automation that reaches a sequence with one stops there and says so.
  const problems = sequenceProblems(steps)

  // One email, as on screen, to the admin's own address. Saves first, so the
  // test is what was just typed. Like a system email's test, a good send says
  // nothing; only a failure does.
  const sendTest = async (emailId: string) => {
    setTesting(true)
    try {
      if (!(await saveNow())) return
      const result = await sendSequenceTestEmail(initial.id, emailId)
      if (!result.ok) showErrorToast(result.error ?? "The test send did not go through.")
    } catch (error) {
      showErrorToast(getSequenceErrorMessage(error))
    } finally {
      setTesting(false)
    }
  }
  const testButtonInner = (
    <>
      {testing ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
      {testing ? "Sending…" : "Send myself a test"}
    </>
  )
  const footer = (
    <>
      <FooterState>
        <UsersIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Badge variant={problems.length ? "destructive" : "secondary"}>{problems.length ? "Not ready" : "Ready"}</Badge>
        <span className="truncate text-muted-foreground">
          {problems.length
            ? problems[0]
            : `${sequence.in_progress} in progress, ${sequence.finished} finished`}
        </span>
      </FooterState>
      {openEmail ? (
        // An open email is the one tested.
        <Button type="button" size="sm" variant="outline" disabled={testing} onClick={() => void sendTest(openEmail.id)}>
          {testButtonInner}
        </Button>
      ) : (
        // On the list, the admin picks which email.
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={testing}>
              {testButtonInner}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {steps.emails.map((email, index) => (
              <DropdownMenuItem key={email.id} onSelect={() => void sendTest(email.id)}>
                <MailIcon className="size-4 text-muted-foreground" />
                <span className="truncate">
                  Email {index + 1}
                  {email.subject.trim() ? `: ${email.subject.trim()}` : ""}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )

  if (openEmail) {
    const fields: EmailEditableFields = openEmail
    return (
      <RecordFrame
        avatar={
          <button type="button" aria-label="Back to the emails" className="flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground" onClick={() => setOpenEmailId(null)}>
            <ArrowLeftIcon />
          </button>
        }
        title={`Email ${openIndex + 1} of ${steps.emails.length}`}
        line={whenOf(openEmail, openIndex)}
        hideLabel="Hide the sequence"
        bare
        actions={
          <TabbedMenu
            label="Email menu"
            align="end"
            width="20.4rem"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            tabs={[
              {
                value: "general",
                label: "General",
                content: (
                  <div className="grid gap-4 p-3">
                    <PickGroup title="Email">
                      <TextPickRow
                        label="Subject"
                        value={openEmail.subject}
                        placeholder="What this email is about"
                        onCommit={(subject) => editEmail(openEmail.id, (email) => ({ ...email, subject }))}
                      />
                      <TextPickRow
                        label="Preview line"
                        value={openEmail.preheader}
                        placeholder="The grey line the inbox shows next to it"
                        onCommit={(preheader) => editEmail(openEmail.id, (email) => ({ ...email, preheader }))}
                      />
                      <TextPickRow
                        label="From name"
                        value={openEmail.fromName}
                        placeholder="Blank uses the site's"
                        onCommit={(fromName) => editEmail(openEmail.id, (email) => ({ ...email, fromName }))}
                      />
                    </PickGroup>
                    {openIndex > 0 ? (
                      <PickGroup title="When">
                        <WaitRow wait={openEmail.wait} onChange={(wait) => editEmail(openEmail.id, (email) => ({ ...email, wait }))} />
                      </PickGroup>
                    ) : null}
                    <div className="grid">
                      <ActionRow
                        destructive
                        icon={<Trash2Icon className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          removeEmail(openEmail.id)
                        }}
                      >
                        Delete this email
                      </ActionRow>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        }
        body={
          <EmailPage
            fields={fields}
            change={(update) => editEmail(openEmail.id, (email) => ({ ...email, ...update(email) }))}
            blockDefaults={blockDefaults}
            editable
            onOpenSettings={() => setMenuOpen(true)}
          />
        }
        footer={footer}
      />
    )
  }

  return (
    <RecordFrame
      avatar={<ListOrderedIcon aria-hidden />}
      title={draft.name}
      line={`${steps.emails.length} ${plural(steps.emails.length, "email")}`}
      hideLabel="Hide the sequence"
      actions={
        <TabbedMenu
          label="Sequence menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid gap-4 p-3">
                  <PickGroup title="Sequence" after={<p className="px-0.5 text-xs text-muted-foreground">Only you see the name.</p>}>
                    <TextPickRow
                      label="Name"
                      value={draft.name}
                      onCommit={(name) => name && change((current) => (current ? { ...current, name } : current))}
                    />
                  </PickGroup>
                  <div className="grid">
                    <ActionRow
                      icon={<CopyIcon className="size-4" />}
                      onClick={() => {
                        setMenuOpen(false)
                        // The copy is read from the server, so what is typed goes there first.
                        void saveNow().then((saved) => saved && onCopy(sequence.id))
                      }}
                    >
                      Make a copy
                    </ActionRow>
                    <div aria-hidden className="-mx-3 my-1.5 border-t" />
                    <ActionRow
                      destructive
                      icon={<Trash2Icon className="size-4" />}
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete(sequence)
                      }}
                    >
                      Delete
                    </ActionRow>
                  </div>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <>
          <SequenceStatsCard stats={stats} />
          <PanelCard
            icon={<MailIcon />}
            storageId="crm-sequence-emails"
            title="Emails"
            meta={steps.emails.length}
            action={
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Add an email at the end" onClick={() => addEmail(steps.emails.length - 1)}>
                <PlusIcon className="size-4" />
              </Button>
            }
          >
            <ol className="-mx-1 grid">
              {steps.emails.map((email, index) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  index={index}
                  count={steps.emails.length}
                  stats={stats ? (stats.byEmail[`email-${email.id}`] ?? null) : undefined}
                  onOpen={() => setOpenEmailId(email.id)}
                  onWait={(wait) => editEmail(email.id, (current) => ({ ...current, wait }))}
                  onAddAfter={() => addEmail(index)}
                  onMove={(by) => moveEmail(index, by)}
                  onDelete={() => removeEmail(email.id)}
                />
              ))}
            </ol>
          </PanelCard>
          <PanelCard icon={<ZapIcon />} storageId="crm-sequence-used-by" title="Used by" meta={sequence.used_by.length}>
            {sequence.used_by.length ? (
              <ul className="-mx-1 grid">
                {sequence.used_by.map((flow) => (
                  <li key={flow.id}>
                    <Link
                      to="/admin/automations"
                      search={{ open: flow.id, full: true }}
                      className="flex items-center gap-2 rounded-md px-1 py-2 text-sm hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1 truncate">{flow.name}</span>
                      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No automation sends this yet. Add a Send sequence step to one in Automations.
              </p>
            )}
          </PanelCard>
        </>
      }
      footer={footer}
    />
  )
}

/** The first email always goes when they join, so a move or a delete clears its wait. */
function settleFirstWait(emails: SequenceEmail[]) {
  return emails.map((email, index) =>
    index === 0 && email.wait.amount !== 0
      ? { ...email, wait: { amount: 0, unit: "days" as const } }
      : index > 0 && email.wait.amount === 0
        ? { ...email, wait: { amount: 2, unit: "days" as const } }
        : email
  )
}

/**
 * One email in the list: its number, subject, when it goes, and a grey line
 * of what became of it ("120 sent · 48% opened"). Pressing it
 * opens the email; its ⋮ changes the wait, adds one after, moves it or
 * deletes it.
 */
function EmailRow({
  email,
  index,
  count,
  stats,
  onOpen,
  onWait,
  onAddAfter,
  onMove,
  onDelete,
}: {
  email: SequenceEmail
  index: number
  count: number
  /** Its numbers; null when none has gone, undefined while they load. */
  stats: SequenceEmailStats | null | undefined
  onOpen: () => void
  onWait: (wait: SequenceWait) => void
  onAddAfter: () => void
  onMove: (by: -1 | 1) => void
  onDelete: () => void
}) {
  const [waitOpen, setWaitOpen] = React.useState(false)
  return (
    <li className="group/email flex items-center gap-1 rounded-md hover:bg-muted/60">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2 text-left" onClick={onOpen}>
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
          {index + 1}
        </span>
        <span className="grid min-w-0">
          <span className={email.subject.trim() ? "truncate text-sm" : "truncate text-sm text-muted-foreground"}>
            {email.subject.trim() || "No subject yet"}
          </span>
          <span className="truncate text-xs text-muted-foreground">{whenOf(email, index)}</span>
          {stats !== undefined ? (
            // Wraps rather than cuts: the numbers are the point of the line.
            <span className="text-xs text-muted-foreground">
              {sequenceEmailLine(stats ?? { sent: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0 })}
            </span>
          ) : null}
        </span>
      </button>
      {index > 0 ? <WaitPopover open={waitOpen} onOpenChange={setWaitOpen} wait={email.wait} onChange={onWait} /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for email ${index + 1}`}>
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {index > 0 ? <DropdownMenuItem onSelect={() => setWaitOpen(true)}>Change the wait</DropdownMenuItem> : null}
          <DropdownMenuItem onSelect={onAddAfter}>
            <PlusIcon className="size-4" />
            Add an email after
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
            <ArrowUpIcon className="size-4" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
            <ArrowDownIcon className="size-4" />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/** The wait's two fields: how many, and hours or days. Each change saves. */
function WaitFields({ wait, onChange }: { wait: SequenceWait; onChange: (wait: SequenceWait) => void }) {
  const id = React.useId()
  const [text, setText] = React.useState(String(wait.amount))
  const commit = () => {
    const amount = Math.round(Number(text))
    if (Number.isFinite(amount) && amount >= 1 && amount !== wait.amount) onChange({ ...wait, amount })
    else setText(String(wait.amount))
  }
  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id} hint={`Counted from the email before it. Up to ${WAIT_MAX_DAYS} days.`}>
        Wait before it
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          min={1}
          inputMode="numeric"
          className="w-24"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        <Select value={wait.unit} onValueChange={(unit) => onChange({ ...wait, unit: unit as SequenceWait["unit"] })}>
          <SelectTrigger className="flex-1" aria-label="Hours or days">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hours">{plural(wait.amount, "hour")}</SelectItem>
            <SelectItem value="days">{plural(wait.amount, "day")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** The wait as a row of the email's ⋮. */
function WaitRow({ wait, onChange }: { wait: SequenceWait; onChange: (wait: SequenceWait) => void }) {
  return (
    <PickRow label="Wait" value={describeSequenceWait(wait)}>
      <WaitFields wait={wait} onChange={onChange} />
    </PickRow>
  )
}

/** The wait opened from an email row's ⋮, anchored on the row. */
function WaitPopover({
  open,
  onOpenChange,
  wait,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  wait: SequenceWait
  onChange: (wait: SequenceWait) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* The box opens from the row's ⋮, so its anchor is a mark at the row's end. */}
      <PopoverTrigger asChild>
        <span aria-hidden className="self-end" />
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} onInteractOutside={keepOpenForInnerBoxes} className="w-[min(18rem,calc(100vw-2rem))] p-3">
        <WaitFields wait={wait} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}
