import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowUpIcon,
  CopyIcon,
  ListChecksIcon,
  ListTodoIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
  PauseIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { ActionRow } from "@/components/crm/crm-record-menu"
import { CoverRow } from "@/components/shared/notes/page-rows"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu, type MySettingsTab, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import type { ProjectMenuMore } from "@/components/content-app/project-top"
import { usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { NetworkIcon } from "@/components/social/network-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  copyProject,
  getProjectErrorMessage,
  lockProjectDescription,
  pinProject,
  saveProject,
  saveProjectAiCap,
  type ProjectView,
} from "@/lib/api/social/projects"
import { projectDescriptionText, storedProjectPage } from "@/lib/social/project-description"
import { NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { dollarsText, parseCapDollars } from "@/lib/social/spend-cap"
import { NewProjectPopover } from "@/components/social/projects/project-dialogs"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** How long typing has to stop before the name saves. */
const SAVE_AFTER_MS = 700

type Project = ProjectView["project"]

/**
 * The project's description in the "/" editor, opened from the Description
 * row on the ⋮'s General tab.
 * It saves 700ms after the last letter and when it is left, with Saving… and
 * Saved in the page header, and is what the AI is told about what you make
 * and what Research searches for, its words alone. Locked, it reads only, for
 * everyone. It holds words and the shell's basic blocks: the fixed blocks the
 * project's left panel drew in it are gone (`project-description.ts`).
 *
 * A guest gets no "/" list and no right-click list of blocks: the blocks
 * upload pictures and read web pages, which a guest can't. "/" is not typed
 * at all on a guest's page, since the editor would read it as asking for one.
 */
function ProjectDescription({ projectId, page, locked, guest }: { projectId: string; page: string; locked: boolean; guest: boolean }) {
  const setSaveStatus = usePromoSaveStatus()
  // The page as the server last gave it. Each save says it started from this,
  // and the server refuses one whose start is no longer what is stored.
  const base = React.useRef(page)
  // Saves go one after another. The editor sends one 700ms after typing
  // stops without waiting for the last; sent side by side, the second would
  // carry the start the first replaced and be refused as changed elsewhere.
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  // Whether the person typed, cut, pasted or dropped anything in the page since it opened.
  const touched = React.useRef(false)
  const touch = () => {
    touched.current = true
  }
  const save = async (json: string) => {
    // A save that would take every word away is sent only after the person
    // worked in the page. Four times on 12 Nov 2026 a tab that was being left
    // sent an empty page nobody had emptied, and the cause was not found;
    // this keeps the words until someone really deletes them.
    if (!touched.current && storedProjectPage(json) === "" && storedProjectPage(base.current) !== "") return
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const saved = await saveProject({ projectId, page: json, base: base.current })
      if (saved.page !== null) base.current = saved.page
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getProjectErrorMessage(error))
    }
  }
  return (
    <div
      onKeyDownCapture={(event) => {
        if (guest && event.key === "/") event.preventDefault()
        else touch()
      }}
      onCutCapture={touch}
      onPasteCapture={touch}
      onDropCapture={touch}
      onContextMenuCapture={guest ? (event) => event.stopPropagation() : undefined}
    >
      <SavingDocument
        value={page}
        locked={locked}
        placeholder="Describe what you make. The AI is told this."
        onSave={(json) => {
          queue.current = queue.current.then(() => save(json))
          return queue.current
        }}
      />
    </div>
  )
}

