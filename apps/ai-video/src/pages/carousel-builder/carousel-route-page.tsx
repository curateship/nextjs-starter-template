import * as React from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getCarousel,
  getCarouselErrorMessage,
  type CarouselDetail,
} from "@/lib/api/carousels"
import { CarouselBuilderPage } from "@/pages/carousel-builder/carousel-builder-page"

type LoadResult =
  | { carouselId: string; carousel: CarouselDetail }
  | { carouselId: string; error: string }

export function CarouselRoutePage() {
  const { carouselId } = useParams({
    from: "/_authenticated/admin/carousels/$carouselId",
  })
  const [result, setResult] = React.useState<LoadResult | null>(null)

  React.useEffect(() => {
    let active = true

    getCarousel(carouselId)
      .then((data) => {
        if (active) setResult({ carouselId, carousel: data })
      })
      .catch((loadError) => {
        if (active) {
          setResult({
            carouselId,
            error: getCarouselErrorMessage(loadError),
          })
        }
      })

    return () => {
      active = false
    }
  }, [carouselId])

  const current = result?.carouselId === carouselId ? result : null

  if (current && "error" in current) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="text-center">
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{current.error}</span>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/carousels">Back to carousels</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!current) {
    return null
  }

  return <CarouselBuilderPage document={current.carousel} />
}
