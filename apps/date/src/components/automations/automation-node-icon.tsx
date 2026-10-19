import type { AutomationNodeIcon as NodeIcon } from "@/lib/automations/node-registry"

/**
 * A node's icon, drawn from the component the node itself supplied.
 *
 * A component of its own rather than rendering the icon at each call site: a
 * capitalised local read as JSX is exactly what a component genuinely made
 * during a render looks like, and the lint rule that catches those cannot tell
 * the two apart. Taking it as a prop keeps both call sites clear of that.
 */
export function AutomationNodeIcon({
  icon: Icon,
  className,
}: {
  icon: NodeIcon
  className?: string
}) {
  return <Icon className={className} />
}
