import { suggestedEmailAddress } from "@/lib/email/domain-suggestion"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

export function EmailDomainSuggestion({
  email,
  onAccept,
}: {
  email: string
  onAccept: (email: string) => void
}) {
  const suggestion = suggestedEmailAddress(email)
  if (!suggestion) return null

  return (
    <p
      role="status"
      aria-live="polite"
      className="text-sm text-muted-foreground"
    >
      Did you mean{" "}
      <button
        type="button"
        className={cn(
          "rounded-sm font-medium text-foreground underline-offset-4 hover:underline",
          focusRing
        )}
        onClick={() => onAccept(suggestion)}
        aria-label={`Use ${suggestion}`}
      >
        {suggestion}
      </button>{"?"}
    </p>
  )
}
