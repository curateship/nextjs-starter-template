/**
 * Where Fitness's screens remember their layout in this browser. Kept here
 * rather than in the shell's `panelLayoutKey` list, because that list is a
 * shell file and an app never edits one.
 */
export const PROGRAM_PANEL_LAYOUT_KEY = "fitness-program-horizontal"

/**
 * Where a program's dashboard was, for the shell's `useDashboardPlace`: one
 * place per program, so coming back to a program opens the view, weekday and
 * item it was left on, and another program starts on its own.
 */
export function programPlaceKey(programId: string) {
  return `fitness-program-place:${programId}`
}
