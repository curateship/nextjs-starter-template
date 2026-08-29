import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import {
  MIN_ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_WIDTH,
} from "@/components/trade/order-window-form"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingRow } from "@/components/ui/loading-row"

export function LazyOrderWindowFallback({
  state,
  wide,
  wallet,
  free,
  title,
  onClose,
}: {
  state: { x: number; y: number }
  wide: boolean
  wallet: string
  free: number
  title: string
  onClose: () => void
}) {
  return (
    <FloatingOrderWindow
      label={`${title} is opening`}
      wide={wide}
      openedAt={state}
      width={ORDER_WINDOW_WIDTH}
      height={ORDER_WINDOW_HEIGHT}
      minimumHeight={MIN_ORDER_WINDOW_HEIGHT}
      title={title}
      wallet={wallet}
      free={free}
      onClose={onClose}
    >
      <LoadingRow label={`Opening ${title.toLowerCase()}`} className="h-full" />
    </FloatingOrderWindow>
  )
}

export function LazyDialogFallback({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            The window is still loading.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <LoadingRow label="Opening the window" />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
