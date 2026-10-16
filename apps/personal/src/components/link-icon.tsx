import {
  CalendarIcon,
  ChartColumnIcon,
  FileTextIcon,
  FolderIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LinkIcon as LinkGlyph,
  ListIcon,
  NewspaperIcon,
  SettingsIcon,
  StarIcon,
  StoreIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import type { LinkIcon as LinkIconName } from "@/lib/menu"

export const LINK_ICON_PICTURES: Record<LinkIconName, { icon: LucideIcon; label: string }> = {
  "layout-dashboard": { icon: LayoutDashboardIcon, label: "Dashboard" },
  list: { icon: ListIcon, label: "List" },
  folder: { icon: FolderIcon, label: "Folder" },
  "file-text": { icon: FileTextIcon, label: "Page" },
  newspaper: { icon: NewspaperIcon, label: "Posts" },
  calendar: { icon: CalendarIcon, label: "Calendar" },
  users: { icon: UsersIcon, label: "People" },
  inbox: { icon: InboxIcon, label: "Inbox" },
  chart: { icon: ChartColumnIcon, label: "Chart" },
  store: { icon: StoreIcon, label: "Shop" },
  star: { icon: StarIcon, label: "Star" },
  settings: { icon: SettingsIcon, label: "Settings" },
  link: { icon: LinkGlyph, label: "Link" },
}

export function LinkIconPicture({ name, className = "size-4" }: { name: LinkIconName; className?: string }) {
  const Icon = LINK_ICON_PICTURES[name].icon
  return <Icon className={className} aria-hidden />
}
