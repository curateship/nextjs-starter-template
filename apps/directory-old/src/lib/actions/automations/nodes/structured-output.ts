export function parseJsonValue(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const objectStart = trimmed.indexOf('{')
    const arrayStart = trimmed.indexOf('[')
    const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart)
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
    if (start < 0 || end <= start) throw new Error('AI returned invalid structured output')
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      throw new Error('AI returned invalid structured output')
    }
  }
}
