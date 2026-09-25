import * as React from "react"
import { DndContext, closestCenter } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { SettingsCardSection } from "@/components/settings/settings-card-section"
import {
  DRAG_HANDLE_CLASS,
  createShellId,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { ShellIconPicker } from "@/components/settings/shell-icon-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import {
  MAX_PUBLIC_USER_PANEL_HREF_LENGTH,
  MAX_PUBLIC_USER_PANEL_LABEL_LENGTH,
  MAX_PUBLIC_USER_PANEL_LINKS,
  PUBLIC_USER_PANEL_BUTTON_KEYS,
  PUBLIC_USER_PANEL_BUTTON_STYLE_LABELS,
  PUBLIC_USER_PANEL_BUTTON_STYLES,
  getPublicUserPanelAddressProblem,
  type PublicUserPanel,
  type PublicUserPanelButton,
  type PublicUserPanelButtonKey,
  type PublicUserPanelButtonStyle,
  type PublicUserPanelLink,
} from "@/lib/pages/public-user-panel"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const BUTTON_TITLES: Record<PublicUserPanelButtonKey, string> = {
  login: "Sign in",
  register: "Register",
}

/**
 * Settings for the account corner of the public header: the Sign in and
 * Register buttons a signed-out visitor sees, and the links a signed-in
 * visitor finds under their photo. Copied from the directory app's User Panel.
 */
export function PublicUserPanelSettings({
  panel,
  onChange,
}: {
  panel: PublicUserPanel
  onChange: (panel: PublicUserPanel) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const linkCount = panel.links.length

  const summary = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <ul className="grid gap-1 text-sm text-muted-foreground">
          {PUBLIC_USER_PANEL_BUTTON_KEYS.map((key) => (
            <li key={key}>
              <span className="font-medium text-foreground">
                {panel[key].label}
              </span>{" "}
              {panel[key].href ? `goes to ${panel[key].href}` : "is hidden"}
            </li>
          ))}
          <li>
            {linkCount
              ? `${linkCount} ${linkCount === 1 ? "link" : "links"} in the signed-in menu`
              : "No extra links in the signed-in menu"}
          </li>
        </ul>
      <Button type="button" variant="outline" onClick={() => setEditing(true)}>
        <SettingsIcon />
        Edit user panel
      </Button>
    </div>
  )

  const title = "User panel"
  const description =
    "The Sign in and Register buttons at the right of the public header, and the links a signed-in visitor sees under their photo."

  return (
    <>
      <SettingsCardSection title={title} description={description}>
        {summary}
      </SettingsCardSection>

      {editing ? (
        <PublicUserPanelDialog
          panel={panel}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            onChange(next)
            setEditing(false)
          }}
        />
      ) : null}
    </>
  )
}

