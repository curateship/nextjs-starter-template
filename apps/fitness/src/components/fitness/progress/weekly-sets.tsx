import { Meter } from "@/components/ui/meter"
import type { MuscleWeek } from "@/lib/api/fitness/progress"
import { MUSCLE_LABELS, type Muscle } from "@/lib/fitness/exercise-catalog"

/**
 * Working sets per muscle: this week, last week, and the typical week over
 * the last eight. A set counts once, for its lift's main muscle, so a bench
 * press set is a chest set. A table rather than a chart, because fourteen
 * muscles are fourteen categories and no set of colours tells that many apart.
 * The body of the Progress view's Sets per muscle card.
 */
export function WeeklySets({ weeks }: { weeks: readonly MuscleWeek[] }) {
  const thisWeek = weeks[weeks.length - 1]
  const lastWeek = weeks[weeks.length - 2]
  const muscles = [...new Set(weeks.flatMap((week) => Object.keys(week.sets)))] as Muscle[]
  const rows = muscles
    .map((muscle) => {
      const total = weeks.reduce((sum, week) => sum + (week.sets[muscle] ?? 0), 0)
      return {
        muscle,
        thisWeek: thisWeek?.sets[muscle] ?? 0,
        lastWeek: lastWeek?.sets[muscle] ?? 0,
        typical: Math.round(total / Math.max(1, weeks.length)),
        total,
      }
    })
    .sort((a, b) => b.total - a.total)
  const most = Math.max(1, ...rows.map((row) => Math.max(row.thisWeek, row.typical)))

  const head = "px-4 py-2.5 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase"

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Finish a workout and its sets show here, by muscle.</p>
  }

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Working sets per muscle, this week against last week and a typical week</caption>
      <thead>
        <tr className="border-b">
          <th scope="col" className={`${head} text-left`}>
            Muscle
          </th>
          <th scope="col" className={`${head} text-right`}>
            This week
          </th>
          <th scope="col" className={`${head} hidden text-right sm:table-cell`}>
            Last week
          </th>
          <th scope="col" className={`${head} text-right`}>
            Typical
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.muscle} className="border-b last:border-b-0">
            <th scope="row" className="w-1/2 px-4 py-3 text-left font-normal">
              <span className="grid gap-1.5">
                <span>{MUSCLE_LABELS[row.muscle] ?? row.muscle}</span>
                <Meter
                  value={row.thisWeek}
                  max={most}
                  size="sm"
                  label={`${MUSCLE_LABELS[row.muscle] ?? row.muscle} sets this week`}
                  valueText={`${row.thisWeek} sets`}
                />
              </span>
            </th>
            <td className="px-4 py-3 text-right font-medium tabular-nums">{row.thisWeek}</td>
            <td className="hidden px-4 py-3 text-right text-muted-foreground tabular-nums sm:table-cell">
              {row.lastWeek}
            </td>
            <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{row.typical}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
