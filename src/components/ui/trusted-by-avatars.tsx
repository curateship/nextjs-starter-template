"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface TrustedByAvatarsProps {
  avatars?: Array<{ src: string; alt: string; fallback: string }>;
  text?: string;
  count?: string;
  backgroundColor?: string;
}

const defaultAvatars = [
  { src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp", alt: "Avatar 1", fallback: "A1" },
  { src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-5.webp", alt: "Avatar 2", fallback: "A2" },
  { src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-6.webp", alt: "Avatar 3", fallback: "A3" },
];

export function TrustedByAvatars({ 
  avatars = defaultAvatars, 
  text = "users", 
  count = "10k+",
  backgroundColor 
}: TrustedByAvatarsProps) {
  return (
    <Badge
      variant="outline"
      className="mx-auto mb-6 flex w-fit items-center justify-center rounded-full border py-1 pl-2 pr-3 font-normal transition-all ease-in-out hover:gap-3"
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      {avatars.map((avatar, index) => (
        <Avatar 
          key={index} 
          className="relative -mr-5 overflow-hidden rounded-full border md:size-10"
        >
          <AvatarImage src={avatar.src} alt={avatar.alt} />
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