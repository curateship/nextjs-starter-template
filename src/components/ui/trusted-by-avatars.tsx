"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import Image from "next/image";

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
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  
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
          {validAvatars.map((avatar, index) => {
            const isFailed = failedImages.has(avatar.src)
            const isLoaded = loadedImages.has(avatar.src)
            return (
            <Avatar 
              key={avatar.src || index} 
              className="relative -mr-4 overflow-hidden rounded-full border size-7 md:size-8"
            >
              {!isFailed && (
                <Image
                  src={avatar.src}
                  alt={avatar.alt}
                  fill
                  sizes="(min-width: 768px) 32px, 28px"
                  className="object-cover rounded-full"
                  onError={() => handleImageError(avatar.src)}
                  onLoadingComplete={() => setLoadedImages(prev => new Set([...prev, avatar.src]))}
                />
              )}
              {(!isLoaded || isFailed) && (
                <AvatarFallback className="text-sm">
                  <div className="size-full rounded-full bg-muted animate-pulse" />
                </AvatarFallback>
              )}
            </Avatar>
          )})}
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