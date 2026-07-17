import {
  ClapperboardIcon,
  DownloadIcon,
  LayoutTemplateIcon,
  PlayIcon,
  ScanSearchIcon,
  TimerIcon,
  UserPlusIcon,
} from "lucide-react"

import type { AutomationNodeIconName } from "@/lib/automations/node-registry"

const icons = {
  clapperboard: ClapperboardIcon,
  download: DownloadIcon,
  layoutTemplate: LayoutTemplateIcon,
  play: PlayIcon,
  scanSearch: ScanSearchIcon,
  timer: TimerIcon,
  userPlus: UserPlusIcon,
} satisfies Record<AutomationNodeIconName, typeof PlayIcon>

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
