"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface TrustedByAvatarsProps {
  avatars?: Array<{ src: string; alt: string; fallback: string }>;
  text?: string;
  count?: string;
  backgroundColor?: string;
}

const defaultAvatars = [
  { src: "", alt: "User 1", fallback: "U1" },
  { src: "", alt: "User 2", fallback: "U2" },
  { src: "", alt: "User 3", fallback: "U3" },
];

export function TrustedByAvatars({ 
  avatars = defaultAvatars, 
  text = "users", 
  count = "10k+",
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
      className="mx-auto mb-6 flex w-fit items-center justify-center rounded-full border py-1 pl-2 pr-3 font-normal transition-all ease-in-out hover:gap-3"
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      {displayAvatars.map((avatar, index) => (
        <Avatar 
          key={index} 
          className="relative -mr-5 overflow-hidden rounded-full border md:size-10"
        >
          <AvatarImage 
            src={avatar.src} 
            alt={avatar.alt}
            onError={() => handleImageError(avatar.src)}
          />
          <AvatarFallback>{avatar.fallback}</AvatarFallback>
        </Avatar>
      ))}
      <p className="ml-6 capitalize tracking-tight md:text-lg">
        {" "}
        Trusted by <span className="text-foreground font-bold">
          {count}
        </span>{" "}
        {text}.
      </p>
    </Badge>
  );
} 