import {
  GitBranchIcon,
  MailIcon,
  TagIcon,
  TimerIcon,
  UserPlusIcon,
  WebhookIcon,
} from "lucide-react"

import type { AutomationNodeIconName } from "@/lib/automations/node-registry"

const icons = {
  userPlus: UserPlusIcon,
  mail: MailIcon,
  timer: TimerIcon,
  gitBranch: GitBranchIcon,
  tag: TagIcon,
  webhook: WebhookIcon,
} satisfies Record<AutomationNodeIconName, typeof UserPlusIcon>

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
