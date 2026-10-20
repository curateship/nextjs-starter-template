import * as React from "react"
import { ListFilterIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FlatSection } from "@/components/video-viral/flat-section"
import { CreatorList } from "@/components/video-viral/video-grid"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import { followCreatorByLink } from "@/lib/api/video/viral-projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatCount } from "@/lib/video/creators"
import type { ViralCreator } from "@/lib/video/viral"
import { SUBSCRIBER_STEPS, type SubscriberRange } from "@/lib/video/viral-view"

/**
 * The left panel's Creators section: every channel behind the project's results,
 * plus everyone followed in it. Tyler, 20 Oct 2026, moved it here from the
 * middle panel's Creators tab, with "Add creator", as a folding card.
 *
 * Picking a row shows their newest uploads in the middle and the creator on
 * the right. Under the list, Filter shows a search box and the subscriber
 * range, and Add creator opens a small dropdown to follow somebody the search did not find by
 * pasting their profile link. A link is asked for rather than a handle,
 * because a handle alone does not say which platform it is on.
 */
export function CreatorsCard({
  creators,
  total,
  selectedKey,
  onPick,
  onWatchChange,
  search,
  onSearch,
  range,
  onRange,
  projectId,
  sample,
  onAdded,
}: {
  /** The creators left after the search and the range. */
  creators: ViralCreator[]
  /** Every creator in the project, for "12 of 40". */
  total: number
  selectedKey: string | null
  onPick: (creator: ViralCreator) => void
  onWatchChange?: (creator: ViralCreator, watch: boolean) => void
  search: string
  onSearch: (search: string) => void
  range: SubscriberRange
  onRange: (range: SubscriberRange) => void
  projectId: string
  /** A sample project follows nobody. */
  sample: boolean
  /** Resolves once the screen has read the project again. */
  onAdded: () => Promise<void>
}) {
  const narrowed = Boolean(search.trim()) || range.min !== null || range.max !== null
  // Shown from the start while a search or range is set, so a narrowed list says why.
  const [showFilters, setShowFilters] = React.useState(narrowed)
  const [adding, setAdding] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function add() {
    if (busy) return
    if (!link.trim()) {
      setInvalid(true)
      showErrorToast("Paste a profile link first.")
      return
    }
    setBusy(true)
    try {
      const { platform } = await followCreatorByLink(projectId, link.trim())
      await onAdded()
      dismissErrorToast()
      toast.success(
        platform === "instagram"
          ? "Following them. Instagram does not let the app read anyone's videos, so none will show."
          : platform === "tiktok"
            ? "Following them. Their videos arrive when the watch timer next checks."
            : "Following them. Their newest videos are in the grid."
      )
      setLink("")
      setAdding(false)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const filterButton = (
    <Button
      type="button"
      variant="outline"
      // Fuller than its word, so it is not a second "Filter" beside the middle panel's.
      aria-label={showFilters ? "Hide the creator filters" : "Filter creators"}
      aria-expanded={showFilters}
      onClick={() => setShowFilters((shown) => !shown)}
    >
      <ListFilterIcon />
      {showFilters ? "Hide filters" : "Filter"}
    </Button>
  )

  const addButton = (
    <NewRecordDropdown
      label="Add creator"
      open={adding}
      onOpenChange={setAdding}
      submitLabel="Add creator"
      busy={busy}
      onSubmit={() => void add()}
      trigger={
        <Button type="button" variant="outline" disabled={sample} className="w-full">
          <PlusIcon />
          Add creator
        </Button>
      }
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="viral-creator-link"
          hint="A YouTube channel, a TikTok profile or an Instagram profile. Not a link to one of their videos. They join this project; somebody already followed in another project is added here too, not twice."
        >
          Profile link
        </FieldLabel>
        <Input
          id="viral-creator-link"
          autoFocus
          placeholder="https://www.youtube.com/@creator"
          value={link}
          maxLength={2048}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setLink(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
    </NewRecordDropdown>
  )

  return (
    <FlatSection
      storageId="viral-project-creators"
      title="Creators"
      meta={narrowed ? `${creators.length} of ${total}` : String(total)}
    >
      {showFilters ? (
        <div className="grid gap-2">
          <Input
            name="viral-creator-search"
            aria-label="Search creators"
            placeholder="Search creators…"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          {/* One per row: side by side, the card is too narrow to read either. */}
          <SubscriberSelect
            label="Subscribers from"
            value={range.min}
            onChange={(min) => onRange({ ...range, min })}
          />
          <SubscriberSelect
            label="Subscribers up to"
            value={range.max}
            onChange={(max) => onRange({ ...range, max })}
          />
        </div>
      ) : null}
      {creators.length ? (
        <CreatorList
          creators={creators}
          selectedKey={selectedKey}
          onPick={onPick}
          onWatchChange={onWatchChange}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {total
            ? "No creator matches these filters."
            : "Creators show here once a search finds videos, or add one with +."}
        </p>
      )}
      {/* Under the list, with their words (Tyler, 20 Oct 2026), rather than
          as icons in the heading. */}
      <div className="grid grid-cols-2 gap-2">
        {filterButton}
        <DisabledReason
          disabled={sample}
          reason="A sample project follows nobody. Make your own project to add creators."
          className="w-full"
        >
          {addButton}
        </DisabledReason>
      </div>
    </FlatSection>
  )
}

function SubscriberSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <Select value={value === null ? "any" : String(value)} onValueChange={(next) => onChange(next === "any" ? null : Number(next))}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">{label}: any</SelectItem>
        {SUBSCRIBER_STEPS.map((step) => (
          <SelectItem key={step} value={String(step)}>
            {label}: {formatCount(step)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
