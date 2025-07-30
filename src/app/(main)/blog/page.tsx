import { Navbar } from "@/components/navigation/navbar";
import { Blog7 } from "@/components/posts/blog7";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const blogPosts = [
  {
    id: "post-1",
    title: "Building Modern UI Components with React and TypeScript",
    summary:
      "Explore the best practices for creating reusable, type-safe UI components. Learn how to leverage TypeScript's powerful type system to build components that are both flexible and maintainable.",
    label: "Development",
    author: "Alex Thompson",
    published: "5 Jan 2024",
    url: "/blog/demo",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop&crop=entropy&auto=format",
  },
  {
    id: "post-2",
    title: "Design Systems: Creating Consistency at Scale",
    summary:
      "Learn how to build and maintain design systems that scale across teams and products. Discover tools, processes, and methodologies that ensure design consistency.",
    label: "Design",
    author: "Sarah Miller",
    published: "3 Jan 2024",
    url: "/blog/demo",
    image: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=800&h=600&fit=crop&crop=entropy&auto=format",
  },
  {
    id: "post-3",
    title: "Performance Optimization for Modern Web Apps",
    summary:
      "Dive deep into web performance optimization techniques. From code splitting to image optimization, learn how to make your applications lightning fast.",
    label: "Performance",
    author: "Mike Chen",
    published: "1 Jan 2024",
    url: "/blog/demo",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop&crop=entropy&auto=format",
  },
  {
    id: "post-4",
    title: "The Future of Frontend Development",
    summary:
      "Explore emerging trends and technologies shaping the future of frontend development. From AI-powered tools to new frameworks, stay ahead of the curve.",
    label: "Trends",
    author: "Emma Rodriguez",
    published: "28 Dec 2023",
    url: "/blog/demo",
    image: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=800&h=600&fit=crop&crop=entropy&auto=format",
  },
  {
    id: "post-5",
    title: "Accessibility First: Building Inclusive Web Experiences",
    summary:
      "Learn how to create web applications that work for everyone. Understand WCAG guidelines, semantic HTML, and assistive technologies to build truly accessible interfaces.",
    label: "Accessibility",
    author: "David Kim",
    published: "26 Dec 2023",
    url: "/blog/demo",
    image: "https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?w=800&h=600&fit=crop&crop=entropy&auto=format",
  },
  {
    id: "post-6",
    title: "State Management Patterns in React Applications",
    summary:
      "Compare different state management solutions for React apps. From useState to Zustand, Redux to Jotai, find the right approach for your project's needs.",
    label: "React",
    author: "Lisa Park",
    published: "24 Dec 2023",
    url: "/blog/demo",
    image: "https://images.unsplash.com/photo-1587620962725-abab7fe55159?w=800&h=600&fit=crop&crop=entropy&auto=format",
  },
];

export default function BlogPage() {
  return (
    <>
      <Navbar />
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 pt-34">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Our Blog
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Insights, tutorials, and thoughts on modern web development, design systems, and building better user experiences.
          </p>
        </div>
        
        <Blog7
          heading=""
          description=""
          buttonText="Load more articles"
          buttonUrl="#"
          posts={blogPosts}
        />
      </div>
    </>
  );
} 