import type { CSSProperties } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BadgeHelp,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Download,
  Edit3,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  FolderOpen,
  Gift,
  Globe,
  Heart,
  Home,
  Image,
  ImagePlus,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Link2,
  Lock,
  Mail,
  MapPinned,
  MessageSquare,
  Monitor,
  Package,
  Palette,
  PenTool,
  Phone,
  PlayCircle,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  Ticket,
  Trophy,
  Upload,
  UserRound,
  Users,
  Wallet,
  WandSparkles,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

export const QUICK_LINK_ICONS = {
  dashboard: LayoutDashboard,
  home: Home,
  pages: FileText,
  edit: Edit3,
  settings: Settings,
  analytics: BarChart3,
  audit: ClipboardCheck,
  clipboard: ClipboardList,
  products: Package,
  posts: FileText,
  media: Image,
  imagePlus: ImagePlus,
  directory: FolderOpen,
  projects: FolderKanban,
  newsletters: Mail,
  messages: MessageSquare,
  users: Users,
  user: UserRound,
  events: Calendar,
  calendarDays: CalendarDays,
  categories: Tag,
  automations: Workflow,
  site: Globe,
  store: Store,
  cart: ShoppingCart,
  payments: CreditCard,
  wallet: Wallet,
  support: LifeBuoy,
  help: BadgeHelp,
  shield: Shield,
  lock: Lock,
  search: Search,
  send: Send,
  download: Download,
  upload: Upload,
  play: PlayCircle,
  camera: Camera,
  palette: Palette,
  design: PenTool,
  sparkles: Sparkles,
  rocket: Rocket,
  zap: Zap,
  star: Star,
  heart: Heart,
  gift: Gift,
  ticket: Ticket,
  trophy: Trophy,
  monitor: Monitor,
  building: Building2,
  briefcase: Briefcase,
  map: MapPinned,
  bell: Bell,
  book: BookOpen,
  check: CheckCircle2,
  file: FilePenLine,
  spreadsheet: FileSpreadsheet,
  grid: LayoutGrid,
  arrow: ArrowRight,
  external: ArrowUpRight,
  siteBuilder: WandSparkles,
  phone: Phone,
  link: Link2,
  wrench: Wrench,
} as const

export type QuickLinkIconName = keyof typeof QUICK_LINK_ICONS
export type QuickLinkIconValue = QuickLinkIconName | string

export interface SiteQuickLink {
  id: string
  label: string
  href: string
  icon?: QuickLinkIconValue
}

export interface QuickLinkIconOption {
  value: QuickLinkIconName
  label: string
  keywords?: string[]
}

export const QUICK_LINK_ICON_OPTIONS: QuickLinkIconOption[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "home", label: "Home" },
  { value: "pages", label: "Pages" },
  { value: "edit", label: "Edit" },
  { value: "settings", label: "Settings" },
  { value: "analytics", label: "Analytics" },
  { value: "audit", label: "Site Audit" },
  { value: "clipboard", label: "Clipboard" },
  { value: "products", label: "Products" },
  { value: "posts", label: "Posts" },
  { value: "media", label: "Media" },
  { value: "imagePlus", label: "Upload Image", keywords: ["image", "upload", "media"] },
  { value: "directory", label: "Directory" },
  { value: "projects", label: "Projects", keywords: ["folder", "kanban"] },
  { value: "newsletters", label: "Newsletters" },
  { value: "messages", label: "Messages", keywords: ["chat", "comment"] },
  { value: "users", label: "Users" },
  { value: "user", label: "Profile", keywords: ["user", "person", "account"] },
  { value: "events", label: "Events" },
  { value: "calendarDays", label: "Calendar", keywords: ["date", "schedule"] },
  { value: "categories", label: "Categories" },
  { value: "automations", label: "Automations" },
  { value: "site", label: "Site" },
  { value: "store", label: "Store", keywords: ["shop", "commerce"] },
  { value: "cart", label: "Cart", keywords: ["shopping", "checkout"] },
  { value: "payments", label: "Payments", keywords: ["billing", "credit card"] },
  { value: "wallet", label: "Wallet", keywords: ["billing", "money"] },
  { value: "support", label: "Support", keywords: ["help", "lifebuoy"] },
  { value: "help", label: "Help", keywords: ["faq", "support"] },
  { value: "shield", label: "Security", keywords: ["shield", "protect"] },
  { value: "lock", label: "Lock", keywords: ["security", "private"] },
  { value: "search", label: "Search" },
  { value: "send", label: "Send", keywords: ["mail", "submit"] },
  { value: "download", label: "Download" },
  { value: "upload", label: "Upload" },
  { value: "play", label: "Play", keywords: ["video", "start"] },
  { value: "camera", label: "Camera", keywords: ["photo", "media"] },
  { value: "palette", label: "Palette", keywords: ["color", "design"] },
  { value: "design", label: "Design", keywords: ["pen", "draw", "edit"] },
  { value: "sparkles", label: "Sparkles", keywords: ["magic", "highlight"] },
  { value: "rocket", label: "Launch", keywords: ["rocket", "growth"] },
  { value: "zap", label: "Zap", keywords: ["energy", "fast"] },
  { value: "star", label: "Star", keywords: ["favorite", "featured"] },
  { value: "heart", label: "Heart", keywords: ["like", "favorite"] },
  { value: "gift", label: "Gift", keywords: ["bonus", "present"] },
  { value: "ticket", label: "Ticket", keywords: ["pass", "event"] },
  { value: "trophy", label: "Trophy", keywords: ["award", "win"] },
  { value: "monitor", label: "Monitor", keywords: ["screen", "desktop"] },
  { value: "building", label: "Building", keywords: ["company", "office"] },
  { value: "briefcase", label: "Briefcase", keywords: ["work", "business"] },
  { value: "map", label: "Map", keywords: ["location", "pin"] },
  { value: "bell", label: "Bell", keywords: ["notification", "alert"] },
  { value: "book", label: "Book", keywords: ["docs", "guide"] },
  { value: "check", label: "Check", keywords: ["success", "done"] },
  { value: "file", label: "File", keywords: ["document", "page"] },
  { value: "spreadsheet", label: "Spreadsheet", keywords: ["table", "sheet"] },
  { value: "grid", label: "Grid", keywords: ["layout", "blocks"] },
  { value: "arrow", label: "Arrow Right", keywords: ["forward", "next"] },
  { value: "external", label: "External Link", keywords: ["outbound", "open"] },
  { value: "siteBuilder", label: "Site Builder", keywords: ["builder", "wand", "page"] },
  { value: "phone", label: "Phone", keywords: ["call", "contact"] },
  { value: "link", label: "Link" },
  { value: "wrench", label: "Tools", keywords: ["settings", "repair"] },
]

