"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface TrustedByAvatarsProps {
  avatars?: Array<{ src: string; alt: string; fallback: string }>;
  text?: string;
  count?: string;
  badgeText?: string;
}

const defaultSkeletonCount = 3;

export function TrustedByAvatars({ 
  avatars = [], 
  text = "", 
  count = "",
  badgeText = ""
}: TrustedByAvatarsProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  
  const validAvatars = avatars.filter(avatar => 
    avatar.src && avatar.src.trim() !== '' && !failedImages.has(avatar.src)
  );
  
  const handleImageError = (src: string) => {
    setFailedImages(prev => new Set([...prev, src]));
  };

  const showSkeleton = validAvatars.length === 0;

  return (
    <Badge
      variant="outline"
      className="mx-auto mb-6 flex w-fit items-center justify-center rounded-full border py-1 pl-2 pr-2.5 font-normal transition-all ease-in-out hover:gap-2.5 bg-muted/50 shadow-xs"
    >
      {showSkeleton ? (
        // Skeleton avatars
        <>
          {Array.from({ length: defaultSkeletonCount }, (_, index) => (
            <div
              key={`skeleton-${index}`}
              className="relative -mr-4 size-7 md:size-8 rounded-full border bg-muted animate-pulse"
            />
          ))}
          {badgeText && (
            <div className="ml-5 h-4 w-20 bg-muted rounded animate-pulse" />
          )}
        </>
      ) : (
        // Real avatars
        <>
          {validAvatars.map((avatar, index) => (
            <Avatar 
              key={index} 
              className="relative -mr-4 overflow-hidden rounded-full border size-7 md:size-8"
            >
              <AvatarImage 
                src={avatar.src} 
                alt={avatar.alt}
                onError={() => handleImageError(avatar.src)}
              />
              <AvatarFallback className="text-sm">
                <div className="size-full rounded-full bg-muted animate-pulse" />
              </AvatarFallback>
            </Avatar>
          ))}
          {badgeText && (
            <p className="ml-5 capitalize tracking-tight text-base md:text-base text-muted-foreground">
              {badgeText}
            </p>
          )}
        </>
      )}
    </Badge>
  );
} 