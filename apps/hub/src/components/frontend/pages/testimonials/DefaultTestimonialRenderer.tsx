"use client"

import AutoScroll from "embla-carousel-auto-scroll"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"

interface TestimonialItem {
  id: string
  name: string
  role: string
  avatar: string
  content: string
}

interface DefaultTestimonialRendererProps {
  items: TestimonialItem[]
  config: {
    speed?: number
    showSecondRow?: boolean
  }
}

export function DefaultTestimonialRenderer({ items, config }: DefaultTestimonialRendererProps) {
  const speed = config.speed ?? 0.7
  const showSecondRow = config.showSecondRow ?? true

  if (!items || items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No testimonials to display.</div>
  }

  // Duplicate items so there are always enough to overflow the viewport and enable looping
  const minItems = 6
  let row1 = items
  while (row1.length < minItems) {
    row1 = [
      ...row1,
      ...items.map((item, i) => ({
        ...item,
        id: `${item.id}-dup-${row1.length + i}`
      }))
    ]
  }

  const midpoint = Math.ceil(row1.length / 2)
  const row2 = showSecondRow ? row1.slice(midpoint).concat(row1.slice(0, midpoint)) : []

  const renderCard = (item: TestimonialItem, index: number) => (
    <CarouselItem key={item.id || index} className="basis-auto py-px pl-0.5">
      <Card className="max-w-96 select-none">
        <div className="mb-4 flex gap-4">
          <Avatar className="size-9 rounded-full ring-1 ring-input">
            {item.avatar ? (
              <Image src={item.avatar} alt={item.name} fill sizes="36px" className="object-cover rounded-full" />
            ) : (
              <AvatarFallback>{item.name?.charAt(0) || "?"}</AvatarFallback>
            )}
          </Avatar>
          <div className="text-sm">
            <p className="font-medium">{item.name}</p>
            <p className="text-muted-foreground">{item.role}</p>
          </div>
        </div>
        <q className="text-muted-foreground">{item.content}</q>
      </Card>
    </CarouselItem>
  )

  return (
    <div className="lg:container">
      <div className="space-y-3 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <Carousel opts={{ loop: true }} plugins={[AutoScroll({ startDelay: 500, speed })]}>
          <CarouselContent>{row1.map((item, i) => renderCard(item, i))}</CarouselContent>
        </Carousel>

        {showSecondRow && row2.length > 0 && (
          <div className="hidden md:block">
            <Carousel opts={{ loop: true }} plugins={[AutoScroll({ startDelay: 500, speed, direction: "backward" })]}>
              <CarouselContent>{row2.map((item, i) => renderCard(item, i))}</CarouselContent>
            </Carousel>
          </div>
        )}
      </div>
    </div>
  )
}
