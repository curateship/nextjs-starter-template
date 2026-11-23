/** Turns a stored automation error into one short line for the notification bell. */
export function plainAutomationFailure(error: string | null): string {
  const firstLine = error?.trim().split(/\r?\n/, 1)[0]?.trim()
  if (!firstLine) return "The step stopped without explaining why."

  if (/timed? out|timeout|aborterror/i.test(firstLine)) {
    return "The service took too long to respond."
  }
  if (
    /econnrefused|econnreset|enotfound|fetch failed|network error/i.test(
      firstLine
    )
  ) {
    return "The service could not be reached."
  }

  const status = firstLine.match(
    /\b(?:http(?: status)?\s*)?([45]\d{2})\b/i
  )?.[1]
  if (status === "401" || status === "403") {
    return "The service refused the request because its sign-in details were not accepted."
  }
  if (status === "429") {
    return "The service refused the request because too many requests were sent."
  }
  if (status?.startsWith("5")) {
    return "The service had a problem and refused the request."
  }
  if (status) return `The service refused the request (error ${status}).`

  return firstLine.length > 180 ? `${firstLine.slice(0, 179)}…` : firstLine
}
