"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils/tailwind"

function TableRightActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

function TableRightActionsSearch({
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof Input> & { inputClassName?: string }) {
  return (
    <div className={cn("relative flex-1 sm:flex-none", className)}>
      <SearchIcon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground sm:size-5"
        aria-hidden="true"
      />
      <Input
        type="search"
        inputMode="search"
        autoComplete="off"
        className={cn(
          "h-8 w-full pl-9 text-sm sm:w-[180px] sm:pl-10 lg:w-[240px]",
          inputClassName
        )}
        {...props}
      />
    </div>
  )
}

function TableRightActionsSelectTrigger({
  className,
  size = "sm",
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      size={size}
      className={cn("h-8 w-fit text-xs sm:text-sm", className)}
      {...props}
    />
  )
}

function TableRightActionsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className={cn("h-8 w-fit gap-2", className)}
      {...props}
    />
  )
}

export {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
}
