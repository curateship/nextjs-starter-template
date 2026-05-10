"use client";

import { BadgeCheck, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Rating } from "@/components/shadcnblocks/rating";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  rating: number;
  title: string;
  content: string;
  author: {
    name: string;
    avatar?: string;
  };
  date: string;
  verified?: boolean;
  helpful?: number;
}

const DEFAULT_REVIEWS: Review[] = [
  {
    id: "1",
    rating: 5,
    title: "Exceeded my expectations",
    content:
      "I was skeptical at first, but this product really delivered. Quality is outstanding and it arrived faster than expected.",
    author: {
      name: "Sarah M.",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-1.webp",
    },
    date: "Dec 10, 2024",
    verified: true,
    helpful: 42,
  },
  {
    id: "2",
    rating: 5,
    title: "Best purchase this year",
    content:
      "Absolutely love it! The attention to detail is remarkable. Customer service was also very helpful.",
    author: {
      name: "James R.",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp",
    },
    date: "Dec 8, 2024",
    verified: true,
    helpful: 38,
  },
  {
    id: "3",
    rating: 4,
    title: "Great value for money",
    content:
      "Solid product overall. Does exactly what it's supposed to. Would recommend.",
    author: {
      name: "Emily K.",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-3.webp",
    },
    date: "Dec 5, 2024",
    verified: true,
    helpful: 24,
  },
  {
    id: "4",
    rating: 5,
    title: "Perfect for everyday use",
    content:
      "Been using this daily for a month. Still looks and works like new. Impressive build quality.",
    author: { name: "Michael T." },
    date: "Dec 2, 2024",
    verified: false,
    helpful: 19,
  },
  {
    id: "5",
    rating: 4,
    title: "Good but room for improvement",
    content:
      "Nice product. Color was slightly different from photos but overall happy with the purchase.",
    author: {
      name: "Lisa P.",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-5.webp",
    },
    date: "Nov 28, 2024",
    verified: true,
    helpful: 12,
  },
  {
    id: "6",
    rating: 3,
    title: "Decent but expected more",
    content:
      "It's okay for the price. Nothing special but gets the job done. Shipping was quick.",
    author: { name: "David W." },
    date: "Nov 25, 2024",
    verified: true,
    helpful: 8,
  },
];

type SortOption = "helpful" | "newest" | "highest" | "lowest";

interface Reviews5Props {
  reviews?: Review[];
  className?: string;
}

const Reviews5 = ({ reviews = DEFAULT_REVIEWS, className }: Reviews5Props) => {
  const [sortBy, setSortBy] = useState<SortOption>("helpful");

  const totalReviews = reviews.length;
  const averageRating =
    reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    percentage:
      (reviews.filter((r) => r.rating === star).length / totalReviews) * 100,
  }));

  const sortedReviews = [...reviews].sort((a, b) => {
    switch (sortBy) {
      case "helpful":
        return (b.helpful || 0) - (a.helpful || 0);
      case "newest":
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      case "highest":
        return b.rating - a.rating;
      case "lowest":
        return a.rating - b.rating;
      default:
        return 0;
    }
  });

  const sortLabels: Record<SortOption, string> = {
    helpful: "Most Helpful",
    newest: "Newest",
    highest: "Highest Rated",
    lowest: "Lowest Rated",
  };

  return (
    <section className={cn("py-16 md:py-24", className)}>
      <div className="container max-w-3xl">
        {/* Header with Summary */}
        <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Customer Reviews
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">
                  {averageRating.toFixed(1)}
                </span>
                <span className="text-sm text-muted-foreground">/ 5</span>
              </div>
              <Rating rate={averageRating} className="[&_svg]:size-4" />
              <span className="text-sm text-muted-foreground">
                ({totalReviews})
              </span>
            </div>
          </div>

          {/* Compact Rating Bars */}
          <div className="flex gap-2 sm:w-48">
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {[5, 4, 3, 2, 1].map((n) => (
                <span key={n} className="h-2 leading-none">
                  {n}
                </span>
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {ratingCounts.map(({ star, percentage }) => (
                <Progress key={star} value={percentage} className="h-2" />
              ))}
            </div>
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Sort Controls */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {totalReviews} reviews
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                Sort: {sortLabels[sortBy]}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={cn(sortBy === option && "font-medium")}
                >
                  {sortLabels[option]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Reviews List */}
        <div className="space-y-0">
          {sortedReviews.map((review, index) => (
            <div key={review.id}>
              {index > 0 && <Separator className="my-4" />}
              <div className="space-y-2">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarImage
                        src={review.author.avatar}
                        alt={review.author.name}
                      />
                      <AvatarFallback className="text-xs">
                        {review.author.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {review.author.name}
                    </span>
                    {review.verified && (
                      <BadgeCheck className="size-4 text-emerald-600" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {review.date}
                  </span>
                </div>

                {/* Rating & Title */}
                <div className="flex items-center gap-2">
                  <Rating
                    rate={review.rating}
                    className="[&_svg]:size-3.5 [&>div]:size-3.5"
                  />
                  <span className="font-medium">{review.title}</span>
                </div>

                {/* Content */}
                <p className="text-sm text-muted-foreground">
                  {review.content}
                </p>

                {/* Helpful */}
                {review.helpful !== undefined && review.helpful > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {review.helpful} people found this helpful
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Load More */}
        <div className="mt-6 text-center">
          <Button variant="outline">Load More Reviews</Button>
        </div>
      </div>
    </section>
  );
};

export { Reviews5 };
