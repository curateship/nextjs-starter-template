/**
 * Converts a Drizzle row (camelCase keys, Date values) to the snake_case shape
 * that existing frontend components expect (matching the old Supabase format).
 */
export function toSnakeCase<T extends Record<string, any>>(row: T): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    result[snakeKey] = value instanceof Date ? value.toISOString() : value
  }
  return result
}
