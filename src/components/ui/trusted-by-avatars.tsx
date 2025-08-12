"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface TrustedByAvatarsProps {
  avatars?: Array<{ src: string; alt: string; fallback: string }>;
  text?: string;
  count?: string;
  badgeText?: string;
  badgeTextColor?: string;
  backgroundColor?: string;
}

const defaultAvatars = [
  { src: "", alt: "User 1", fallback: "U1" },
  { src: "", alt: "User 2", fallback: "U2" },
  { src: "", alt: "User 3", fallback: "U3" },
];

export function TrustedByAvatars({ 
  avatars = defaultAvatars, 
  text = "", 
  count = "",
  badgeText = "",
  badgeTextColor = "#6b7280",
  backgroundColor 
}: TrustedByAvatarsProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  
  // Filter out empty URLs and failed images
  const validAvatars = avatars.filter(avatar => 
    avatar.src && avatar.src.trim() !== '' && !failedImages.has(avatar.src)
  );
  
  const handleImageError = (src: string) => {
    setFailedImages(prev => new Set([...prev, src]));
  };

  // If no valid avatars, use default ones
  const displayAvatars = validAvatars.length > 0 ? validAvatars : defaultAvatars;

  return (
    <Badge
      variant="outline"
      className="mx-auto mb-6 flex w-fit items-center justify-center rounded-full border py-1 pl-2 pr-2.5 font-normal transition-all ease-in-out hover:gap-2.5"
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      {displayAvatars.map((avatar, index) => (
        <Avatar 
          key={index} 
          className="relative -mr-4 overflow-hidden rounded-full border size-7 md:size-8"
        >
          <AvatarImage 
            src={avatar.src} 
            alt={avatar.alt}
            onError={() => handleImageError(avatar.src)}
          />
          <AvatarFallback className="text-sm">{avatar.fallback}</AvatarFallback>
        </Avatar>
      ))}
      {badgeText && (
        <p 
          className="ml-5 capitalize tracking-tight text-base md:text-base"
          style={{ color: badgeTextColor }}
        >
          {badgeText}
        </p>
      )}
    </Badge>
  );
} 