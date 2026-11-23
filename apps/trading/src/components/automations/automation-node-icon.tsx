import {
  ActivityIcon,
  GitBranchIcon,
  Layers3Icon,
  OctagonXIcon,
  RadarIcon,
  RepeatIcon,
  ScanSearchIcon,
  ShieldXIcon,
  TargetIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

import type { AutomationNodeIconName } from "@/lib/automations/node-registry"

const icons = {
  activity: ActivityIcon,
  gitBranch: GitBranchIcon,
  layers: Layers3Icon,
  octagonX: OctagonXIcon,
  radar: RadarIcon,
  repeat: RepeatIcon,
  scanSearch: ScanSearchIcon,
  shieldX: ShieldXIcon,
  target: TargetIcon,
  timer: TimerIcon,
  trendingDown: TrendingDownIcon,
  trendingUp: TrendingUpIcon,
} satisfies Record<AutomationNodeIconName, typeof ActivityIcon>

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
