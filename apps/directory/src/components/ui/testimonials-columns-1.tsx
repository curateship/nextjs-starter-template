"use client"

import React from "react"
import { motion } from "motion/react"

export interface TestimonialColumnItem {
  text: string
  image: string
  name: string
  role: string
}

export const TestimonialsColumn = (props: {
  className?: string
  testimonials: TestimonialColumnItem[]
  duration?: number
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex w-full flex-col gap-6 bg-background pb-6"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <div className="w-full rounded-lg border p-10 shadow-lg shadow-primary/10" key={`${index}-${i}`}>
                  <div>{text}</div>
                  <div className="mt-5 flex items-center gap-2">
                    {image ? (
                      <img
                        width={40}
                        height={40}
                        src={image}
                        alt={name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                        {name?.charAt(0) || "?"}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <div className="font-medium leading-5 tracking-tight">{name}</div>
                      <div className="leading-5 tracking-tight opacity-60">{role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  )
}
