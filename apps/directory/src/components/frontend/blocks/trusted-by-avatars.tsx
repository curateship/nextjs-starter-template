"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Image from "@/components/app-image";

interface TrustedByAvatarsProps {
  avatars?: Array<{ src: string; alt: string; fallback: string }>;
  text?: string;
  count?: string;
  badgeText?: string;
}

export function TrustedByAvatars({
  avatars = [],
  badgeText = ""
}: TrustedByAvatarsProps) {
  const validAvatars = avatars.filter(avatar =>
    avatar.src && avatar.src.trim() !== ''
  );

  if (validAvatars.length === 0 && !badgeText) return null;

  return (
    <Badge
      variant="outline"
      className="mx-auto mb-6 flex w-fit items-center justify-center rounded-full border py-1 pl-2 pr-2.5 font-normal transition-all ease-in-out hover:gap-2.5 bg-muted/50 shadow-xs"
    >
      {validAvatars.map((avatar, index) => (
        <Avatar
          key={avatar.src || index}
          className="relative -mr-4 overflow-hidden rounded-full border size-7 md:size-8"
        >
          <Image
            src={avatar.src}
            alt={avatar.alt}
            fill
            sizes="(min-width: 768px) 32px, 28px"
            className="object-cover rounded-full"
          />
          <AvatarFallback className="text-sm">
            {avatar.fallback || avatar.alt?.charAt(0) || '?'}
          </AvatarFallback>
        </Avatar>
      ))}
      {badgeText && (
        <p className="ml-5 capitalize tracking-tight text-base md:text-base text-muted-foreground">
          {badgeText}
        </p>
      )}
    </Badge>
  );
}
