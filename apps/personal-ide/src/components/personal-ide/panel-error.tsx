export function PanelError({ error }: { error: string }) {
  if (!error) return null

  return (
    <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {error}
    </div>
  )
}
