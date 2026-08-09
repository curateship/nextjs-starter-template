import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import {
  CAROUSEL_EXPORT_FAILED_MESSAGE,
  CAROUSEL_SLIDE_NOT_FOUND_MESSAGE,
  isSafeCarouselExportError,
  renderOwnedCarouselSlide,
} from "@/server/video/carousel-export"

const NO_STORE = { "Cache-Control": "private, no-store" }

export const Route = createFileRoute(
  "/api/v1/video/carousels/$carouselId/slides/$slideIndex"
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401, headers: NO_STORE }
          )
        }
        const slideIndex = Number(params.slideIndex)
        if (!Number.isInteger(slideIndex) || slideIndex < 0) {
          return Response.json(
            { detail: CAROUSEL_SLIDE_NOT_FOUND_MESSAGE },
            { status: 404, headers: NO_STORE }
          )
        }
        try {
          const png = await renderOwnedCarouselSlide(
            user.id,
            params.carouselId,
            slideIndex
          )
          return new Response(png, {
            headers: {
              ...NO_STORE,
              "Content-Disposition": `inline; filename="slide-${slideIndex + 1}.png"`,
              "Content-Type": "image/png",
              "X-Content-Type-Options": "nosniff",
            },
          })
        } catch (error) {
          if (!isSafeCarouselExportError(error)) {
            console.error("Carousel export route failed", error)
          }
          const detail =
            isSafeCarouselExportError(error) && error instanceof Error
              ? error.message
              : "The slide could not be exported."
          const status = detail.includes("not found")
            ? 404
            : detail === CAROUSEL_EXPORT_FAILED_MESSAGE
              ? 500
              : 422
          return Response.json({ detail }, { status, headers: NO_STORE })
        }
      },
    },
  },
})