/**
 * The project's ⋮, at the end of its Content, Research and Promote row
 * (Tyler, 27 Nov 2026: "A ⋮ on the project's tabs"), the design's tabbed
 * menu, opening under the row towards the middle.
 *
 * - **General:** Name, Description, AI spend cap and Cover photo as rows that
 *   open their field, each saving itself; the Description row opens the "/"
 *   editor (Tyler, 27 Nov 2026: "move discritption to general. it dfoesnt
 *   need its own tab"). Then Pin, Pause this project, Lock description, New
 *   project and Duplicate, which opens the copy; then Delete project in red
 *   under a line.
 * - **Networks:** each network the project uses, in Promote's tab order, with
 *   Move up, Hide or Show (its tab on Promote; Tyler, 14 Nov 2026: "i should
 *   be able to hide and drag and drop networks here", of the Networks block
 *   these tabs replaced), Pause or Resume (that network alone, its posts and
 *   comments) and Take off, which the server refuses while the project still
 *   holds that network's accounts or keywords; then the networks it does not
 *   use yet, each a row to add it.
 *
 * On Research, its own settings follow as **Research** (Search and AI) and
 * **Socials** (Tyler, 27 Nov 2026: "should be merged"). A list with actions
 * of its own adds them as a last tab: Reddit Commenting's Jobs, Ideas and
 * Self-promotion threads, and Research's hidden channels to show again.
 *
 * A guest sent from Project gets General with the Description row alone: a guest writes
 * the words but never runs the project.
 */
