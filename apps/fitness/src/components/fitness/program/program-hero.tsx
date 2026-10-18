import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon, ImageIcon, ImageOffIcon, Loader2Icon, XIcon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { ProgramSettingsMenu } from "@/components/fitness/program/program-actions"
import type { ProgramPageData } from "@/components/fitness/program/program-data"
import { TONE } from "@/components/fitness/status-tones"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeProgram } from "@/lib/api/fitness/programs"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { routineTypeLabel } from "@/lib/fitness/routine-types"
import { cn } from "@/lib/utils"

/** "fsf" is FS; "Push Pull Legs" is PP. */
function programInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)
  return letters.toUpperCase() || "P"
}

/** Buttons that sit on the banner keep a pale backing so they read on any picture. */
const ON_BANNER = "bg-background/70 backdrop-blur-sm hover:bg-background/90"

type Slot = "bannerUrl" | "avatarUrl"

/**
 * The top of a program's left panel, as Tyler drew it on 18 Oct 2026: a
 * banner across the top with the back arrow and the cog on it, the program's
 * square picture overlapping its foot, and beside that the name, the routine
 * type and whether it is active. Both pictures come from the person's own
 * uploads and are optional: with none, the banner is a soft grey fade and the
 * picture is the program's initials. Whoever can change the program presses
 * the picture, or the picture button on the banner, and the picker opens
 * straight away; a small button beside each takes a picture off again.
 */
export function ProgramHero({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const navigate = useNavigate()
  const { program } = data
  const canChange = !program.archived
  const [picking, setPicking] = React.useState<Slot | null>(null)
  const [busy, setBusy] = React.useState<Slot | null>(null)

  async function save(slot: Slot, url: string | null) {
    setBusy(slot)
    try {
      await changeProgram({ action: "pictures", programId: program.id, [slot]: url })
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="group/hero relative shrink-0">
      <div className="relative h-28 overflow-hidden rounded-t-[inherit]">
        {program.bannerUrl ? (
          <img src={program.bannerUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-muted" />
        )}
        {/* The banner fades into the panel so the name below reads cleanly. */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2 [&>*]:pointer-events-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" aria-label="All programs" className={ON_BANNER}>
              <Link to="/programs">
                <ArrowLeftIcon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>All programs</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-1">
          {canChange ? (
            // Only while the pointer is over the top of the panel, or it has
            // the keyboard's focus, so the banner stays as Tyler drew it. A
            // press opens the picker straight away (Tyler, 18 Oct 2026: "why
            // not just open the picker").
            <>
              {program.bannerUrl ? (
                <HeroButton
                  label="Remove the banner"
                  busy={false}
                  onClick={() => void save("bannerUrl", null)}
                >
                  <ImageOffIcon />
                </HeroButton>
              ) : null}
              <HeroButton
                label={program.bannerUrl ? "Change the banner" : "Add a banner"}
                busy={busy === "bannerUrl"}
                onClick={() => setPicking("bannerUrl")}
              >
                <ImageIcon />
              </HeroButton>
            </>
          ) : null}
          <ProgramSettingsMenu
            data={data}
            triggerClassName={ON_BANNER}
            onDeleted={() => void navigate({ to: "/programs" })}
          />
        </div>
      </div>

      <div className="relative -mt-8 flex items-end gap-2.5 px-3">
        <Avatar data={data} />
        {canChange ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={program.avatarUrl ? "Change the program's picture" : "Add a picture for the program"}
                  disabled={busy === "avatarUrl"}
                  onClick={() => setPicking("avatarUrl")}
                  className="absolute bottom-0 left-3 flex size-14 items-center justify-center rounded-xl bg-foreground/0 text-background transition-colors hover:bg-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>svg]:opacity-0 hover:[&>svg]:opacity-100"
                >
                  {busy === "avatarUrl" ? <Loader2Icon className="animate-spin opacity-100!" /> : <ImageIcon />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{program.avatarUrl ? "Change picture" : "Add a picture"}</TooltipContent>
            </Tooltip>
            {program.avatarUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Remove the program's picture"
                    onClick={() => void save("avatarUrl", null)}
                    className="absolute bottom-10 left-14 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/hero:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:none)]:opacity-100"
                  >
                    <XIcon className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove picture</TooltipContent>
              </Tooltip>
            ) : null}
          </>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-1 pb-0.5">
          <h1 className="truncate text-base font-semibold">{program.name}</h1>
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className="truncate">{routineTypeLabel(program.routineType)}</span>
            {program.isActive ? (
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", TONE.positive)}>
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                Active
              </span>
            ) : null}
            {data.pause ? <Badge variant="outline" className="shrink-0">Paused</Badge> : null}
            {program.archived ? <Badge variant="outline" className="shrink-0">Archived</Badge> : null}
          </div>
        </div>
      </div>

      <MediaPicker
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        onSelectMedia={(url) => {
          const slot = picking
          setPicking(null)
          if (slot) void save(slot, url)
        }}
        currentMediaUrl={picking ? (program[picking] ?? undefined) : undefined}
        showVideos={false}
        defaultCropAspect={picking === "avatarUrl" ? "square" : "wide"}
      />
    </div>
  )
}

function Avatar({ data }: { data: ProgramPageData }) {
  const { program } = data
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted text-lg font-semibold text-muted-foreground shadow-sm">
      {program.avatarUrl ? (
        <img src={program.avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        programInitials(program.name)
      )}
    </span>
  )
}

/** A small button on the banner, shown while the pointer is over the panel's top. */
function HeroButton({
  label,
  busy,
  onClick,
  children,
}: {
  label: string
  busy: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={busy}
          onClick={onClick}
          className={cn(
            ON_BANNER,
            "opacity-0 transition-opacity group-hover/hero:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          )}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
