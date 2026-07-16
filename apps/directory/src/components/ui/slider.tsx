"use client"

import * as React from "react"
import { cn } from "@/lib/utils/tailwind"

interface SliderProps {
  value: number[]
  onValueChange: (value: number[]) => void
  min: number
  max: number
  step: number
  className?: string
}

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step,
  className,
}: SliderProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value)
    onValueChange([newValue])
  }

  return (
    <div className={cn("relative", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={handleChange}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer slider"
        style={{
          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${
            ((value[0] - min) / (max - min)) * 100
          }%, var(--muted) ${((value[0] - min) / (max - min)) * 100}%, var(--muted) 100%)`
        }}
      />
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: var(--primary);
          border-radius: 50%;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: var(--primary);
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  )
}
