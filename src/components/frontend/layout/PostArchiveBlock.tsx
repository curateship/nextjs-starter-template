"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { BlockContainer } from "@/components/ui/block-container";

const DUMMY_POSTS = [
  {
    id: 1,
    title: "Getting Started with shadcn/ui",
    description: "Learn how to quickly integrate and customize shadcn/ui components in your Next.js projects.",
    category: "Tutorial",
    date: "2024-01-15",
    image: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=300&fit=crop",
    readTime: "5 min read"
  },
  {
    id: 2,
    title: "Building Accessible Web Applications",
    description: "Explore how to create inclusive web experiences using accessible components.",
    category: "Accessibility",
    date: "2024-01-12",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=300&fit=crop",
    readTime: "8 min read"
  },
  {
    id: 3,
    title: "Modern Design Systems with Tailwind CSS",
    description: "Dive into creating scalable design systems using Tailwind CSS and shadcn/ui.",
    category: "Design",
    date: "2024-01-10",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop",
    readTime: "12 min read"
  },
  {
    id: 4,
    title: "Advanced State Management in React",
    description: "Master complex state management patterns for large-scale React applications.",
    category: "Development",
    date: "2024-01-08",
    image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&h=300&fit=crop",
    readTime: "15 min read"
  },
  {
    id: 5,
    title: "Performance Optimization Techniques",
    description: "Learn the best practices for optimizing your web applications for speed and efficiency.",
    category: "Performance",
    date: "2024-01-05",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop",
    readTime: "10 min read"
  },
  {
    id: 6,
    title: "SEO Best Practices for Modern Web Apps",
    description: "Discover how to implement effective SEO strategies in your Next.js applications.",
    category: "SEO",
    date: "2024-01-03",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop",
    readTime: "7 min read"
  }
];

export const PostArchiveBlock = () => {
  return (
    <div className="pt-10">
      <BlockContainer
        header={{
          title: "Our Blog Posts",
          subtitle: "Discover the latest trends, tips, and best practices in modern web development.",
          align: "center"
        }}
      >
        {/* Filters */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <Button variant="outline" size="sm">All Posts</Button>
          <Button variant="ghost" size="sm">Tutorial</Button>
          <Button variant="ghost" size="sm">Accessibility</Button>
          <Button variant="ghost" size="sm">Design</Button>
          <Button variant="ghost" size="sm">Development</Button>
          <Button variant="ghost" size="sm">Performance</Button>
          <Button variant="ghost" size="sm">SEO</Button>
        </div>

        {/* Posts Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {DUMMY_POSTS.map((post) => (
            <a key={post.id} href="http://localhost:3000/themes/default/posts" className="block">
              <Card className="grid grid-rows-[auto_auto_1fr_auto] pt-0 hover:shadow-lg transition-shadow">
                <div className="aspect-video overflow-hidden rounded-t-lg">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {post.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold hover:underline md:text-xl">
                    {post.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.date).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {post.description}
                  </p>
                </CardContent>
                              <CardFooter>
                <div className="flex items-center text-foreground">
                  Read more
                  <ArrowRight className="ml-2 size-4" />
                </div>
              </CardFooter>
              </Card>
            </a>
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-12">
          <Button variant="outline" size="lg">
            Load More Posts
          </Button>
        </div>
      </BlockContainer>
    </div>
  );
}; 