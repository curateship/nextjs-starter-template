import { lazy, Suspense } from "react"
import {
  dynamicIconImports,
} from "lucide-react/dynamic"
import type { LucideIcon } from "lucide-react"
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js"
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right.js"
import BarChart3 from "lucide-react/dist/esm/icons/chart-column.js"
import BadgeHelp from "lucide-react/dist/esm/icons/badge-question-mark.js"
import Bell from "lucide-react/dist/esm/icons/bell.js"
import Bookmark from "lucide-react/dist/esm/icons/bookmark.js"
import BookOpen from "lucide-react/dist/esm/icons/book-open.js"
import Briefcase from "lucide-react/dist/esm/icons/briefcase.js"
import Building2 from "lucide-react/dist/esm/icons/building-2.js"
import Calendar from "lucide-react/dist/esm/icons/calendar.js"
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js"
import Camera from "lucide-react/dist/esm/icons/camera.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check.js"
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list.js"
import CreditCard from "lucide-react/dist/esm/icons/credit-card.js"
import Download from "lucide-react/dist/esm/icons/download.js"
import Edit3 from "lucide-react/dist/esm/icons/pen-line.js"
import FilePenLine from "lucide-react/dist/esm/icons/file-pen-line.js"
import FileSpreadsheet from "lucide-react/dist/esm/icons/file-spreadsheet.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban.js"
import FolderOpen from "lucide-react/dist/esm/icons/folder-open.js"
import Gift from "lucide-react/dist/esm/icons/gift.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import Heart from "lucide-react/dist/esm/icons/heart.js"
import Home from "lucide-react/dist/esm/icons/house.js"
import Image from "lucide-react/dist/esm/icons/image.js"
import ImagePlus from "lucide-react/dist/esm/icons/image-plus.js"
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard.js"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import LifeBuoy from "lucide-react/dist/esm/icons/life-buoy.js"
import Link2 from "lucide-react/dist/esm/icons/link-2.js"
import Lock from "lucide-react/dist/esm/icons/lock.js"
import Mail from "lucide-react/dist/esm/icons/mail.js"
import MapPinned from "lucide-react/dist/esm/icons/map-pinned.js"
import MessageSquare from "lucide-react/dist/esm/icons/message-square.js"
import Monitor from "lucide-react/dist/esm/icons/monitor.js"
import Package from "lucide-react/dist/esm/icons/package.js"
import Palette from "lucide-react/dist/esm/icons/palette.js"
import PenTool from "lucide-react/dist/esm/icons/pen-tool.js"
import Phone from "lucide-react/dist/esm/icons/phone.js"
import PlayCircle from "lucide-react/dist/esm/icons/circle-play.js"
import Rocket from "lucide-react/dist/esm/icons/rocket.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import Send from "lucide-react/dist/esm/icons/send.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Shield from "lucide-react/dist/esm/icons/shield.js"
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js"
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import Store from "lucide-react/dist/esm/icons/store.js"
import Tag from "lucide-react/dist/esm/icons/tag.js"
import Ticket from "lucide-react/dist/esm/icons/ticket.js"
import Trophy from "lucide-react/dist/esm/icons/trophy.js"
import Upload from "lucide-react/dist/esm/icons/upload.js"
import UserRound from "lucide-react/dist/esm/icons/user-round.js"
import Users from "lucide-react/dist/esm/icons/users.js"
import Wallet from "lucide-react/dist/esm/icons/wallet.js"
import WandSparkles from "lucide-react/dist/esm/icons/wand-sparkles.js"
import Workflow from "lucide-react/dist/esm/icons/workflow.js"
import Wrench from "lucide-react/dist/esm/icons/wrench.js"
import Zap from "lucide-react/dist/esm/icons/zap.js"

const QUICK_LINK_ICONS = {
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
  bookmark: Bookmark,
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
  { value: "bookmark", label: "Bookmark", keywords: ["save", "saved", "favorite"] },
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
const dynamicLucideIconNames = new Set<string>(Object.keys(dynamicIconImports))
type DynamicLucideIconName = keyof typeof dynamicIconImports
const dynamicLucideIconComponentCache = new Map<
  DynamicLucideIconName,
  ReturnType<typeof lazy<LucideIcon>>
>()

export function getQuickLinkIcon(icon?: string): LucideIcon {
  if (typeof icon === "string" && Object.prototype.hasOwnProperty.call(QUICK_LINK_ICONS, icon)) {
    return QUICK_LINK_ICONS[icon as QuickLinkIconName]
  }

  return QUICK_LINK_ICONS[DEFAULT_ICON]
}

function getQuickLinkIconOrNull(icon?: string): LucideIcon | null {
  if (typeof icon === "string" && Object.prototype.hasOwnProperty.call(QUICK_LINK_ICONS, icon)) {
    return QUICK_LINK_ICONS[icon as QuickLinkIconName]
  }

  return null
}

export function getQuickLinkIconLabel(icon?: string): string {
  const staticLabel = QUICK_LINK_ICON_OPTIONS.find((option) => option.value === icon)?.label
  if (staticLabel) return staticLabel
  const dynamicIconName = getDynamicLucideIconName(icon)
  return dynamicIconName ? getDynamicLucideIconLabel(dynamicIconName) : "No icon"
}

function isQuickLinkIconName(value: unknown): value is QuickLinkIconName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(QUICK_LINK_ICONS, value)
}

export function isQuickLinkIconValue(value: unknown): value is QuickLinkIconValue {
  return (
    isQuickLinkIconName(value) ||
    isDynamicLucideIconName(value)
  )
}

export function normalizeDynamicLucideIconName(
  value: string
): DynamicLucideIconName | undefined {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/lucide\.dev\/icons\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/Icon$/, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()

  return dynamicLucideIconNames.has(cleaned)
    ? (cleaned as DynamicLucideIconName)
    : undefined
}

function isDynamicLucideIconName(value: unknown): value is DynamicLucideIconName {
  return typeof value === "string" && dynamicLucideIconNames.has(value)
}

function getDynamicLucideIconName(value?: string) {
  if (!value) return undefined
  return normalizeDynamicLucideIconName(value)
}

function getDynamicLucideIconLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getDynamicLucideIconComponent(name: DynamicLucideIconName) {
  const cached = dynamicLucideIconComponentCache.get(name)
  if (cached) return cached

  const Icon = lazy(dynamicIconImports[name])
  dynamicLucideIconComponentCache.set(name, Icon)
  return Icon
}

export function renderQuickLinkIcon(icon: QuickLinkIconValue | undefined, className = "h-4 w-4") {
  const Icon = getQuickLinkIconOrNull(icon)
  if (Icon) return <Icon className={className} />
  const dynamicIconName = getDynamicLucideIconName(icon)
  if (dynamicIconName) {
    const LucideIconComponent = getDynamicLucideIconComponent(dynamicIconName)
    return (
      <Suspense fallback={<ImagePlus className={className} />}>
        <LucideIconComponent className={className} />
      </Suspense>
    )
  }
  return null
}
