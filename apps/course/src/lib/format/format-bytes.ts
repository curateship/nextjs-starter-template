/** The one file-size formatter, e.g. `1.44 MB`. */
export function formatFileSize(bytes: number) {
  if (bytes <= 0) return "0 Bytes"
  const units = ["Bytes", "KB", "MB", "GB", "TB"]
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  return `${parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`
}
