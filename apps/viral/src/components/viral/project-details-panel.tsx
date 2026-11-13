import * as React from "react"
import { ArchiveIcon, FlameIcon, MegaphoneIcon, PauseIcon, PlayIcon, PlusIcon, XIcon } from "lucide-react"

import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { NotesMorphIcon } from "@/components/viral/notes-morph-icon"
import { BlendedBanner, HeaderButton } from "@/components/viral/panel-bits"
import { useProject, useSaveProject } from "@/components/viral/project-context"
import { ProjectMenu } from "@/components/viral/project-menu"
import { SavingDocument } from "@/components/viral/saving-document"
import { SavingTextarea } from "@/components/viral/saving-fields"
import { SocialIcon } from "@/components/viral/social-icon"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { changeViralSocial, saveViralProjectNotesFn } from "@/lib/api/viral/viral-projects"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { isTextSocial, SOCIAL_NAMES, SOCIALS, type Social } from "@/lib/viral/socials"
import { VIRAL_DESCRIPTION_MAX } from "@/lib/viral/viral"

/**
 * The project's left panel, drawn as Travel's trip details (Tyler, 4 Nov
 * 2026, picked Travel's trip page for Viral): the back arrow, the name, the
 * notes icon and the ⋮ of settings in the header, the cover faintly behind
 * the top, then the description written in place, the Socials card, the
 * project's Vault, and each social's own cards. The topic is set in the ⋮.
 *
 * The notes icon bends into an × while the project's notes show in the
 * panel's body, and back when they close.
 */
