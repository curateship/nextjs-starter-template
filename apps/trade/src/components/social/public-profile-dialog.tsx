import * as React from "react"
import { ExternalLinkIcon, Loader2Icon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  checkPublicProfileWallets,
  getPublicProfileErrorMessage,
  loadMyPublicProfileSettings,
  saveMyPublicProfileSettings,
  switchPublicProfile,
  type OwnershipCheck,
} from "@/lib/api/trade/public-profiles"
import { formatDate } from "@/lib/format/format-time"
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  LINKS_MAX,
  handleProblem,
  linkProblem,
  normalizeHandle,
  type MyPublicProfile,
  type PublicProfileInput,
  type PublicWallet,
} from "@/lib/trade/public-profile/profile"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Form = PublicProfileInput

function formFrom(data: MyPublicProfile): Form {
  const profile = data.profile
  return {
    handle: profile?.handle ?? "",
    displayName: profile?.displayName ?? data.suggested.displayName,
    picture: profile?.picture ?? data.suggested.picture,
    bio: profile?.bio ?? "",
    links: Array.from(
      { length: LINKS_MAX },
      (_, index) => profile?.links[index] ?? ""
    ),
    searchable: profile?.searchable ?? false,
  }
}

function sameForm(left: Form, right: Form): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** The first thing wrong with the form, in a sentence, or null. */
function formProblem(form: Form): { field: string; message: string } | null {
  const handleIssue = handleProblem(normalizeHandle(form.handle))
  if (handleIssue) return { field: "handle", message: handleIssue }
  if (!form.displayName.trim()) {
    return { field: "displayName", message: "Add a display name." }
  }
  for (const [index, link] of form.links.entries()) {
    const issue = link.trim() ? linkProblem(link.trim()) : null
    if (issue) return { field: `link-${index}`, message: issue }
  }
  return null
}

function failedCount(checks: readonly OwnershipCheck[]): number {
  return checks.filter((check) => check.result === "failed").length
}

/**
 * The member's own Public profile window, opened from the P&L page.
 *
 * Two steps in one window. The first edits the profile and lists the
 * wallets on it. Switching the page on goes to the second, which says in
 * plain words what becomes public before anything is.
 */
