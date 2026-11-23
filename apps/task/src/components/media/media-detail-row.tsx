/**
 * One label/value pair in a file's details modal. Values wrap rather than
 * truncate — a storage key is only useful read in full.
 */
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all" title={value}>
        {value}
      </dd>
    </div>
  )
}
