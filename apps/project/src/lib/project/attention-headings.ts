/**
 * The headings of the site admin's Need your attention tab in My tasks, top
 * to bottom (task "My dashboard/left-panel-blocks", Tyler, 6 Nov 2026: "Every
 * task that needs you"). A task that fits two sits under the first. Shared by
 * the server, which sorts tasks under them, and the tab, which draws them.
 */
export const ATTENTION_HEADINGS = ["waiting", "unassigned", "stuck", "overdue", "untouched", "due"] as const
export type AttentionHeading = (typeof ATTENTION_HEADINGS)[number]

export const ATTENTION_LABEL: Record<AttentionHeading, string> = {
  waiting: "Waiting on you",
  unassigned: "No one on it",
  stuck: "Stuck",
  overdue: "Overdue",
  untouched: "Untouched",
  due: "Due this week",
}