function PublicUserPanelDialog({
  panel,
  onClose,
  onSave,
}: {
  panel: PublicUserPanel
  onClose: () => void
  onSave: (panel: PublicUserPanel) => void
}) {
  const [draft, setDraft] = React.useState(panel)
  // Marks every field that is still wrong once Save has been tried, not only
  // the ones already visited.
  const [attempted, setAttempted] = React.useState(false)
  const sensors = useNavSensors()
  const linkIds = draft.links.map((link) => link.id)
  const dirty = JSON.stringify(draft) !== JSON.stringify(panel)
  const atLinkLimit = draft.links.length >= MAX_PUBLIC_USER_PANEL_LINKS

  const changeButton = (
    key: PublicUserPanelButtonKey,
    patch: Partial<PublicUserPanelButton>
  ) =>
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }))

  const changeLink = (id: string, patch: Partial<PublicUserPanelLink>) =>
    setDraft((current) => ({
      ...current,
      links: current.links.map((link) =>
        link.id === id ? { ...link, ...patch } : link
      ),
    }))

  const save = () => {
    setAttempted(true)
    const problem = findDraftProblem(draft)
    if (problem) {
      showErrorToast(problem)
      return
    }

    onSave({
      login: trimButton(draft.login),
      register: trimButton(draft.register),
      links: draft.links.map((link) => ({
        ...link,
        label: link.label.trim(),
        href: link.href.trim(),
      })),
    })
  }

  return (
    <FormDialog open dirty={dirty} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>User panel settings</DialogTitle>
            <DialogDescription>
              Set up the Sign in and Register buttons, plus the links in the
              signed-in menu.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            {PUBLIC_USER_PANEL_BUTTON_KEYS.map((key) => (
              <UserPanelButtonCard
                key={key}
                buttonKey={key}
                button={draft[key]}
                attempted={attempted}
                onChange={(patch) => changeButton(key, patch)}
              />
            ))}

            <Card size="sm">
              <CardHeader>
                <CardTitle>Signed-in menu links</CardTitle>
                <CardDescription>
                  Shown under the visitor&apos;s photo once they sign in, above
                  Dashboard and Log out.
                </CardDescription>
                <CardAction>
                  <DisabledReason
                    disabled={atLinkLimit}
                    reason={`The signed-in menu can hold up to ${MAX_PUBLIC_USER_PANEL_LINKS} links.`}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      disabled={atLinkLimit}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          links: [
                            ...current.links,
                            {
                              id: createShellId("public-user-panel-link"),
                              label: "",
                              href: "",
                              icon: "",
                            },
                          ],
                        }))
                      }
                    >
                      <PlusIcon />
                      Add link
                    </Button>
                  </DisabledReason>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                {draft.links.length ? (
                  <DndContext
                    id="custom-shell-public-user-panel-links"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      if (!event.over || event.active.id === event.over.id) {
                        return
                      }
                      const oldIndex = linkIds.indexOf(String(event.active.id))
                      const newIndex = linkIds.indexOf(String(event.over.id))
                      if (oldIndex === -1 || newIndex === -1) return
                      setDraft((current) => ({
                        ...current,
                        links: arrayMove(current.links, oldIndex, newIndex),
                      }))
                    }}
                  >
                    <SortableContext
                      items={linkIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-4">
                        {draft.links.map((link, index) => (
                          <UserPanelLinkRow
                            key={link.id}
                            link={link}
                            index={index}
                            attempted={attempted}
                            onChange={(patch) => changeLink(link.id, patch)}
                            onDelete={() =>
                              setDraft((current) => ({
                                ...current,
                                links: current.links.filter(
                                  (item) => item.id !== link.id
                                ),
                              }))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No links yet. Signed-in visitors see Dashboard and Log out.
                  </p>
                )}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function UserPanelButtonCard({
  buttonKey,
  button,
  attempted,
  onChange,
}: {
  buttonKey: PublicUserPanelButtonKey
  button: PublicUserPanelButton
  attempted: boolean
  onChange: (patch: Partial<PublicUserPanelButton>) => void
}) {
  const [addressTouched, setAddressTouched] = React.useState(false)
  const [labelTouched, setLabelTouched] = React.useState(false)
  const title = BUTTON_TITLES[buttonKey]
  const id = `public-user-panel-${buttonKey}`
  const addressProblem = getPublicUserPanelAddressProblem(button.href, true)
  const labelMissing = !button.label.trim()

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Desktop shows this as a button. Phones list it under the round
          account button when Show on phones is on.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.5fr)_auto]">
          <div className="grid gap-2">
            {/* The picker button names itself for screen readers, so this
                word is only for the eye. */}
            <span aria-hidden className="text-sm font-medium">
              Icon
            </span>
            <ShellIconPicker
              value={button.icon || undefined}
              compact
              allowEmpty
              onValueChange={(icon) => onChange({ icon: icon ?? "" })}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor={`${id}-label`}>Name</FieldLabel>
            <Input
              id={`${id}-label`}
              value={button.label}
              maxLength={MAX_PUBLIC_USER_PANEL_LABEL_LENGTH}
              placeholder={title}
              aria-invalid={
                (attempted || labelTouched) && labelMissing ? true : undefined
              }
              onChange={(event) => onChange({ label: event.target.value })}
              onBlur={() => {
                setLabelTouched(true)
                if (labelMissing) showErrorToast(`Give the ${title} button a name.`)
              }}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`${id}-href`}
              hint="Leave it empty to hide this button everywhere."
            >
              Address
            </FieldLabel>
            <Input
              id={`${id}-href`}
              value={button.href}
              maxLength={MAX_PUBLIC_USER_PANEL_HREF_LENGTH}
              placeholder={buttonKey === "login" ? "/login" : "/register"}
              aria-invalid={
                (attempted || addressTouched) && addressProblem
                  ? true
                  : undefined
              }
              onChange={(event) => onChange({ href: event.target.value })}
              onBlur={() => {
                setAddressTouched(true)
                if (addressProblem) showErrorToast(addressProblem)
              }}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor={`${id}-style`}>Style</FieldLabel>
            <Select
              value={button.style}
              onValueChange={(style) =>
                onChange({ style: style as PublicUserPanelButtonStyle })
              }
            >
              <SelectTrigger id={`${id}-style`} className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUBLIC_USER_PANEL_BUTTON_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {PUBLIC_USER_PANEL_BUTTON_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SettingsSwitchRow
          id={`${id}-phone`}
          checked={button.showOnPhone}
          onCheckedChange={(showOnPhone) => onChange({ showOnPhone })}
          label="Show on phones"
        />
      </CardContent>
    </Card>
  )
}

