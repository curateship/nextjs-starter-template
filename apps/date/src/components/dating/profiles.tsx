import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { createProfile } from "@/lib/api/dating/profiles"
import { datingErrorMessage } from "@/lib/dating/errors"
import { DATING_APP_WORDS, DATING_APPS, PROFILE_NAME_MAX, type DatingApp } from "@/lib/dating/options"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { FlatSection } from "./flat-section"
import { LeadAvatar } from "./lead-avatar"
import { PairingSteps } from "./phone-panel"
import { DatingPicture } from "./picture"

/**
 * Profiles on the Dating dashboard (task "features/06-profiles", Tyler,
 * 20 Oct 2026): one member runs several dating profiles, each one app's
 * account, and the dashboard shows one at a time. The picker at the top of
 * the left panel names the open one and lists the rest; the Profiles section
 * lists them all with their phone and what waits on the member; New profile
 * makes one with a copy of the open profile's settings and its pair code.
 */

type ProfileItem = DatingDashboard["profiles"][number]

/** A profile's round mark: its first photo once the phone has read it, else its name's letter. */
function ProfileMark({ profile, className }: { profile: Pick<ProfileItem, "name" | "photoId">; className?: string }) {
  if (profile.photoId) return <DatingPicture pictureId={profile.photoId} alt="" className={cn("size-7 shrink-0 rounded-full", className)} />
  return <LeadAvatar name={profile.name} className={cn("size-7 text-xs", className)} />
}

/** "Tinder · Pixel 8a here" and the like: the app, then where its phone stands. */
function profileWords(profile: ProfileItem): string {
  const phone = profile.phone ? `${profile.phone.name} ${profile.phone.here ? "here" : "away"}` : "no phone yet"
  return `${DATING_APP_WORDS[profile.app].name} · ${phone}`
}

/**
 * The left panel header's title: the open profile, which opens the list of
 * the others and New profile.
 */
export function ProfilePicker({
  data,
  onPick,
  onNew,
}: {
  data: DatingDashboard
  onPick: (accountId: string) => void
  onNew: () => void
}) {
  const open = data.profiles.find((profile) => profile.id === data.profile.id)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" className="h-8 max-w-full min-w-0 gap-2 px-1.5" aria-label={`Profile: ${data.profile.name}. Switch profile`}>
          {open ? <ProfileMark profile={open} className="size-6" /> : null}
          <span className="min-w-0 truncate text-[15px] font-semibold">{data.profile.name}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {data.profiles.map((profile) => (
          <DropdownMenuItem key={profile.id} onSelect={() => profile.id !== data.profile.id && onPick(profile.id)}>
            <ProfileMark profile={profile} />
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{profile.name}</span>
              <span className="truncate text-xs text-muted-foreground">{profileWords(profile)}</span>
            </span>
            {profile.id === data.profile.id ? <CheckIcon className="size-4 shrink-0" aria-label="Open now" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNew}>
          <PlusIcon /> New profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The Profiles section of the left panel: every profile with its app, its
 * phone and how many leads wait on the member. The open one is marked;
 * pressing another switches the dashboard to it.
 */
export function ProfilesSection({ data, onPick, onNew }: { data: DatingDashboard; onPick: (accountId: string) => void; onNew: () => void }) {
  return (
    <FlatSection storageId="date-summary-profiles" title="Profiles" meta={data.profiles.length}>
      <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)]">
        {data.profiles.map((profile) => {
          const open = profile.id === data.profile.id
          return (
            <li key={profile.id}>
              <button
                type="button"
                aria-current={open ? "true" : undefined}
                onClick={() => !open && onPick(profile.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                  open && "bg-muted",
                  focusRingInset
                )}
              >
                <ProfileMark profile={profile} />
                <span className="grid min-w-0 flex-1">
                  <span className={cn("truncate", open && "font-medium")}>
                    {profile.name}
                    {profile.paused ? <span className="font-normal text-muted-foreground"> · Paused</span> : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", profile.phone?.here ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                    <span className="truncate">{profileWords(profile)}</span>
                  </span>
                </span>
                {profile.waiting ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{profile.waiting} waiting</span>
                ) : null}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={onNew}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              focusRingInset
            )}
          >
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed">
              <PlusIcon className="size-3.5" />
            </span>
            New profile
          </button>
        </li>
      </ul>
    </FlatSection>
  )
}

/**
 * New profile: a name and the app, then the pair code for its phone. The
 * profile starts with a copy of the open profile's settings, apart from
 * Google Calendar, which it connects itself. Hinge shows as coming. Closing
 * the window once the profile is made opens it on the dashboard.
 */
export function NewProfileDialog({
  open,
  copyFrom,
  onClose,
  onMade,
}: {
  open: boolean
  /** The open profile's name, whose settings the new one starts with. */
  copyFrom: string
  onClose: () => void
  /** The profile was made and its code shown; the dashboard switches to it. */
  onMade: (accountId: string) => void
}) {
  const id = React.useId()
  const [name, setName] = React.useState("")
  const [app, setApp] = React.useState<DatingApp>("tinder")
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const [made, setMade] = React.useState<{ accountId: string; code: string; expiresAt: Date } | null>(null)

  // Each opening starts empty.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName("")
      setApp("tinder")
      setInvalid(false)
      setMade(null)
    }
  }

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the profile a name.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      setMade(await createProfile(name, app))
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const close = () => (made ? onMade(made.accountId) : onClose())

  return (
    <FormDialog open={open} dirty={!made && name.trim() !== ""} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{made ? `Pair a phone for ${name.trim()}` : "New profile"}</DialogTitle>
            <DialogDescription>
              {made
                ? "The profile is made. Pair its phone now, or later from the Phone panel. Done opens it."
                : `One dating app's account, with its own phone, leads, chats and settings. It starts with ${copyFrom}'s settings, to change in its own settings window.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {made ? (
              <div className="text-sm">
                <PairingSteps code={made} />
              </div>
            ) : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Profile</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                    <Input
                      id={`${id}-name`}
                      value={name}
                      maxLength={PROFILE_NAME_MAX}
                      placeholder="Weekends"
                      disabled={busy}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (event.target.value.trim()) setInvalid(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void create()
                        }
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={`${id}-app`}>App</FieldLabel>
                    <Select value={app} disabled={busy} onValueChange={(next) => setApp(next as DatingApp)}>
                      <SelectTrigger id={`${id}-app`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATING_APPS.map((item) => (
                          <SelectItem key={item} value={item} disabled={!DATING_APP_WORDS[item].ready}>
                            {DATING_APP_WORDS[item].name}
                            {DATING_APP_WORDS[item].ready ? "" : ", coming"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}
          </DialogBody>
          <DialogFooter>
            {made ? (
              <Button type="button" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy} onClick={() => void create()}>
                  {busy ? <Loader2Icon className="animate-spin" /> : null}
                  Create profile
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
