import { cn } from "@/lib/utils/tailwind"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-accent motion-safe:animate-pulse", className)}
      {...props}
    />
  )
}

export { Skeleton }
