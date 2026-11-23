// Up-to-two-letter initials for avatar fallbacks, e.g. "Tyler Pham" -> "TP"
export function getInitials(value?: string | null) {
  const label = value?.trim() || "User"
  return (
    label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  )
}