function UserPanelLinkRow({
  link,
  index,
  attempted,
  onChange,
  onDelete,
}: {
  link: PublicUserPanelLink
  index: number
  attempted: boolean
  onChange: (patch: Partial<PublicUserPanelLink>) => void
  onDelete: () => void
}) {
  const [labelTouched, setLabelTouched] = React.useState(false)
  const [addressTouched, setAddressTouched] = React.useState(false)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    link.id,
    true
  )
  const labelMissing = !link.label.trim()
  const addressProblem = getPublicUserPanelAddressProblem(link.href, false)
  const name = link.label.trim() || `link ${index + 1}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-lg border bg-background p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(DRAG_HANDLE_CLASS, "shrink-0")}
        aria-label={`Reorder ${name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <ShellIconPicker
        value={link.icon || undefined}
        compact
        allowEmpty
        onValueChange={(icon) => onChange({ icon: icon ?? "" })}
      />
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        <Input
          value={link.label}
          maxLength={MAX_PUBLIC_USER_PANEL_LABEL_LENGTH}
          placeholder="Edit profile"
          aria-label={`Label for ${name}`}
          aria-invalid={
            (attempted || labelTouched) && labelMissing ? true : undefined
          }
          onChange={(event) => onChange({ label: event.target.value })}
          onBlur={() => {
            setLabelTouched(true)
            if (labelMissing) showErrorToast("Give this link a label.")
          }}
        />
        <Input
          value={link.href}
          maxLength={MAX_PUBLIC_USER_PANEL_HREF_LENGTH}
          placeholder="/account"
          aria-label={`Address for ${name}`}
          aria-invalid={
            (attempted || addressTouched) && addressProblem ? true : undefined
          }
          onChange={(event) => onChange({ href: event.target.value })}
          onBlur={() => {
            setAddressTouched(true)
            if (addressProblem) showErrorToast(addressProblem)
          }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={onDelete}
        aria-label={`Delete ${name}`}
      >
        <Trash2Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** The first thing Save would refuse, in the words the admin is told. */
function findDraftProblem(draft: PublicUserPanel) {
  for (const key of PUBLIC_USER_PANEL_BUTTON_KEYS) {
    const button = draft[key]
    if (!button.label.trim()) {
      return `Give the ${BUTTON_TITLES[key]} button a name.`
    }
    const addressProblem = getPublicUserPanelAddressProblem(button.href, true)
    if (addressProblem) return `${BUTTON_TITLES[key]}: ${addressProblem}`
  }

  for (const link of draft.links) {
    if (!link.label.trim()) return "Give every signed-in menu link a label."
    const addressProblem = getPublicUserPanelAddressProblem(link.href, false)
    if (addressProblem) return addressProblem
  }

  return null
}

function trimButton(button: PublicUserPanelButton): PublicUserPanelButton {
  return { ...button, label: button.label.trim(), href: button.href.trim() }
}