const DEFAULT_ICON: QuickLinkIconName = "imagePlus"
const EXTERNAL_PROTOCOL_PATTERN = /^https?:\/\//i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function getQuickLinkIcon(icon?: string): LucideIcon {
  if (typeof icon === "string" && Object.prototype.hasOwnProperty.call(QUICK_LINK_ICONS, icon)) {
    return QUICK_LINK_ICONS[icon as QuickLinkIconName]
  }

  return QUICK_LINK_ICONS[DEFAULT_ICON]
}

export function getQuickLinkIconOrNull(icon?: string): LucideIcon | null {
  if (typeof icon === "string" && Object.prototype.hasOwnProperty.call(QUICK_LINK_ICONS, icon)) {
    return QUICK_LINK_ICONS[icon as QuickLinkIconName]
  }

  return null
}

export function getQuickLinkIconLabel(icon?: string): string {
  return QUICK_LINK_ICON_OPTIONS.find((option) => option.value === icon)?.label || "No icon"
}

export function isQuickLinkIconName(value: unknown): value is QuickLinkIconName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(QUICK_LINK_ICONS, value)
}

export function isQuickLinkIconUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  if (!value.startsWith("/") || value.startsWith("//")) return false

  try {
    const url = new URL(value, "https://hub.local")
    return (
      url.origin === "https://hub.local" &&
      url.pathname.startsWith("/cdn/") &&
      url.pathname.toLowerCase().endsWith(".svg")
    )
  } catch {
    return false
  }
}

export function isQuickLinkIconValue(value: unknown): value is QuickLinkIconValue {
  return isQuickLinkIconName(value) || isQuickLinkIconUrl(value)
}

function renderThemedSvgIcon(src: string, className: string) {
  const escapedSrc = src.replace(/["\\]/g, "\\$&")
  const maskImage = `url("${escapedSrc}")`
  const style: CSSProperties = {
    maskImage,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
    WebkitMaskImage: maskImage,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} inline-block shrink-0 bg-current`}
      style={style}
    />
  )
}

export function renderQuickLinkIcon(icon: QuickLinkIconValue | undefined, className = "h-4 w-4") {
  const Icon = getQuickLinkIconOrNull(icon)
  if (Icon) return <Icon className={className} />
  if (isQuickLinkIconUrl(icon)) return renderThemedSvgIcon(icon, className)
  return null
}

export function normalizeSiteQuickLinks(value: unknown): SiteQuickLink[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => normalizeSiteQuickLink(item, index))
    .filter((item): item is SiteQuickLink => item !== null)
}

function normalizeSiteQuickLink(item: unknown, index: number): SiteQuickLink | null {
  if (!isRecord(item)) return null

  const label = typeof item.label === "string" ? item.label.trim() : ""
  const href = typeof item.href === "string" ? item.href.trim() : ""

  if (!label || !href || !isValidQuickLinkHref(href)) return null

  const icon = isQuickLinkIconValue(item.icon)
    ? item.icon
    : undefined

  return {
    id: typeof item.id === "string" && item.id.trim()
      ? item.id
      : `quick-link-${index}`,
    label,
    href,
    ...(icon ? { icon } : {}),
  }
}

export function isExternalQuickLinkHref(href: string): boolean {
  return EXTERNAL_PROTOCOL_PATTERN.test(href.trim())
}

export function isInternalQuickLinkHref(href: string): boolean {
  return href.trim().startsWith("/")
}

export function isValidQuickLinkHref(href: string): boolean {
  return isInternalQuickLinkHref(href) || isExternalQuickLinkHref(href)
}

export function resolveSiteQuickLinkHref(link: Pick<SiteQuickLink, "href">, siteId: string): string | null {
  const href = link.href.trim()
  if (!href) return null

  if (isExternalQuickLinkHref(href)) {
    return href
  }

  if (!isInternalQuickLinkHref(href)) {
    return null
  }

  if (href.startsWith("/admin")) {
    return href
  }

  return `/admin/sites/${siteId}${href}`
}
