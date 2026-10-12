/**
 * The line over a grid of sound previews: why the last one could not play,
 * or that it is playing silently because the header's sound is muted.
 */
export function PreviewStatus({
  failed,
  muted,
}: {
  failed: boolean
  muted: boolean
}) {
  if (!failed && !muted) return null
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {failed
        ? "That preview could not be played. Click the card to try again."
        : "Your sound is muted, so this preview is silent. Unmute it in the header, then click the card again."}
    </p>
  )
}
