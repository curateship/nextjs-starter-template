/**
 * A button's words that change while it works ("Write it with AI" becomes
 * "Writing…") without the button changing width. The words not showing are
 * laid in the same spot as an invisible CSS shadow (`data-other`), so the
 * button is always as wide as the longer of the two, while its text, what a
 * screen reader reads and what a test finds, is only the words showing.
 */
export function SteadyLabel({
  busy,
  idle,
  working,
}: {
  busy: boolean
  idle: string
  working: string
}) {
  return (
    <span
      data-other={busy ? idle : working}
      className="inline-grid after:invisible after:col-start-1 after:row-start-1 after:h-0 after:overflow-hidden after:content-[attr(data-other)]"
    >
      <span className="col-start-1 row-start-1">{busy ? working : idle}</span>
    </span>
  )
}
