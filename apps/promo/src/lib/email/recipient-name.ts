/**
 * The name used to address one person in an email.
 *
 * Names are supplied by the person, so only trim and take the first word. An
 * address saved as a name is not a name, and guessing one from the part before
 * `@` would be worse than a friendly neutral greeting.
 */
export function emailFirstName(name: string | null | undefined, email: string) {
  const storedName = name?.trim() ?? ""
  if (!storedName || storedName.toLowerCase() === email.trim().toLowerCase()) {
    return "there"
  }

  return storedName.split(/\s+/u)[0] || "there"
}
