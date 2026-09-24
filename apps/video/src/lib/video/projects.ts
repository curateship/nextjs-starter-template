/**
 * The few facts about a project that both sides need to agree on.
 *
 * They live here, in browser-safe code, rather than beside the database work:
 * anything the browser reads out of `src/server/*` drags that whole module —
 * and the password hashing it imports — into the page.
 */

export const PROJECT_NOT_FOUND_MESSAGE = "Project not found"
export const PROJECT_NAME_REQUIRED_MESSAGE = "Project name is required"
export const PROJECT_NAME_MAX = 200

/**
 * Put after the name of the new project that keeps a window's work when its
 * save was refused, so it sits beside the original on the list and says what
 * it is.
 */
export const REFUSED_COPY_SUFFIX = "(unsaved edits)"
