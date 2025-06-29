"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function TrustedByAvatars() {
  return (
    <div className="flex items-center rounded-full border border-border bg-background p-1 shadow shadow-black/5">
      <div className="flex -space-x-1.5">
        <Avatar className="h-5 w-5 ring-1 ring-background">
          <AvatarImage
            src="https://originui.com/avatar-80-03.jpg"
            alt="Avatar 01"
          />
          <AvatarFallback>A1</AvatarFallback>
        </Avatar>
        <Avatar className="h-5 w-5 ring-1 ring-background">
          <AvatarImage
            src="https://originui.com/avatar-80-04.jpg"
            alt="Avatar 02"
          />
          <AvatarFallback>A2</AvatarFallback>
        </Avatar>
        <Avatar className="h-5 w-5 ring-1 ring-background">
          <AvatarImage
            src="https://originui.com/avatar-80-05.jpg"
            alt="Avatar 03"
          />
          <AvatarFallback>A3</AvatarFallback>
        </Avatar>
        <Avatar className="h-5 w-5 ring-1 ring-background">
          <AvatarImage
            src="https://originui.com/avatar-80-06.jpg"
            alt="Avatar 04"
          />
          <AvatarFallback>A4</AvatarFallback>
        </Avatar>
      </div>
      <p className="px-2 text-xs text-muted-foreground">
        Trusted by{" "}
        <strong className="font-medium text-foreground">60K+</strong>{" "}
        developers.
      </p>
    </div>
  );
} 