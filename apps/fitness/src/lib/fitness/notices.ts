import { CalendarXIcon, CameraIcon, ClipboardListIcon, DumbbellIcon, MessageSquareIcon, TrophyIcon, UsersIcon } from "lucide-react"

import type { AppNoticeDetail, NoticeToLink } from "@/lib/app-options"

/**
 * How Fitness's notices look in the bell. The heading the server wrote says
 * which kind each is, so every row is right on the first paint; where it
 * leads comes from the server afterwards (`notifications.detailsFor`).
 */

export const FITNESS_NOTICE_CATEGORIES = [{ id: "training", label: "Training" }] as const

export type FitnessNoticeKind = "record" | "reminder" | "missed" | "coach" | "note" | "checkin" | "photo"

const LOOK: Record<FitnessNoticeKind, AppNoticeDetail> = {
  record: {
    icon: TrophyIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    categoryId: "training",
  },
  reminder: { icon: DumbbellIcon, toneClassName: "bg-primary/10 text-primary", categoryId: "training" },
  missed: { icon: CalendarXIcon, toneClassName: "bg-secondary text-muted-foreground", categoryId: "training" },
  coach: { icon: UsersIcon, toneClassName: "bg-primary/10 text-primary", categoryId: "training" },
  note: { icon: MessageSquareIcon, toneClassName: "bg-primary/10 text-primary", categoryId: "training" },
  checkin: { icon: ClipboardListIcon, toneClassName: "bg-primary/10 text-primary", categoryId: "training" },
  photo: { icon: CameraIcon, toneClassName: "bg-secondary text-muted-foreground", categoryId: "training" },
}

export function fitnessNoticeLook(kind: FitnessNoticeKind): AppNoticeDetail {
  return LOOK[kind]
}

/** The kind of a Fitness notice, read from the heading the server gave it. */
export function fitnessNoticeKind(notice: NoticeToLink): FitnessNoticeKind | null {
  if (notice.type !== "app_activity" || !notice.message) return null
  if (notice.message.startsWith("New record: ")) return "record"
  if (notice.message.startsWith("Workout today: ")) return "reminder"
  if (notice.message.startsWith("You missed ")) return "missed"
  if (notice.message.endsWith(" wants to coach you")) return "coach"
  if (notice.message.endsWith(" in a row")) return "missed"
  if (notice.message.includes(" left a note on ")) return "note"
  if (notice.message === "Your weekly check-in" || notice.message.endsWith(" sent their check-in")) return "checkin"
  if (notice.message === "Time for a photo day") return "photo"
  return null
}

export function isFitnessNoticeKind(kind: string): kind is FitnessNoticeKind {
  return kind in LOOK
}
