/**
 * Why a box was refused, in words right under it. The box points at it with
 * `aria-describedby={id}`, so a screen reader reads the reason with the box.
 * The error toast still says it too, as the UI rules ask; this line is what
 * stays once the toast has gone. Nothing is drawn when there is no message.
 */
export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}