export function ProjectDetailsPanel({
  activeSocial,
  onPickSocial,
  vaultOpen,
  onOpenVault,
  adsOpen = false,
  onOpenAds,
  promoMissing = false,
  children,
}: {
  /** The social picked in the Socials card, narrowing the middle panel to it; null is every social. */
  activeSocial: Social | null
  onPickSocial: (social: Social | null) => void
  /** Whether the middle panel shows the project's vault. */
  vaultOpen: boolean
  onOpenVault: () => void
  /** Whether the middle panel shows the project's Winning ads (`workspace/docs/winning-ads.md`). */
  adsOpen?: boolean
  onOpenAds?: () => void
  /** Promo isn't set up, so X, Reddit and LinkedIn can't be read; their rows say so. */
  promoMissing?: boolean
  /** Each social's own cards: YouTube's keywords, then every social's creators. */
  children: React.ReactNode
}) {
  const { screen } = useProject()
  const { project } = screen
  const save = useSaveProject()
  const [notesOpen, setNotesOpen] = React.useState(false)
  // What was last saved, so the notes reopen with it before the page is read again.
  const [notes, setNotes] = React.useState(project.notes)
  // A cover whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string | null>(null)
  const banner = project.cover_url && project.cover_url !== broken ? project.cover_url : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? <BlendedBanner url={banner} onBroken={() => setBroken(banner)} /> : null}
      <DashboardCardTitleHeader
        className={cn("relative", banner && "border-b-transparent")}
        icon={<FlameIcon className="size-4" />}
        back={{ label: "Back to projects", to: "/admin/projects" }}
        title={project.name}
        action={
          <div className="flex items-center gap-1">
            <HeaderButton
              label={notesOpen ? "Close the notes" : "Notes"}
              pressed={notesOpen}
              onClick={() => setNotesOpen((was) => !was)}
            >
              <NotesMorphIcon open={notesOpen} />
            </HeaderButton>
            <ProjectMenu />
          </div>
        }
      />
      {notesOpen ? (
        <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
            <SavingDocument
              value={notes}
              focus
              placeholder="Notes about this niche: what to try, what to avoid"
              onSave={async (next) => {
                try {
                  await saveViralProjectNotesFn(project.id, next)
                  setNotes(next)
                } catch (error) {
                  showErrorToast(getViralErrorMessage(error))
                }
              }}
            />
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
          {/* A side panel's body, so its first card follows Settings -> Styling
              -> Panel cards -> Opacity. The description is a section, not a
              div, so Socials is still the body's first div (UI standard, "A
              side panel's body"). */}
          <div data-side-panel-body="" className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
            <section className="grid gap-1">
              <Label htmlFor="viral-project-description" className="sr-only">
                Description
              </Label>
              <SavingTextarea
                id="viral-project-description"
                rows={1}
                className="resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
                value={project.description}
                maxLength={VIRAL_DESCRIPTION_MAX}
                placeholder="Write what this niche is about"
                onSave={(description) => save({ description })}
              />
            </section>
            <SocialsCard activeSocial={activeSocial} onPickSocial={onPickSocial} promoMissing={promoMissing} />
            <VaultRow open={vaultOpen} count={project.vault_count} onOpen={onOpenVault} />
            {onOpenAds ? <AdsRow open={adsOpen} onOpen={onOpenAds} /> : null}
            {children}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

/**
 * The project's socials as modules, copied from Promo's Networks card
 * (Tyler, 4 Nov 2026: "add socials (like modules see promo app)"). Each row
 * narrows the middle panel to that social; its own buttons pause the daily
 * re-check for it here, or take it off. Taking one off is refused while it
 * still holds keywords or creators, and the refusal says how many.
 */
function SocialsCard({
  activeSocial,
  onPickSocial,
  promoMissing,
}: {
  activeSocial: Social | null
  onPickSocial: (social: Social | null) => void
  promoMissing: boolean
}) {
  const { screen, refresh } = useProject()
  const { project } = screen
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const missing = SOCIALS.filter((social) => !project.socials.includes(social))

  async function change(social: Social, how: "add" | "remove" | "pause" | "resume") {
    setBusy(`${social}:${how}`)
    try {
      await changeViralSocial(project.id, social, how)
      if (how === "remove" && activeSocial === social) onPickSocial(null)
      await refresh()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const newCount = (social: Social) =>
    screen.videos.filter((video) => video.platform === social && video.isNew).length

  return (
    <PanelCard
      storageId="viral-project-socials"
      title="Socials"
      meta={String(project.socials.length)}
      actionOpen={adding}
      action={
        <FoldingMenu
          label="Add a social"
          fit
          open={adding}
          onOpenChange={setAdding}
          trigger={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a social">
              <PlusIcon />
            </Button>
          }
        >
          {missing.length ? (
            missing.map((social) => (
              <MenuAction
                key={social}
                icon={<SocialIcon social={social} />}
                disabled={busy !== null}
                onClick={() => {
                  setAdding(false)
                  void change(social, "add")
                }}
              >
                {SOCIAL_NAMES[social]}
              </MenuAction>
            ))
          ) : (
            <p className="px-2.5 py-2 text-muted-foreground">This project uses every social Viral has.</p>
          )}
        </FoldingMenu>
      }
    >
      {project.socials.length ? (
        <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {project.socials.map((social) => {
            const paused = project.paused_socials.includes(social)
            const active = activeSocial === social
            const fresh = newCount(social)
            return (
              <li key={social} className={cn("group/social flex items-center gap-1 rounded-md pl-2", active && "bg-muted")}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPickSocial(active ? null : social)}
                  className={cn("flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm", focusRing)}
                >
                  <SocialIcon social={social} />
                  <span className="min-w-0 truncate font-medium">{SOCIAL_NAMES[social]}</span>
                  {paused ? <span className="text-xs text-muted-foreground">Paused</span> : null}
                  {promoMissing && isTextSocial(social) && !project.sample ? (
                    <span className="truncate text-xs text-muted-foreground">Promo not connected</span>
                  ) : null}
                  {fresh ? <span className="ml-auto shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{fresh} new</span> : null}
                </button>
                <RowButton
                  label={paused ? `Check ${SOCIAL_NAMES[social]} daily again` : `Pause ${SOCIAL_NAMES[social]}'s daily check here`}
                  disabled={busy !== null}
                  onClick={() => void change(social, paused ? "resume" : "pause")}
                >
                  {paused ? <PlayIcon /> : <PauseIcon />}
                </RowButton>
                <RowButton
                  label={`Take ${SOCIAL_NAMES[social]} off this project`}
                  disabled={busy !== null}
                  onClick={() => void change(social, "remove")}
                >
                  <XIcon />
                </RowButton>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No socials yet. Press + to add YouTube, TikTok, X, Reddit or LinkedIn.</p>
      )}
    </PanelCard>
  )
}

/** The project's vault, one row that fills the middle panel with its saved ideas. */
function VaultRow({ open, count, onOpen }: { open: boolean; count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onOpen}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
        open ? "bg-muted" : "bg-muted/50 hover:bg-muted",
        focusRing
      )}
    >
      <ArchiveIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-[15px] font-semibold">Vault</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

/** Winning ads, one row like the Vault's, that fills the middle panel with ads from Meta's ad library. */
function AdsRow({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onOpen}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
        open ? "bg-muted" : "bg-muted/50 hover:bg-muted",
        focusRing
      )}
    >
      <MegaphoneIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-[15px] font-semibold">Winning ads</span>
    </button>
  )
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
