import { CircleHelpIcon, SparklesIcon, SquareDashedIcon } from "lucide-react"

import type { AutomationNodeIconName } from "@/lib/automations/node-registry"

const icons = {
  squareDashed: SquareDashedIcon,
  circleHelp: CircleHelpIcon,
  sparkles: SparklesIcon,
} satisfies Record<AutomationNodeIconName, typeof SquareDashedIcon>

export function AutomationNodeIcon({
  icon,
  className,
}: {
  icon: AutomationNodeIconName
  className?: string
}) {
  const Icon = icons[icon]
  return <Icon className={className} />
}