export function ProjectMenu({
  project,
  guest,
  menuState,
  extraTabs = [],
  actions,
  select = null,
  jobs = null,
  onSaved,
  onDeleteProject,
  onTogglePause,
  onAddNetwork,
  onRemoveNetwork,
  onToggleNetworkPause,
  onArrangeNetworks,
}: {
  project: Project
  guest: boolean
  /** Held by the page, so Promote's line with no network yet can open the ⋮ at Networks. */
  menuState: TabbedMenuState
  /** Tabs a part of the project adds after the project's own: Research's Research and Socials. */
  extraTabs?: MySettingsTab[]
  /** The list's own actions, a last tab named for them: Reddit Commenting's Jobs, Ideas and Self-promotion threads. */
  actions?: ProjectMenuMore["actions"]
  /** The list's Select, first of General's actions (Tyler, 27 Nov 2026: "Move all the mass select button to here"). */
  select?: ProjectMenuMore["select"]
  /** The network's Jobs window, after Select (Tyler, 27 Nov 2026: "Move jobs button here"). */
  jobs?: ProjectMenuMore["jobs"]
  onSaved: () => void
  onDeleteProject: () => void
  onTogglePause: () => Promise<void>
  onAddNetwork: (network: Network) => Promise<void>
  onRemoveNetwork: (network: Network) => Promise<void>
  onToggleNetworkPause: (network: Network, paused: boolean) => Promise<void>
  /** Promote's tab order and the networks it leaves out. */
  onArrangeNetworks: (arranged: { order: Network[]; hidden: Network[] }) => Promise<void>
}) {
  const navigate = useNavigate()
  const { onOpenChange: setOpen } = menuState
  const [busy, setBusy] = React.useState<string | null>(null)
  // New project's popover, under this ⋮ (Tyler, 27 Nov 2026: "Create new project should open up a popover").
  const [creating, setCreating] = React.useState(false)
  // The ⋮ gives focus back to itself as it closes, which would close the popover the same moment.
  const keepFocus = React.useRef(false)
  async function run(kind: string, action: () => Promise<void>) {
    setBusy(kind)
    try {
      await action()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }
  /** Shuts the menu, then does the thing, so a window it opens is not behind it. */
  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  const addable = NETWORKS.filter((network) => !project.networks.includes(network))
  // The list's Select: ticks its rows for the "N selected" menu in its header, and hides them again.
  // Then the network's Jobs window, with how many run or wait.
  const selectRow = (
    <>
      {select ? (
        <ActionRow icon={<ListChecksIcon className="size-4" />} onClick={then(select.onToggle)}>
          {select.on ? "Hide select" : "Select"}
        </ActionRow>
      ) : null}
      {jobs ? (
        <ActionRow icon={<ListTodoIcon className="size-4" />} onClick={then(jobs.onOpen)}>
          {jobs.waiting ? `Jobs · ${jobs.waiting}` : "Jobs"}
        </ActionRow>
      ) : null}
    </>
  )

  return (
    <NewProjectPopover
      anchorOnly
      open={creating}
      onOpenChange={setCreating}
      onCreated={async (projectId) => {
        await navigate({ to: "/admin/projects/$projectId", params: { projectId } })
      }}
    >
    <TabbedMenu
      onCloseAutoFocus={(event) => {
        if (!keepFocus.current) return
        keepFocus.current = false
        event.preventDefault()
      }}
      label="Project settings"
      align="end"
      // Four tabs (Research adds Research and Socials) open it a little wider, so their row never
      // scrolls sideways (Tyler, 27 Nov 2026: "reduce the padding a bit so we dont get this areascroll").
      // The 32px between tabs is the shell's own rule (tabbed-menu.tsx), so the width gives instead.
      width={extraTabs.length + (actions?.items.length ? 1 : 0) > 1 ? "26rem" : "22.7rem"}
      open={menuState.open}
      onOpenChange={menuState.onOpenChange}
      tab={menuState.tab}
      onTabChange={menuState.onTabChange}
      tabs={[
        {
          value: "general",
          label: "General",
          content: guest ? (
            // A guest writes the description and nothing else of the project.
            <div className="grid gap-3 p-3">
              <PickGroup title="Project">
                {/* The description, what the AI is told and Research searches for, a row that opens its
                    editor (Tyler, 27 Nov 2026: "move discritption to general. it dfoesnt need its own tab"). */}
                <PickRow
                  label="Description"
                  // Its own span cuts the start of the description short with "…": the row's flex box would
                  // otherwise hide the start and show the end.
                  value={<span className="min-w-0 truncate">{projectDescriptionText(project.descriptionPage) || "None"}</span>}
                >
                  <div className="max-h-[60vh] overflow-y-auto">
                    <ProjectDescription
                      // Locking or unlocking draws it again from what was saved.
                      key={`${project.id}:${project.descriptionLocked}`}
                      projectId={project.id}
                      page={project.descriptionPage}
                      locked={project.descriptionLocked}
                      guest={guest}
                    />
                  </div>
                </PickRow>
              </PickGroup>
              {select ? <div className="grid">{selectRow}</div> : null}
            </div>
          ) : (
            <div className="grid gap-3 p-3">
              <PickGroup title="Project">
                <PickRow label="Name" value={project.name}>
                  <ProjectNameField project={project} onSaved={onSaved} />
                </PickRow>
                {/* The description, what the AI is told and Research searches for, a row that opens its
                    editor (Tyler, 27 Nov 2026: "move discritption to general. it dfoesnt need its own tab"). */}
                <PickRow
                  label="Description"
                  // Its own span cuts the start of the description short with "…": the row's flex box would
                  // otherwise hide the start and show the end.
                  value={<span className="min-w-0 truncate">{projectDescriptionText(project.descriptionPage) || "None"}</span>}
                >
                  <div className="max-h-[60vh] overflow-y-auto">
                    <ProjectDescription
                      // Locking or unlocking draws it again from what was saved.
                      key={`${project.id}:${project.descriptionLocked}`}
                      projectId={project.id}
                      page={project.descriptionPage}
                      locked={project.descriptionLocked}
                      guest={guest}
                    />
                  </div>
                </PickRow>
                <PickRow
                  label="AI spend cap"
                  value={
                    project.aiCapCents === null
                      ? "None"
                      : `${dollarsText(project.aiSpentCents)} of ${dollarsText(project.aiCapCents)}`
                  }
                >
                  <ProjectAiCapField project={project} onSaved={onSaved} />
                </PickRow>
                {/* The shell's Cover photo row, as every page's (Tyler, 12 Nov 2026: "the
                    picture is missing the 3 selection standard"): None, Sky, each
                    picture the project has had, and + to add one. */}
                <CoverRow
                  cover={{
                    url: project.imageUrl || null,
                    images: project.coverImages,
                    busy: busy !== null,
                    set: (next) =>
                      void run("cover", async () => {
                        await saveProject({ projectId: project.id, cover: { coverUrl: next.url, coverImages: next.images } })
                        onSaved()
                      }),
                  }}
                />
              </PickGroup>
              <div className="grid">
                {selectRow}
                <ActionRow
                  icon={project.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("pin", async () => {
                      await pinProject(project.id, !project.pinned)
                      onSaved()
                    })
                  }
                >
                  {project.pinned ? "Unpin" : "Pin, first on the Projects dashboard"}
                </ActionRow>
                <ActionRow
                  icon={busy === "pause" ? <Loader2Icon className="size-4 animate-spin" /> : project.pausedAt ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() => void run("pause", onTogglePause)}
                >
                  {project.pausedAt ? "Resume this project" : "Pause this project"}
                </ActionRow>
                <ActionRow
                  icon={project.descriptionLocked ? <LockOpenIcon className="size-4" /> : <LockIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("lock", async () => {
                      await lockProjectDescription(project.id, !project.descriptionLocked)
                      onSaved()
                    })
                  }
                >
                  {project.descriptionLocked ? "Unlock description" : "Lock description"}
                </ActionRow>
                <ActionRow
                  icon={<PlusIcon className="size-4" />}
                  onClick={() => {
                    keepFocus.current = true
                    setOpen(false)
                    setCreating(true)
                  }}
                >
                  New project
                </ActionRow>
                <ActionRow
                  icon={busy === "duplicate" ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("duplicate", async () => {
                      const { id } = await copyProject(project.id)
                      setOpen(false)
                      await navigate({ to: "/admin/projects/$projectId", params: { projectId: id } })
                    })
                  }
                >
                  Duplicate
                </ActionRow>
                <div aria-hidden className="-mx-3 my-1.5 border-t" />
                <ActionRow destructive icon={<Trash2Icon className="size-4" />} onClick={then(onDeleteProject)}>
                  Delete project
                </ActionRow>
              </div>
            </div>
          ),
        },
        ...(guest ? [] : [{
          value: "networks",
          label: "Networks",
          content: (
            <div className="grid gap-3 p-3">
              <PickGroup title="In use">
                {project.networks.length ? (
                  project.networks.map((network, at) => {
                    const paused = project.pausedNetworks.includes(network)
                    const hidden = project.hiddenNetworks.includes(network)
                    const name = NETWORK_NAMES[network]
                    const order = project.networks
                    return (
                      <div key={network} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground [&_svg]:size-4">
                          <NetworkIcon network={network} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {name}
                          {paused ? <span className="text-muted-foreground"> · Paused</span> : null}
                          {hidden ? <span className="text-muted-foreground"> · Hidden</span> : null}
                        </span>
                        {at > 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy !== null}
                            aria-label={`Move ${name} up`}
                            onClick={() =>
                              void run(`order:${network}`, () =>
                                onArrangeNetworks({
                                  order: [...order.slice(0, at - 1), network, order[at - 1], ...order.slice(at + 1)],
                                  hidden: project.hiddenNetworks,
                                })
                              )
                            }
                          >
                            <ArrowUpIcon />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy !== null}
                          aria-label={hidden ? `Show ${name} on Promote` : `Hide ${name} from Promote`}
                          onClick={() =>
                            void run(`hide:${network}`, () =>
                              onArrangeNetworks({
                                order,
                                hidden: hidden ? project.hiddenNetworks.filter((other) => other !== network) : [...project.hiddenNetworks, network],
                              })
                            )
                          }
                        >
                          {hidden ? <EyeOffIcon /> : <EyeIcon />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          aria-label={paused ? `Resume ${name} on this project` : `Pause ${name} on this project`}
                          onClick={() => void run(`pause:${network}`, () => onToggleNetworkPause(network, !paused))}
                        >
                          {busy === `pause:${network}` ? <Loader2Icon className="animate-spin" /> : paused ? <PlayIcon /> : <PauseIcon />}
                          {paused ? "Resume" : "Pause"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={busy !== null}
                          aria-label={`Take ${name} off this project`}
                          onClick={() => void run(`remove:${network}`, () => onRemoveNetwork(network))}
                        >
                          {busy === `remove:${network}` ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                        </Button>
                      </div>
                    )
                  })
                ) : (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">None yet. Add one below.</p>
                )}
              </PickGroup>
              {addable.length ? (
                <PickGroup title="Add a network">
                  {addable.map((network) => (
                    <button
                      key={network}
                      type="button"
                      disabled={busy !== null}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm enabled:hover:bg-muted"
                      onClick={() => void run(`add:${network}`, () => onAddNetwork(network))}
                    >
                      <span className="text-muted-foreground [&_svg]:size-4">
                        <NetworkIcon network={network} />
                      </span>
                      <span className="flex-1">{NETWORK_NAMES[network]}</span>
                      {busy === `add:${network}` ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4 text-muted-foreground" />}
                    </button>
                  ))}
                </PickGroup>
              ) : null}
            </div>
          ),
        }]),
        ...(guest ? [] : extraTabs),
        ...(actions?.items.length
          ? [
              {
                value: "actions",
                label: actions.title,
                content: (
                  <div className="grid p-3">
                    {actions.items.map((item) => (
                      <ActionRow key={item.label} icon={item.icon} onClick={then(item.onClick)}>
                        {item.label}
                      </ActionRow>
                    ))}
                  </div>
                ),
              },
            ]
          : []),
      ]}
    />
    </NewProjectPopover>
  )
}

/**
 * AI spend cap: the most the project's AI may cost in a calendar month, in
 * dollars, saving itself like the name. Empty is no cap. Once this month's
 * spend reaches it, every AI button for the project is refused with why.
 */
function ProjectAiCapField({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const shown = project.aiCapCents === null ? "" : String(project.aiCapCents / 100)
  const [typed, setTyped] = React.useState(shown)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()
  const saved = React.useRef(project.aiCapCents)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = React.useId()

  const save = React.useCallback(
    async (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const parsed = parseCapDollars(next)
      if ("error" in parsed) {
        setInvalid(true)
        showErrorToast(parsed.error)
        return
      }
      setInvalid(false)
      if (parsed.cents === saved.current) return
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveProjectAiCap(project.id, parsed.cents)
        saved.current = parsed.cents
        setSaveStatus("saved")
        onSaved()
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getProjectErrorMessage(error))
      }
    },
    [onSaved, project.id, setSaveStatus]
  )

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Dollars a month</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="No cap"
        value={typed}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-spent`}
        onChange={(event) => {
          const next = event.target.value
          setTyped(next)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
        }}
        onBlur={() => void save(typed)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save(typed)
        }}
      />
      <p id={`${id}-spent`} className="text-xs text-muted-foreground">
        {dollarsText(project.aiSpentCents)} spent this month. Leave it empty for no cap.
      </p>
    </div>
  )
}

/** The name, saving 700ms after the last key, on Enter, and at once when the box is left. */
function ProjectNameField({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [name, setName] = React.useState(project.name)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()
  const saved = React.useRef(project.name)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = React.useCallback(
    async (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const trimmed = next.trim()
      if (trimmed === saved.current) return
      setInvalid(!trimmed)
      if (!trimmed) {
        showErrorToast("Give the project a name first.")
        return
      }
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveProject({ projectId: project.id, name: trimmed })
        saved.current = trimmed
        setSaveStatus("saved")
        onSaved()
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getProjectErrorMessage(error))
      }
    },
    [onSaved, project.id, setSaveStatus]
  )

  return (
    <Input
      aria-label="Project name"
      value={name}
      maxLength={120}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const next = event.target.value
        setName(next)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
      }}
      onBlur={() => void save(name)}
      onKeyDown={(event) => {
        if (event.key === "Enter") void save(name)
      }}
    />
  )
}