export function PublicProfileDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [data, setData] = React.useState<MyPublicProfile | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState<Form | null>(null)
  const [form, setForm] = React.useState<Form | null>(null)
  const [invalid, setInvalid] = React.useState<string | null>(null)
  const [step, setStep] = React.useState<"edit" | "confirm">("edit")
  const [busy, setBusy] = React.useState<"save" | "switch" | "check" | null>(
    null
  )

  const [attempt, setAttempt] = React.useState(0)

  const apply = React.useCallback((next: MyPublicProfile) => {
    setData(next)
    const fresh = formFrom(next)
    setSaved(fresh)
    setForm(fresh)
  }, [])

  /** Reads again after a change, keeping the window's place. */
  const load = React.useCallback(async () => {
    apply(await loadMyPublicProfileSettings())
  }, [apply])

  // A fresh window starts empty and on the first step.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setData(null)
      setForm(null)
      setSaved(null)
      setLoadError(null)
      setStep("edit")
      setInvalid(null)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let current = true
    loadMyPublicProfileSettings().then(
      (next) => {
        if (current) apply(next)
      },
      (error: unknown) => {
        if (current) setLoadError(getPublicProfileErrorMessage(error))
      }
    )
    return () => {
      current = false
    }
  }, [apply, attempt, open])

  const dirty = Boolean(form && saved && !sameForm(form, saved))
  const enabled = data?.profile?.enabled ?? false
  const handle = data?.profile?.handle ?? null

  function update(patch: Partial<Form>) {
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  /** Saves the form when it has changes. False when it could not. */
  async function saveIfNeeded(): Promise<boolean> {
    if (!form) return false
    const problem = formProblem(form)
    if (problem) {
      setInvalid(problem.field)
      showErrorToast(problem.message)
      return false
    }
    // The problem the last error named is fixed, so its message goes.
    setInvalid(null)
    dismissErrorToast()
    if (!dirty && data?.profile) return true
    setBusy("save")
    try {
      await saveMyPublicProfileSettings({
        ...form,
        links: form.links.filter((link) => link.trim()),
      })
      await load()
      return true
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (await saveIfNeeded()) toast.success("Public profile saved.")
  }

  async function switchOn() {
    setBusy("switch")
    try {
      const checks = await switchPublicProfile(true)
      await load()
      setStep("edit")
      toast.success(
        `Your profile is public at /t/${normalizeHandle(form?.handle ?? "")}.`
      )
      const failed = failedCount(checks)
      if (failed) {
        showErrorToast(
          `${failed} ${failed === 1 ? "wallet" : "wallets"} did not pass the ownership check and ${failed === 1 ? "does" : "do"} not count. The wallet list says why.`
        )
      }
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function switchOff() {
    setBusy("switch")
    try {
      await switchPublicProfile(false)
      await load()
      toast.success("Your profile is off. Nobody can open it now.")
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function checkAgain() {
    setBusy("check")
    try {
      const checks = await checkPublicProfileWallets()
      await load()
      const failed = failedCount(checks)
      const unchecked = checks.filter((one) => one.result === "unchecked")
      if (failed) {
        showErrorToast(
          `${failed} ${failed === 1 ? "wallet" : "wallets"} did not pass the ownership check and ${failed === 1 ? "does" : "do"} not count.`
        )
      } else if (unchecked.length) {
        showErrorToast(
          `${unchecked.length} ${unchecked.length === 1 ? "exchange" : "exchanges"} could not be asked just now, so the last answer stands. ${unchecked[0].note ?? ""}`
        )
      } else {
        toast.success("Every wallet passed the ownership check.")
      }
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const working = busy !== null

  return (
    <FormDialog open={open} dirty={dirty} busy={working} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Public profile</DialogTitle>
            <DialogDescription>
              A page anyone can open, showing what your real wallets made and
              lost. Trade works the figures out from the trades it recorded.
            </DialogDescription>
          </DialogHeader>
          {!form || !data ? (
            <>
              <DialogBody>
                <Card size="sm">
                  <CardContent className="grid justify-items-center gap-3 py-4 text-sm text-muted-foreground">
                    {loadError ? (
                      <>
                        <p>{loadError}</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setLoadError(null)
                            setAttempt((count) => count + 1)
                          }}
                        >
                          <RotateCcwIcon className="size-4" />
                          Try again
                        </Button>
                      </>
                    ) : (
                      <Loader2Icon
                        className="size-4 animate-spin"
                        aria-label="Reading your profile"
                      />
                    )}
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          ) : step === "confirm" ? (
            <SwitchOnStep
              wallets={data.wallets}
              busy={busy === "switch"}
              onBack={() => setStep("edit")}
              onConfirm={() => void switchOn()}
            />
          ) : (
            <form
              // The body scrolls only as a flex child of the window.
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <DialogBody>
                {data.profile?.hiddenAt ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle as="h3">Hidden by an admin</CardTitle>
                      <CardDescription>
                        Since {formatDate(new Date(data.profile.hiddenAt))}.
                        Nobody can open the page and it is off the leaderboard.
                        Your record is untouched.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {data.profile.hiddenReason}
                    </CardContent>
                  </Card>
                ) : null}

                <Card size="sm">
                  <CardContent className="flex items-start justify-between gap-3">
                    <div className="grid gap-1 text-sm">
                      <Label htmlFor="profile-enabled">Public page</Label>
                      {enabled && handle ? (
                        <a
                          href={`/t/${handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4"
                        >
                          /t/{handle}
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      ) : (
                        <p className="text-muted-foreground">
                          Off. Nobody can open it.
                        </p>
                      )}
                    </div>
                    <Switch
                      id="profile-enabled"
                      checked={enabled}
                      disabled={working}
                      onCheckedChange={(next) => {
                        if (!next) {
                          void switchOff()
                          return
                        }
                        void saveIfNeeded().then((ok) => {
                          if (ok) setStep("confirm")
                        })
                      }}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <ImageUpload
                        label="Picture"
                        value={form.picture ?? ""}
                        onChange={(url) => update({ picture: url || null })}
                        aspect="square"
                        emptyLabel="Add picture"
                        inlinePicker
                        className="max-w-20"
                      />
                      <div className="grid gap-4 sm:flex-1">
                        <div className="grid gap-2">
                          <Label htmlFor="profile-handle">Handle</Label>
                          <Input
                            id="profile-handle"
                            value={form.handle}
                            maxLength={HANDLE_MAX + 1}
                            spellCheck={false}
                            autoCapitalize="none"
                            placeholder="sam"
                            aria-invalid={invalid === "handle" || undefined}
                            onBlur={() =>
                              setInvalid(
                                handleProblem(normalizeHandle(form.handle))
                                  ? "handle"
                                  : null
                              )
                            }
                            onChange={(event) =>
                              update({ handle: event.target.value })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Your address: /t/
                            {normalizeHandle(form.handle) || "handle"}. A handle
                            you give up is kept from everybody else for 90 days.
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="profile-name">Display name</Label>
                          <Input
                            id="profile-name"
                            value={form.displayName}
                            maxLength={DISPLAY_NAME_MAX}
                            aria-invalid={
                              invalid === "displayName" || undefined
                            }
                            onChange={(event) =>
                              update({ displayName: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="profile-bio">Bio</Label>
                      <Textarea
                        id="profile-bio"
                        value={form.bio}
                        maxLength={BIO_MAX}
                        rows={1}
                        onChange={(event) =>
                          update({ bio: event.target.value })
                        }
                      />
                    </div>
                    {form.links.map((link, index) => (
                      <div key={index} className="grid gap-2">
                        <Label htmlFor={`profile-link-${index}`}>
                          Link {index + 1}
                        </Label>
                        <Input
                          id={`profile-link-${index}`}
                          value={link}
                          inputMode="url"
                          placeholder="https://"
                          aria-invalid={
                            invalid === `link-${index}` || undefined
                          }
                          onChange={(event) =>
                            update({
                              links: form.links.map((one, at) =>
                                at === index ? event.target.value : one
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="profile-searchable"
                        checked={form.searchable}
                        onCheckedChange={(checked) =>
                          update({ searchable: checked === true })
                        }
                      />
                      <Label htmlFor="profile-searchable">
                        Let search engines list me
                      </Label>
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">Wallets on this profile</CardTitle>
                    <CardDescription>
                      Every real-money wallet you have, and every one you add
                      later. None can be taken off. Practice and testnet wallets
                      never count.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {data.wallets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No real-money wallets yet.
                      </p>
                    ) : (
                      <ul className="grid gap-2 text-sm">
                        {data.wallets.map((wallet) => (
                          <WalletLine key={wallet.id} wallet={wallet} />
                        ))}
                      </ul>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-self-start"
                      disabled={working}
                      onClick={() => void checkAgain()}
                    >
                      {busy === "check" ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <RotateCcwIcon className="size-4" />
                      )}
                      Check wallets again
                    </Button>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={working}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={working}>
                  {busy === "save" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  {data.profile ? "Save changes" : "Create profile"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}

function WalletLine({ wallet }: { wallet: PublicWallet }) {
  const status =
    wallet.check === "failed"
      ? `Does not count. ${wallet.checkNote ?? ""}`
      : wallet.removedAt !== null
        ? `Removed on ${formatDate(new Date(wallet.removedAt))}. Its trades still count.`
        : wallet.check === "onchain"
          ? `${wallet.address}, on-chain`
          : "Checked by Trade, not visible on-chain"
  return (
    <li className="grid gap-0.5">
      <span className="font-medium">{wallet.venue}</span>
      <span className="text-muted-foreground">{status}</span>
    </li>
  )
}

/** The one screen that says what becomes public, before anything does. */
function SwitchOnStep({
  wallets,
  busy,
  onBack,
  onConfirm,
}: {
  wallets: PublicWallet[]
  busy: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const live = wallets.filter((wallet) => wallet.removedAt === null)
  const onChain = live.filter((wallet) => wallet.check === "onchain")
  return (
    <>
      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle as="h3">What becomes public</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              Every real-money trade from every live wallet you have:{" "}
              {live.length} {live.length === 1 ? "wallet" : "wallets"} today,
              and every one you add later. You cannot leave one out.
            </p>
            <p>
              The dollar amounts: what you made and lost over 7 days, 30 days
              and all time, what you paid in fees, how many trades made money,
              and your worst stretch.
            </p>
            {onChain.length ? (
              <div className="grid gap-1">
                <p>
                  These addresses, linked to each chain&apos;s explorer. Anyone
                  can read a wallet&apos;s whole history there, including
                  anything you did outside Trade.
                </p>
                <ul className="grid gap-0.5 text-muted-foreground">
                  {onChain.map((wallet) => (
                    <li key={wallet.id}>
                      {wallet.venue}: {wallet.address}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p>
              A wallet you delete later stays on the page with its trades,
              marked as removed. Binning a Journal row does not take it off
              either.
            </p>
            <p className="text-muted-foreground">
              Never shown: which coins you hold right now or at what price, only
              how many positions are open. Practice and testnet wallets never
              appear. Switching the page off hides it and keeps the record.
            </p>
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onBack}
        >
          Go back
        </Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Switch on
        </Button>
      </DialogFooter>
    </>
  )
}
