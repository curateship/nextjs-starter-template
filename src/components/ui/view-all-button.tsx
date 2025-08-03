import { MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewAllButtonProps {
  text?: string;
  href?: string;
  className?: string;
}

export function ViewAllButton({ 
  text = "View all", 
  href = "#",
  className = ""
}: ViewAllButtonProps) {
  return (
    <div className="flex justify-center mt-18">
      <Button className={`gap-4 ${className}`} asChild>
        <a href={href}>
          {text} <MoveRight className="w-4 h-4" />
        </a>
      </Button>
    </div>
  );
} 