/** The `error` a JSON answer carries, or `fallback` when it has none. */
export async function errorOf(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === "string") return body.error
  } catch {
    // Not JSON; the fallback says enough.
  }
  return fallback
}
