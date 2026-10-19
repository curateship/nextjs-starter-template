import type { ProgramPage } from "@/lib/fitness/program-page"
import type { ProgramSearch } from "@/lib/fitness/program-search"

/**
 * What every part of a program's dashboard is handed.
 *
 * A view supplies two parts. Its middle part draws its own toolbar row and a
 * `PanelBody` under the dashboard's tabs. Its right part draws a `PanelHeader`
 * naming what is open and a `PanelBody` of `PanelCard`s.
 */
export type ProgramViewProps = {
  page: ProgramPage
  /** The address, with `view` and `day` filled in (Day view, today's weekday, when unset). */
  search: ProgramSearch & { view: NonNullable<ProgramSearch["view"]>; day: number }
  /** Changes the address. Unset keys are dropped; `pick: undefined` closes the right panel's item. */
  go: (patch: Partial<ProgramSearch>, options?: { replace?: boolean }) => void
}
