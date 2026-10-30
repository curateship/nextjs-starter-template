import {
  AppleIcon,
  BedIcon,
  BikeIcon,
  BookOpenIcon,
  BrainIcon,
  CheckIcon,
  CupSodaIcon,
  DropletIcon,
  DumbbellIcon,
  FootprintsIcon,
  HeartIcon,
  InboxIcon,
  LeafIcon,
  ListChecksIcon,
  MoonIcon,
  MusicIcon,
  PenLineIcon,
  PersonStandingIcon,
  PillIcon,
  SmartphoneIcon,
  SmileIcon,
  SparklesIcon,
  SunIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react"

import type { HabitIcon } from "@/lib/project/daily-card"

/** Each habit icon's drawing and the name a screen reader says for it. */
export const HABIT_ICON_LOOK: Record<HabitIcon, { icon: LucideIcon; label: string }> = {
  cup: { icon: CupSodaIcon, label: "Cup" },
  droplet: { icon: DropletIcon, label: "Water drop" },
  stretch: { icon: PersonStandingIcon, label: "Stretch" },
  walk: { icon: FootprintsIcon, label: "Walk" },
  dumbbell: { icon: DumbbellIcon, label: "Weights" },
  bike: { icon: BikeIcon, label: "Bike" },
  list: { icon: ListChecksIcon, label: "List" },
  inbox: { icon: InboxIcon, label: "Inbox" },
  pen: { icon: PenLineIcon, label: "Pen" },
  book: { icon: BookOpenIcon, label: "Book" },
  brain: { icon: BrainIcon, label: "Brain" },
  sparkle: { icon: SparklesIcon, label: "Sparkle" },
  apple: { icon: AppleIcon, label: "Apple" },
  pill: { icon: PillIcon, label: "Pill" },
  heart: { icon: HeartIcon, label: "Heart" },
  smile: { icon: SmileIcon, label: "Smile" },
  sun: { icon: SunIcon, label: "Sun" },
  moon: { icon: MoonIcon, label: "Moon" },
  bed: { icon: BedIcon, label: "Bed" },
  leaf: { icon: LeafIcon, label: "Leaf" },
  music: { icon: MusicIcon, label: "Music" },
  phone: { icon: SmartphoneIcon, label: "Phone" },
  timer: { icon: TimerIcon, label: "Timer" },
  check: { icon: CheckIcon, label: "Tick" },
}

export function HabitIconGlyph({ icon, className }: { icon: HabitIcon | null; className?: string }) {
  const Glyph = HABIT_ICON_LOOK[icon ?? "check"].icon
  return <Glyph className={className} aria-hidden />
}
