import { Skeleton } from "@/components/ui/skeleton"

export function BuilderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden border-r bg-background">
        <div className="h-full space-y-8 overflow-hidden bg-muted/30 p-8">
          <Skeleton className="mx-auto h-48 max-w-4xl" />
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="space-y-3">
                <Skeleton className="h-32" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="w-[250px] space-y-1 p-2.5">
        {[1, 2, 3].map((item) => (
          <div key={item} className="flex items-center space-x-2 p-3">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
