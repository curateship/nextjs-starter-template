const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
] as const

/** True only for one typed character or one adjacent pair in the wrong order. */
function isOneEditAway(value: string, expected: string) {
  const lengthDifference = value.length - expected.length
  if (Math.abs(lengthDifference) > 1) return false

  if (lengthDifference === 0) {
    const different = []
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== expected[index]) different.push(index)
      if (different.length > 2) return false
    }
    if (different.length === 1) return true
    if (different.length !== 2) return false

    const [first, second] = different
    return (
      second === first + 1 &&
      value[first] === expected[second] &&
      value[second] === expected[first]
    )
  }

  const shorter = lengthDifference < 0 ? value : expected
  const longer = lengthDifference < 0 ? expected : value
  let shortIndex = 0
  let longIndex = 0
  let skipped = false

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
      longIndex += 1
      continue
    }
    if (skipped) return false
    skipped = true
    longIndex += 1
  }

  return true
}

/** A corrected address when only its provider domain looks mistyped. */
export function suggestedEmailAddress(email: string): string | null {
  const trimmed = email.trim()
  const at = trimmed.indexOf("@")
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).toLowerCase()
  if (!domain) return null

  const suggestion = COMMON_EMAIL_DOMAINS.find((common) =>
    isOneEditAway(domain, common)
  )
  return suggestion ? `${local}@${suggestion}` : null
}
