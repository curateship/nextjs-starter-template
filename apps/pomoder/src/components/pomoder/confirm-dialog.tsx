import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

export type ConfirmRequest = { title: string; description: string; confirmLabel: string; onConfirm: () => void }

// Shared shadcn-based confirmation for destructive actions — native
// window.confirm is never used in the product shell.
export function ConfirmDialog({ confirm, onClose }: { confirm: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(confirm)} onOpenChange={(next) => { if (!next) onClose() }}>
      {/* Portaled to <body>; inherits the active theme from <html>. */}
      <DialogContent className="host-room-dialog confirm-dialog">
        <DialogTitle className="host-room-dialog-title">{confirm?.title}</DialogTitle>
        <DialogDescription className="host-room-dialog-sub">{confirm?.description}</DialogDescription>
        <div className="confirm-dialog-actions">
          <button type="button" className="outline-pill" onClick={onClose}>Cancel</button>
          <button type="button" className="pill-button" onClick={() => { const action = confirm?.onConfirm; onClose(); action?.() }}>{confirm?.confirmLabel}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
