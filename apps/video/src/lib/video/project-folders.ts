/**
 * The browser-safe half of project folders: name rules, the address value for
 * "no folder", and the exact sentences both sides show. The database work lives
 * in `src/server/video/project-folders.ts`; nothing here may touch the server.
 */

export const PROJECT_FOLDER_NAME_MAX = 120

/** `?folder=none` lists the projects that are in no folder. */
export const NO_FOLDER = "none"

export const FOLDER_NAME_REQUIRED_MESSAGE = "Folder name is required."
export const FOLDER_NAME_TAKEN_MESSAGE =
  "A folder with that name already exists."
export const FOLDER_NOT_FOUND_MESSAGE = "Folder not found"

/**
 * Trim, collapse runs of whitespace, refuse emptiness, and cap the length. The
 * collapse matters because the unique index compares lowercased names, so
 * "Client A" and "Client  A " must be the same folder.
 */
export function cleanFolderName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ")
  if (!cleaned) {
    throw new Error(FOLDER_NAME_REQUIRED_MESSAGE)
  }
  return cleaned.slice(0, PROJECT_FOLDER_NAME_MAX)
}
