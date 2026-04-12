export function formatDateTime(value?: string | null) {
  if (!value) {
    return "—"
  }

  return new Date(value).toLocaleString()
}

export function formatNumber(value?: number | null) {
  if (value === undefined || value === null) {
    return "—"
  }

  return new Intl.NumberFormat().format(value)
}

export function formatStatus(status: string) {
  return status.replace(/_/g, " ")
}
