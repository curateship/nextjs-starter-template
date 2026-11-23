import { CheckIcon } from "lucide-react"

import { renderShellIcon, type ShellIcon } from "@/lib/custom-shell"

/**
 * A habit's icon, any the shell's icon picker offers, or a tick when it has
 * none (Tyler, 31 Oct 2026: "reuse the existing icon picker we currently have
 * with its custom icon function too").
 */
export function HabitIconGlyph({ icon, className }: { icon: ShellIcon | null; className?: string }) {
  return <span aria-hidden className="contents">{icon ? renderShellIcon(icon, className) : <CheckIcon className={className} />}</span>
}
