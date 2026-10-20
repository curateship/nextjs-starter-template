/**
 * Where this browser remembers the library dashboard's panel widths. The
 * app's own key, so the shell's `panelLayoutKey` list, a shell file, never
 * has to change for it.
 */
export const NOTE_LIBRARY_LAYOUT_KEY = "note-library-horizontal"

/**
 * Where this browser remembers the address each library's dashboard last had
 * (UI standard: "the dashboard remembers where it was before"). A library has
 * one owner, so its id alone is per person.
 */
export function libraryPlaceKey(libraryId: string) {
  return `note-library-place:${libraryId}`
}
