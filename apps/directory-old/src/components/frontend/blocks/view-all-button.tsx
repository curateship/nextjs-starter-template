import MoveRight from "lucide-react/dist/esm/icons/move-right.js"
import Link from "@/components/app-link";
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
  const label = (
    <>
      {text} <MoveRight className="w-4 h-4" />
    </>
  );

  const buttonElement = (
    <Button className={`gap-4 ${className}`} asChild>
      {href.startsWith("/") && !href.startsWith("//") ? (
        <Link href={href}>{label}</Link>
      ) : (
        <a href={href}>{label}</a>
      )}
    </Button>
  );

  // If className is provided, return just the button (for inline use)
  // Otherwise, wrap in positioning div (for standalone use)
  if (className && className !== "") {
    return buttonElement;
  }

  return (
    <div className="flex justify-center mt-8">
      {buttonElement}
    </div>
  );
}
