import type { ProjectNoticeKind } from "@/lib/project/notices"

/**
 * The bell notices a person can switch off for themselves, in the Notices
 * card on My dashboard. Tyler's choices (12 Oct 2026):
 *
 * - Every kind has a switch except three that always arrive: "Time to check
 *   in", a person's own "Remind me", and tags (someone asking you directly).
 * - A switched-off kind is never sent to that person. Everyone else still
 *   gets it. The shell's bell is never touched.
 *
 * A switch's id is the notice kind it stands for, and that id is what is
 * saved. Saved ids are never renamed.
 */
export type NoticeSwitch = {
  id: NoticeSwitchId
  label: string
  group: NoticeSwitchGroup
  /** Only the owner and admins get it, so only they see its switch. */
  runsTheTeam?: true
}

export const NOTICE_SWITCH_GROUPS = [
  { id: "tasks", label: "Tasks" },
  { id: "dates", label: "Dates" },
  { id: "team", label: "The team" },
] as const
export type NoticeSwitchGroup = (typeof NOTICE_SWITCH_GROUPS)[number]["id"]

export const NOTICE_SWITCH_IDS = [
  "task_assigned",
  "task_handed_back",
  "task_stuck",
  "task_unblocked",
  "task_done",
  "task_comment",
  "task_step",
  "task_ready",
  "task_review",
  "task_sent_back",
  "task_thanks",
  "task_field_person",
  "due_soon",
  "overdue",
  "milestone_due",
  "meeting_invite",
  "chat_reply",
  "blocker_reply",
  "team_announcement",
  // No longer offered since the status stopped being set by hand (19 Oct 2026);
  // kept so a choice already saved for it still reads.
  "project_health",
  "team_morning",
  "team_joined",
] as const satisfies readonly ProjectNoticeKind[]
export type NoticeSwitchId = (typeof NOTICE_SWITCH_IDS)[number]

export const NOTICE_SWITCHES: NoticeSwitch[] = [
  { id: "task_assigned", label: "Gave you a task", group: "tasks" },
  { id: "task_handed_back", label: "Handed a task back to you", group: "tasks" },
  { id: "task_stuck", label: "Marked a task Stuck", group: "tasks" },
  { id: "task_unblocked", label: "Unblocked a task", group: "tasks" },
  { id: "task_done", label: "Marked a task Done", group: "tasks" },
  { id: "task_comment", label: "Commented on a task", group: "tasks" },
  { id: "task_step", label: "Gave you a step", group: "tasks" },
  { id: "task_ready", label: "Your task is ready to start", group: "tasks" },
  { id: "task_review", label: "Finished a task for your review", group: "tasks" },
  { id: "task_sent_back", label: "Sent a task back to you", group: "tasks" },
  { id: "task_thanks", label: "Thanked you for a task", group: "tasks" },
  { id: "task_field_person", label: "Named you in a task's field", group: "tasks" },
  { id: "due_soon", label: "Due tomorrow", group: "dates" },
  { id: "overdue", label: "Overdue", group: "dates" },
  { id: "milestone_due", label: "Milestone due tomorrow", group: "dates" },
  { id: "meeting_invite", label: "Invited you to a meeting", group: "team" },
  { id: "chat_reply", label: "Replied to you in a project chat", group: "team" },
  { id: "blocker_reply", label: "Answered your blocker", group: "team" },
  { id: "team_announcement", label: "Posted an announcement", group: "team" },
  { id: "team_morning", label: "Who checked in this morning", group: "team", runsTheTeam: true },
  { id: "team_joined", label: "Joined the team through the link", group: "team", runsTheTeam: true },
]

/** "Gave you 3 tasks" is the same notice as "Gave you a task", so one switch covers both. */
const SWITCH_OF: Partial<Record<ProjectNoticeKind, NoticeSwitchId>> = {
  ...Object.fromEntries(NOTICE_SWITCH_IDS.map((id) => [id, id])),
  tasks_handed: "task_assigned",
}

/** The switch a notice kind sits under, or null for a kind that always arrives. */
export function switchOf(kind: ProjectNoticeKind): NoticeSwitchId | null {
  return SWITCH_OF[kind] ?? null
}

export function isNoticeSwitchId(value: unknown): value is NoticeSwitchId {
  return (NOTICE_SWITCH_IDS as readonly unknown[]).includes(value)
}
