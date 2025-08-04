import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { FrontendBlockContainer } from "@/components/ui/frontend-block-container";

interface PostGridBlockProps {
  tagline?: string;
  heading?: string;
  description?: string;
  buttonText?: string;
  buttonUrl?: string;
}

const PostGridBlock = ({
  tagline = "Latest Updates",
  heading = "Blog Posts",
  description = "Discover the latest trends, tips, and best practices in modern web development.",
  buttonText = "View all posts",
  buttonUrl = "/posts",
}: PostGridBlockProps) => {
  return (
    <FrontendBlockContainer
      header={{
        title: heading,
        subtitle: description,
        align: 'left'
      }}
      viewAllButton={{
        text: buttonText,
        href: buttonUrl
      }}
    >
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        <Card className="grid grid-rows-[auto_auto_1fr_auto] pt-0">
          <div className="bg-muted rounded-t-lg aspect-video mb-4"></div>
          <CardHeader>
            <h3 className="text-lg font-semibold hover:underline md:text-xl">
              Getting Started with shadcn/ui
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Learn how to quickly integrate and customize shadcn/ui components in your Next.js projects.
            </p>
          </CardContent>
          <CardFooter>
            <a
              href="#"
              className="flex items-center text-foreground hover:underline"
            >
              Read more
              <ArrowRight className="ml-2 size-4" />
            </a>
          </CardFooter>
        </Card>
        
        <Card className="grid grid-rows-[auto_auto_1fr_auto] pt-0">
          <div className="bg-muted rounded-t-lg aspect-video mb-4"></div>
          <CardHeader>
            <h3 className="text-lg font-semibold hover:underline md:text-xl">
              Building Accessible Web Applications
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Explore how to create inclusive web experiences using accessible components.
            </p>
          </CardContent>
          <CardFooter>
            <a
              href="#"
              className="flex items-center text-foreground hover:underline"
            >
              Read more
              <ArrowRight className="ml-2 size-4" />
            </a>
          </CardFooter>
        </Card>
        
        <Card className="grid grid-rows-[auto_auto_1fr_auto] pt-0">
          <div className="bg-muted rounded-t-lg aspect-video mb-4"></div>
          <CardHeader>
            <h3 className="text-lg font-semibold hover:underline md:text-xl">
              Modern Design Systems with Tailwind CSS
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Dive into creating scalable design systems using Tailwind CSS and shadcn/ui.
            </p>
          </CardContent>
          <CardFooter>
            <a
              href="#"
              className="flex items-center text-foreground hover:underline"
            >
              Read more
              <ArrowRight className="ml-2 size-4" />
            </a>
          </CardFooter>
        </Card>
      </div>
    </FrontendBlockContainer>
  );
};

export { PostGridBlock }; 