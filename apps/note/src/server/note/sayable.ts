/**
 * A failure written for the person who owns the video, so the card and the
 * bell may show its words as they are: "Longer than 30 minutes", "This post
 * is private", "Summarising failed (HTTP 500)".
 *
 * Anything else a job throws is the server's business, such as a database
 * error with its query in it, and the card says something went wrong instead
 * (`failureWords` in `jobs.ts`).
 */
export class SayableError extends Error {}
