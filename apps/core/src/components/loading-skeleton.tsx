import { Skeleton } from "@/components/ui/skeleton"

export function MediaGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="aspect-square w-full" />
      ))}
    </div>
  )
}
