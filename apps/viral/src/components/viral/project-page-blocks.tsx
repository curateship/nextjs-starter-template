import * as React from "react"
import { ArchiveIcon, LayersIcon } from "lucide-react"

import { blockView, useBlockCount } from "@/components/shared/notes/block-card"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { SocialIcon } from "@/components/viral/social-icon"
import { cn } from "@/lib/utils"
import { PROJECT_SOCIALS_NODE, PROJECT_VAULT_NODE } from "@/lib/viral/project-page"
import { SOCIAL_NAMES, type Social } from "@/lib/viral/socials"

/**
 * A project's own blocks on the left of its dashboard, copied from Promo's
 * project page (Tyler, 21 Nov 2026: "Copy the pattern of the promo app
 * instead"; `apps/promo/src/components/social/projects/project-networks-block.tsx`).
 * They keep no values: the project screen hands each one what it draws
 * through `ProjectBlocksProvider`.
 *
 * - **Socials**, fixed, as Promo's Networks block: each social the project
 *   uses is one line, its mark and name, Paused while paused, and its new
 *   videos in the pill. Pressing one keeps the middle to it; pressing it
 *   again shows every social. The picked one is dark with the sliding bar.
 *   Pause, Take off and Add are in the project's ⋮, under Socials, as
 *   Promo's are under Networks.
 * - **Vault**, fixed, as Promo's Archive block: All ideas and Winning ads,
 *   each opening in the middle and right panels.
 *
 * The creators and what Promo reads on X, Reddit and LinkedIn were blocks
 * here too, and moved to the middle (Tyler, 21 Nov 2026: "Move the creators
 * block into the middle tab here", then of the X and Reddit blocks: "these
 * belong in the middle panel"): a Creators tab, and a Sources dropdown in
 * each social's posts header.
 */

export type ProjectSection = "videos" | "vault" | "ads"

export type ProjectBlocks = {
  socials: Social[]
  paused: Social[]
  /** New videos per social, in its pill. */
  newCounts: Partial<Record<Social, number>>
  /** The social the middle is kept to, or null for every social. */
  social: Social | null
  section: ProjectSection
  onSocial: (social: Social | null) => void
  onSection: (section: ProjectSection) => void
  vaultCount: number
  /** Promo isn't set up, so X, Reddit and LinkedIn can't be read; their lines say so. */
  promoMissing: boolean
}

const Context = React.createContext<ProjectBlocks | null>(null)

export function ProjectBlocksProvider({ value, children }: { value: ProjectBlocks; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on a project's own page.</p>
}

/** The pill Promo's rows carry: the lightest grey, the figure in grey. */
function Pill({ value }: { value: number }) {
  return value ? (
    <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">
      {value.toLocaleString()}
    </span>
  ) : (
    <span />
  )
}

/** One social as Promo draws a network with posts alone: one line, the mark and name, picked with the bar. */
function SocialLine({
  social,
  first,
  note,
  value,
  picked,
  onPress,
}: {
  social: Social
  first: boolean
  note: string | null
  value: number
  picked: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      // A press must not reach the page editor around the block.
      onMouseDownCapture={(event) => event.preventDefault()}
      aria-current={picked ? "true" : undefined}
      className={cn(
        "grid min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        picked ? "font-semibold" : "font-medium",
        !first && "mt-1"
      )}
    >
      <span className="flex min-w-0 items-center [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        <SlideBar on={picked} />
        <span className="flex min-w-0 items-center gap-2">
          <SocialIcon social={social} />
          <span className="truncate">{SOCIAL_NAMES[social]}</span>
          {note ? <span className="shrink-0 text-xs font-normal text-muted-foreground">{note}</span> : null}
        </span>
      </span>
      <Pill value={value} />
    </button>
  )
}

/** A row at the block's edge, as Promo's Archive block draws its one row: grey until picked, then dark with the bar. */
function VaultRow({ name, value, picked, onPress }: { name: string; value: number; picked: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseDownCapture={(event) => event.preventDefault()}
      aria-current={picked ? "true" : undefined}
      className="grid min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg py-1 pr-2.5 pl-2.5 text-left text-sm hover:[&>[data-row-name]]:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
    >
      <span
        data-row-name=""
        className={cn("flex min-w-0 items-center transition-colors", picked ? "font-semibold text-foreground" : "font-normal text-muted-foreground")}
      >
        <SlideBar on={picked} />
        <span className="min-w-0 truncate">{name}</span>
      </span>
      <Pill value={value} />
    </button>
  )
}

function SocialsBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.socials.length || undefined)
  if (!blocks) return <NotHere />
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      {!blocks.socials.length ? (
        <p className="px-2.5 py-1.5 text-sm text-muted-foreground">This project uses no social yet. Add one in its ⋮, under Socials.</p>
      ) : null}
      {blocks.socials.map((social, index) => {
        const picked = blocks.section === "videos" && blocks.social === social
        const note = blocks.paused.includes(social)
          ? "Paused"
          : blocks.promoMissing && (social === "x" || social === "reddit" || social === "linkedin")
            ? "Promo not connected"
            : null
        return (
          <SocialLine
            key={social}
            social={social}
            first={index === 0}
            note={note}
            value={blocks.newCounts[social] ?? 0}
            picked={picked}
            onPress={() => blocks.onSocial(picked ? null : social)}
          />
        )
      })}
    </div>
  )
}

function VaultBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.vaultCount || undefined)
  if (!blocks) return <NotHere />
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      <VaultRow name="All ideas" value={blocks.vaultCount} picked={blocks.section === "vault"} onPress={() => blocks.onSection("vault")} />
      <VaultRow name="Winning ads" value={0} picked={blocks.section === "ads"} onPress={() => blocks.onSection("ads")} />
    </div>
  )
}

const SocialsView = blockView({ kind: "viral-project-socials", title: "Socials", icon: <LayersIcon />, Draw: SocialsBlock, fixed: true })
const VaultView = blockView({ kind: "viral-project-vault", title: "Vault", icon: <ArchiveIcon />, Draw: VaultBlock, fixed: true })

/** Socials and Vault, fixed and never in the "/" list. */
export const PROJECT_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "viralProjectSocials",
    label: "Socials",
    icon: LayersIcon,
    node: PROJECT_SOCIALS_NODE,
    extension: keepOnPage(blockNode(PROJECT_SOCIALS_NODE, {}, SocialsView)),
    offered: false,
  },
  {
    key: "viralProjectVault",
    label: "Vault",
    icon: ArchiveIcon,
    node: PROJECT_VAULT_NODE,
    extension: keepOnPage(blockNode(PROJECT_VAULT_NODE, {}, VaultView)),
    offered: false,
  },
]
