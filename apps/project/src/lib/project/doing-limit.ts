export type DoingWarning = { personId: string; text: string }

/**
 * "Doing per person", from Project settings: the Board's Doing column says
 * who is over it, such as "Leo has 4 in Doing (limit 3)", or, grouped by
 * person, Leo's own row does. It only warns and never blocks, or it would get
 * in the way of real work. No limit, no lines.
 */
export function overDoingLimit(
  tasks: readonly { status: string; assignee: { id: string; name: string } | null }[],
  limit: number | null
): DoingWarning[] {
  if (!limit) return []
  const doing = new Map<string, { id: string; name: string; count: number }>()
  for (const task of tasks) {
    if (task.status !== "doing" || !task.assignee) continue
    const entry = doing.get(task.assignee.id) ?? { id: task.assignee.id, name: task.assignee.name, count: 0 }
    entry.count += 1
    doing.set(task.assignee.id, entry)
  }
  return [...doing.values()]
    .filter((entry) => entry.count > limit)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((entry) => ({ personId: entry.id, text: `${entry.name} has ${entry.count} in Doing (limit ${limit})` }))
}
