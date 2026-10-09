import * as React from "react"
import { getRouteApi, Link, useRouter } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ProfilePhoto } from "@/components/pomodoro/profile-photo"
import { SocialMark } from "@/components/pomodoro/social-marks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { loadUploadLibrary } from "@/lib/api/pomodoro/media-uploads"
import {
  loadMyPublicProfile,
  saveMyPublicProfile,
} from "@/lib/api/pomodoro/public-profile"
import { ACHIEVEMENTS, findAchievement } from "@/lib/pomodoro/achievements"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { useMediaCatalog } from "@/lib/pomodoro/room-media-store"
import {
  BANNER_UPLOAD_LOCKED_REASON,
  BIO_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_RESERVED_MESSAGE,
  HANDLE_SHAPE_MESSAGE,
  HANDLE_TAKEN_MESSAGE,
  MAX_PINNED_BADGES,
  PROFILE_SECTIONS,
  RESERVED_HANDLES,
  isHandleShape,
  normalizeHandle,
  type ProfileSectionKey,
} from "@/lib/pomodoro/public-profile"
import {
  MAX_PUBLIC_SOCIAL_LINKS,
  PUBLIC_SOCIAL_LINKS_FULL_MESSAGE,
  PUBLIC_SOCIAL_PLATFORMS,
  PUBLIC_SOCIAL_PLATFORM_LABELS,
  PUBLIC_SOCIAL_URL_MESSAGE,
  normalizePublicSocialUrl,
  type PublicSocialLink,
  type PublicSocialPlatform,
} from "@/lib/pages/public-social"
import { PROFILE_HIDDEN_NOTICE } from "@/lib/pomodoro/profile-reports"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { TextLink } from "@/components/pomodoro/text-link"

/**
 * The "Your public page" card, the Public page tab on Settings.
 *
 * It has a tab of its own rather than sitting inside "Your profile" because the two answer
 * different questions. The display name is what other members see on the
 * leaderboard and in rooms whether anything is published or not; everything
 * here is about one page on the open internet, and a card that mixes the two
 * cannot be read at a glance.
 *
 * Every switch starts off. Nothing is published because somebody opened this
 * card, only because they pressed Save with a switch on.
 */

type Draft = {
  handle: string
  profilePublic: boolean
  bio: string
  socialLinks: PublicSocialLink[]
  bannerRef: string | null
  pinnedBadges: string[]
  showFigures: boolean
  showBadges: boolean
  showHeatmap: boolean
  showProjects: boolean
  showFocusingNow: boolean
  showRoom: boolean
  listed: boolean
  cheersEnabled: boolean
}

type UploadOption = { mediaId: string; name: string; url: string }

/**
 * The live page's full address, a Copy button and the link to open it. Shown
 * only once the page is saved and switched on, so it never leads somewhere
 * nobody else can see yet.
 */
function PageAddress({ handle }: { handle: string }) {
  const address = `${globalThis.location?.origin ?? ""}/u/${handle}`
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const copiedTimer = React.useRef<number | null>(null)
  React.useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    },
    []
  )

  const copy = async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      <p className="font-mono text-xs break-all text-muted-foreground">
        {address}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? "Copied" : "Copy address"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/u/$handle" params={{ handle }}>
            Open my page
          </Link>
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Address copied" : ""}
      </span>
      {copyFailed ? (
        <p className="text-xs text-muted-foreground">
          Copying failed. The address is {address}
        </p>
      ) : null}
    </div>
  )
}

const productLayout = getRouteApi("/_pomodoro")

