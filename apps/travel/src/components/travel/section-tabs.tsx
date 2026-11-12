import { DashboardTabs, type DashboardTab } from "@/components/shared/dashboard-tabs"
import { ViewMenu } from "@/components/shared/view-menu"

/**
 * A Trips dashboard section's tabs in its middle header: the shell's tabs
 * where the header is wide enough, and the shell's view dropdown when it is
 * not, so a phone still reaches every tab beside the search and buttons (a
 * row of tabs squeezed to nothing there). The header measures itself
 * (`@container`), so this follows the panel's width, not the window's.
 */
export function SectionTabs({
  value,
  onValueChange,
  tabs,
  label,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: (DashboardTab & { label: string })[]
  /** What the dropdown picks, read out: "Which trips". */
  label: string
}) {
  return (
    <>
      {/* `contents`, so the tabs sit straight in the header's row and their
          underline reaches the header's bottom line, as everywhere else. */}
      <span className="hidden @2xl:contents">
        <DashboardTabs value={value} onValueChange={onValueChange} tabs={tabs} />
      </span>
      <span className="shrink-0 @2xl:hidden">
        <ViewMenu value={value} onValueChange={onValueChange} choices={tabs} label={label} />
      </span>
    </>
  )
}
