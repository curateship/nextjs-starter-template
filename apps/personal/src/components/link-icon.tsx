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
import { DynamicIcon } from "lucide-react/dynamic"

import { isLucideIconName } from "@/lib/link-icons"

/**
 * The icons the first menus offered, drawn straight away. Any other Lucide
 * icon is fetched the first time it shows. "chart" is an old name that Lucide
 * calls "chart-column".
 */
const DRAWN_NOW: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboardIcon,
  list: ListIcon,
  folder: FolderIcon,
  "file-text": FileTextIcon,
  newspaper: NewspaperIcon,
  calendar: CalendarIcon,
  users: UsersIcon,
  inbox: InboxIcon,
  chart: ChartColumnIcon,
  "chart-column": ChartColumnIcon,
  store: StoreIcon,
  star: StarIcon,
  settings: SettingsIcon,
  link: LinkGlyph,
}

/** A link's icon, or nothing when the link has none. */
export function LinkIconPicture({
  name,
  className = "size-4",
}: {
  name: string | undefined
  className?: string
}) {
  if (!name) return null
  const Icon = DRAWN_NOW[name]
  if (Icon) return <Icon className={className} aria-hidden />
  if (!isLucideIconName(name)) return <LinkGlyph className={className} aria-hidden />
  return (
    <DynamicIcon
      name={name}
      className={className}
      aria-hidden
      fallback={() => <span className={className} aria-hidden />}
    />
  )
}