export default function PublicProfileSettingsPanel() {
  // The account's own photo, from the layout rather than this card's load, so
  // a new one picked on the Your profile card above shows here at once.
  const avatarUrl = productLayout.useLoaderData().user?.avatarUrl || null
  const router = useRouter()
  const [draft, setDraft] = React.useState<Draft | null>(null)
  // What the server holds, as opposed to what is typed. The link to the page
  // follows this, because a page is only live once it is saved.
  const [saved, setSaved] = React.useState<{
    handle: string
    profilePublic: boolean
  } | null>(null)
  const [hiddenAt, setHiddenAt] = React.useState<Date | string | null>(null)
  const [earnedBadgeIds, setEarnedBadgeIds] = React.useState<string[]>([])
  const [uploads, setUploads] = React.useState<UploadOption[]>([])
  const [canUpload, setCanUpload] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    // Both together rather than one after the other: the card draws once,
    // when it can draw everything, and two waits in a row is twice the blank
    // card. The library answers `canUploadMedia` itself, so the Pro question
    // costs no third call.
    void Promise.all([
      loadMyPublicProfile(browserTimezone()),
      loadUploadLibrary("background"),
    ])
      .then(([profile, library]) => {
        if (cancelled) return
        setDraft({
          handle: profile.handle ?? "",
          profilePublic: profile.profilePublic,
          bio: profile.bio,
          socialLinks: profile.socialLinks,
          bannerRef: profile.bannerRef,
          pinnedBadges: profile.pinnedBadges,
          showFigures: profile.showFigures,
          showBadges: profile.showBadges,
          showHeatmap: profile.showHeatmap,
          showProjects: profile.showProjects,
          showFocusingNow: profile.showFocusingNow,
          showRoom: profile.showRoom,
          listed: profile.listed,
          cheersEnabled: profile.cheersEnabled,
        })
        setSaved({
          handle: profile.handle ?? "",
          profilePublic: profile.profilePublic,
        })
        setHiddenAt(profile.hiddenAt)
        setEarnedBadgeIds(profile.earnedBadgeIds)
        setUploads(
          library.uploads
            .filter((item) => item.kind === "image" && item.status === "ready")
            .map((item) => ({
              mediaId: item.mediaId,
              name: item.name,
              url: item.url,
            }))
        )
        setCanUpload(library.canUploadMedia)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const change = (patch: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current))

  const handleClean = draft ? normalizeHandle(draft.handle) : ""
  const handleBad = Boolean(handleClean) && !isHandleShape(handleClean)

  const save = async () => {
    if (!draft) return
    if (handleClean && !isHandleShape(handleClean)) {
      showErrorToast(HANDLE_SHAPE_MESSAGE)
      return
    }
    if (handleClean && RESERVED_HANDLES.has(handleClean)) {
      showErrorToast(HANDLE_RESERVED_MESSAGE)
      return
    }
    if (draft.profilePublic && !handleClean) {
      showErrorToast(
        "Pick a handle before switching the page on. Without one there is no address for it to live at."
      )
      return
    }
    setSaving(true)
    try {
      const saved = await saveMyPublicProfile({
        handle: handleClean || null,
        profilePublic: draft.profilePublic,
        bio: draft.bio.trim() || null,
        socialLinks: draft.socialLinks,
        bannerRef: draft.bannerRef,
        pinnedBadges: draft.pinnedBadges,
        showFigures: draft.showFigures,
        showBadges: draft.showBadges,
        showHeatmap: draft.showHeatmap,
        showProjects: draft.showProjects,
        showFocusingNow: draft.showFocusingNow,
        showRoom: draft.showRoom,
        listed: draft.listed,
        cheersEnabled: draft.cheersEnabled,
      })
      // The saved row wins over the draft: the server drops a bad address and
      // a pin for a badge nobody earned, and the card must show what is
      // actually stored rather than what was typed.
      setSaved({
        handle: saved.handle ?? "",
        profilePublic: saved.profilePublic,
      })
      change({
        handle: saved.handle ?? "",
        socialLinks: saved.socialLinks,
        pinnedBadges: saved.pinnedBadges,
        bannerRef: saved.bannerRef,
      })
      // The header's account menu offers "Your profile" only while this page
      // opens, so a handle or the on switch changing has to reach it.
      await router.invalidate()
      toast.success("Public page saved.")
    } catch (cause) {
      showErrorToast(saveMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  // Four cards of related settings and one Save under them all, Tyler's
  // call: the save sends every card at once, exactly as the single card did.
  // Until the settings are in, one card stands for the set, so loading and a
  // failure are said once rather than four times.
  return (
    <div className="flex flex-col gap-4">
      {/* An operator's hide is the one thing here the member did not do
          themselves, so it is said first and plainly. */}
      {hiddenAt ? (
        <p
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          {PROFILE_HIDDEN_NOTICE}
        </p>
      ) : null}
      {!draft ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your public page</CardTitle>
          </CardHeader>
          <CardContent>
            {loadFailed ? (
              <ErrorRow
                message="Your public page settings could not be loaded."
                onRetry={() => {
                  dismissErrorToast()
                  setLoadFailed(false)
                  setAttempt((count) => count + 1)
                }}
              />
            ) : (
              <LoadingRow label="Loading your public page…" />
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6">
                <section className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 gap-2">
                    <FieldLabel
                      htmlFor="profile-handle"
                      hint="3 to 30 characters: lowercase letters, digits, hyphens and underscores. This is the address people will type, so changing it breaks every link to the old one."
                    >
                      Handle
                    </FieldLabel>
                    <Input
                      id="profile-handle"
                      maxLength={HANDLE_MAX_LENGTH}
                      value={draft.handle}
                      placeholder="sarah"
                      aria-invalid={handleBad ? true : undefined}
                      onChange={(event) =>
                        change({ handle: event.target.value.toLowerCase() })
                      }
                    />
                    <p className="font-mono text-xs text-muted-foreground">
                      /u/{handleClean || "your-handle"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id="profile-public"
                      checked={draft.profilePublic}
                      onCheckedChange={(checked) =>
                        change({ profilePublic: checked })
                      }
                    />
                    <Label htmlFor="profile-public">
                      Publish my page at that address
                    </Label>
                  </div>
                  {saved?.profilePublic &&
                  saved.handle &&
                  draft.profilePublic &&
                  handleClean === saved.handle ? (
                    <PageAddress handle={saved.handle} />
                  ) : draft.profilePublic ? (
                    <p className="text-sm text-muted-foreground">
                      Save to publish your page.
                    </p>
                  ) : null}
                </section>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>How it looks</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6">
                <section className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 gap-2">
                    <FieldLabel
                      htmlFor="profile-bio"
                      hint="A few lines about you. It is drawn as plain text, so anything that looks like markup appears as the characters you typed."
                    >
                      About you
                    </FieldLabel>
                    <Textarea
                      id="profile-bio"
                      maxLength={BIO_MAX_LENGTH}
                      value={draft.bio}
                      placeholder="Two lines about what you are working on."
                      onChange={(event) => change({ bio: event.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {BIO_MAX_LENGTH - draft.bio.length} characters left
                    </p>
                  </div>

                  <SocialLinksField
                    links={draft.socialLinks}
                    onChange={(socialLinks) => change({ socialLinks })}
                  />
                </section>

                <section className="grid grid-cols-1 gap-2">
                  <FieldLabel hint="The picture on your account is the one your page shows. With no picture your page draws your coloured initials, exactly as the leaderboard does.">
                    Your picture
                  </FieldLabel>
                  <div className="flex items-center gap-3">
                    <ProfilePhoto
                      name={handleClean || "you"}
                      avatarUrl={avatarUrl}
                      className="size-12 text-base"
                    />
                    <p className="text-sm text-muted-foreground">
                      {/* The photo card moved to the Profile tab, so "the card
                          above" became a link to it. */}
                      {avatarUrl ? "Change it" : "Add one"} on the{" "}
                      <TextLink to="/settings" search={{ tab: "profile" }}>
                        Profile tab
                      </TextLink>
                      {avatarUrl
                        ? "."
                        : ", or leave it and your initials are drawn."}
                    </p>
                  </div>
                </section>

                <BannerField
                  value={draft.bannerRef}
                  uploads={uploads}
                  canUpload={canUpload}
                  onChange={(bannerRef) => change({ bannerRef })}
                />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What it shows</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6">
                <section className="grid grid-cols-1 gap-3">
                  <FieldLabel hint="Each one is off until you switch it on. Nobody sees a section until you do.">
                    What your page shows
                  </FieldLabel>
                  {PROFILE_SECTIONS.map((section) => (
                    <div key={section.key} className="flex items-start gap-2">
                      <Switch
                        id={`profile-${section.key}`}
                        className="mt-0.5"
                        checked={draft[section.key as ProfileSectionKey]}
                        onCheckedChange={(checked) =>
                          change({ [section.key]: checked } as Partial<Draft>)
                        }
                      />
                      <div className="grid grid-cols-1 gap-0.5">
                        <Label htmlFor={`profile-${section.key}`}>
                          {section.label}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {section.hint}
                        </span>
                      </div>
                    </div>
                  ))}
                </section>

                <PinnedBadgesField
                  pinned={draft.pinnedBadges}
                  earnedBadgeIds={earnedBadgeIds}
                  onChange={(pinnedBadges) => change({ pinnedBadges })}
                />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Being found</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6">
                <section className="grid grid-cols-1 gap-3">
                  <div className="flex items-start gap-2">
                    <Switch
                      id="profile-listed"
                      className="mt-0.5"
                      checked={draft.listed}
                      onCheckedChange={(checked) => change({ listed: checked })}
                    />
                    <div className="grid grid-cols-1 gap-0.5">
                      <Label htmlFor="profile-listed">List me on /users</Label>
                      <span className="text-xs text-muted-foreground">
                        A second switch on purpose. Having a page and being in a
                        directory other people browse are different wishes, and
                        only a listed profile is offered to search engines.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Switch
                      id="profile-cheers"
                      className="mt-0.5"
                      checked={draft.cheersEnabled}
                      onCheckedChange={(checked) =>
                        change({ cheersEnabled: checked })
                      }
                    />
                    <div className="grid grid-cols-1 gap-0.5">
                      <Label htmlFor="profile-cheers">Let people cheer me on</Label>
                      <span className="text-xs text-muted-foreground">
                        A short line from a fixed list, from somebody who follows
                        you. Nothing is typed, and three a day is the most one
                        person can send you.
                      </span>
                    </div>
                  </div>
                </section>
            </CardContent>
          </Card>
          <div className="flex items-center gap-3">
            {/* Pressable with a bad handle on purpose: the rulebook keeps
                the action live and names the problem on the press. */}
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save public page"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** Up to eight accounts, each a platform and an address. */
function SocialLinksField({
  links,
  onChange,
}: {
  links: PublicSocialLink[]
  onChange: (links: PublicSocialLink[]) => void
}) {
  const [platform, setPlatform] =
    React.useState<PublicSocialPlatform>("twitter")
  const [url, setUrl] = React.useState("")

  const add = () => {
    if (links.length >= MAX_PUBLIC_SOCIAL_LINKS) {
      showErrorToast(PUBLIC_SOCIAL_LINKS_FULL_MESSAGE)
      return
    }
    // The same normalizer the server and the public footer use. It keeps
    // `http:` and `https:` and throws everything else away, `javascript:`
    // above all, so a dropped address is told about here rather than
    // silently vanishing on save.
    const clean = normalizePublicSocialUrl(url)
    if (!clean) {
      showErrorToast(PUBLIC_SOCIAL_URL_MESSAGE)
      return
    }
    onChange([...links, { platform, url: clean }])
    setUrl("")
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      <FieldLabel
        htmlFor="profile-social-url"
        hint={`Up to ${MAX_PUBLIC_SOCIAL_LINKS} accounts, each on one of the ten platforms with a mark we can draw. Every one opens in a new tab.`}
      >
        Your accounts elsewhere
      </FieldLabel>

      {links.length ? (
        <ul className="grid grid-cols-1 gap-1">
          {links.map((link, index) => (
            <li
              key={`${link.platform}-${index}`}
              className="flex min-h-9 items-center gap-2 rounded-lg border bg-card px-2"
            >
              <SocialMark
                platform={link.platform}
                className="ml-1 shrink-0 text-muted-foreground"
              />
              <span className="w-24 shrink-0 text-sm">
                {PUBLIC_SOCIAL_PLATFORM_LABELS[link.platform]}
              </span>
              <span className="flex-1 truncate text-sm text-muted-foreground">
                {link.url}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove your ${PUBLIC_SOCIAL_PLATFORM_LABELS[link.platform]} account`}
                onClick={() =>
                  onChange(links.filter((_, position) => position !== index))
                }
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={platform}
          onValueChange={(value) =>
            setPlatform(value as PublicSocialPlatform)
          }
        >
          <SelectTrigger
            className="sm:w-40"
            aria-label="Which platform the account is on"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLIC_SOCIAL_PLATFORMS.map((option) => (
              <SelectItem key={option} value={option}>
                {PUBLIC_SOCIAL_PLATFORM_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id="profile-social-url"
          className="flex-1"
          value={url}
          placeholder="https://x.com/sarah"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            add()
          }}
        />
        <Button variant="outline" onClick={add}>
          <PlusIcon aria-hidden="true" />
          Add
        </Button>
      </div>
    </div>
  )
}

/** None, one of the eight scenes, or one of your own pictures. */
function BannerField({
  value,
  uploads,
  canUpload,
  onChange,
}: {
  value: string | null
  uploads: UploadOption[]
  canUpload: boolean
  onChange: (value: string | null) => void
}) {
  const catalog = useMediaCatalog()
  return (
    <section className="grid grid-cols-1 gap-2">
      <FieldLabel hint="A strip behind your name. Your page looks finished without one, so None is the default.">
        Banner
      </FieldLabel>
      <div className="flex flex-wrap gap-2">
        <BannerChoice
          selected={value === null}
          label="None"
          onSelect={() => onChange(null)}
        />
        {catalog.themes.map((scene) => (
          <BannerChoice
            key={scene.key}
            selected={value === `scene:${scene.key}`}
            label={scene.label}
            thumbUrl={scene.stillUrl}
            onSelect={() => onChange(`scene:${scene.key}`)}
          />
        ))}
      </div>

      {canUpload ? (
        uploads.length ? (
          <div className="flex flex-wrap gap-2">
            {uploads.map((upload) => (
              <BannerChoice
                key={upload.mediaId}
                selected={value === `media:${upload.mediaId}`}
                label={upload.name}
                thumbUrl={upload.url}
                onSelect={() => onChange(`media:${upload.mediaId}`)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pictures you upload on the{" "}
            <TextLink to="/backgrounds">Backgrounds page</TextLink> can be used
            here too.
          </p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          {BANNER_UPLOAD_LOCKED_REASON}
        </p>
      )}
    </section>
  )
}

function BannerChoice({
  selected,
  label,
  thumbUrl,
  onSelect,
}: {
  selected: boolean
  label: string
  thumbUrl?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-28 flex-col gap-1 rounded-lg border p-1 text-left duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // The selected outline is a deliberate drawing rather than a dividing
        // line, so it keeps its own colour.
        selected && "ring-2 ring-[var(--p-accent)]"
      )}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          className="h-12 w-full rounded object-cover"
        />
      ) : (
        <span className="h-12 w-full rounded bg-muted" />
      )}
      <span className="truncate px-1 text-xs">{label}</span>
    </button>
  )
}

/** Up to three earned badges, drawn larger at the top of the page. */
function PinnedBadgesField({
  pinned,
  earnedBadgeIds,
  onChange,
}: {
  pinned: string[]
  earnedBadgeIds: string[]
  onChange: (pinned: string[]) => void
}) {
  // Only earned badges are offered, which is the same rule the page applies
  // when it draws them. Nothing here can pin something that is not a badge.
  const earned = ACHIEVEMENTS.filter((badge) =>
    earnedBadgeIds.includes(badge.id)
  )
  if (!earned.length) return null

  const toggle = (id: string) => {
    if (pinned.includes(id)) {
      onChange(pinned.filter((entry) => entry !== id))
      return
    }
    if (pinned.length >= MAX_PINNED_BADGES) {
      showErrorToast(
        `Three badges can sit at the top. Unpin one before pinning another.`
      )
      return
    }
    onChange([...pinned, id])
  }

  return (
    <section className="grid grid-cols-1 gap-2">
      <FieldLabel
        hint={`Up to ${MAX_PINNED_BADGES} badges sit larger above the rest. The others still show in the row beneath.`}
      >
        Pinned badges
      </FieldLabel>
      <div className="flex flex-wrap gap-2">
        {earned.map((badge) => {
          const isPinned = pinned.includes(badge.id)
          return (
            <button
              key={badge.id}
              type="button"
              onClick={() => toggle(badge.id)}
              aria-pressed={isPinned}
              className={cn(
                "h-8 rounded-md border px-3 text-sm duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isPinned && "bg-muted font-semibold"
              )}
            >
              {badge.name}
            </button>
          )
        })}
      </div>
      {pinned.length ? (
        <p className="text-xs text-muted-foreground">
          Pinned: {pinned.map((id) => findAchievement(id)?.name).join(", ")}
        </p>
      ) : null}
    </section>
  )
}

function saveMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause)
  if (text.includes("HANDLE_TAKEN")) return HANDLE_TAKEN_MESSAGE
  if (text.includes("INVALID_HANDLE")) return HANDLE_SHAPE_MESSAGE
  if (text.includes("HANDLE_REQUIRED"))
    return "Pick a handle before switching the page on."
  if (text.includes("UPGRADE_REQUIRED")) return BANNER_UPLOAD_LOCKED_REASON
  return "Your public page could not be saved."
}
