import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

export type ThemeMode = "light" | "dark" | "system";

const themes = [
  {
    key: "system",
    icon: Monitor,
    label: "System theme",
  },
  {
    key: "light",
    icon: Sun,
    label: "Light theme",
  },
  {
    key: "dark",
    icon: Moon,
    label: "Dark theme",
  },
] satisfies { key: ThemeMode; icon: typeof Monitor; label: string }[];

export type ThemeSwitcherProps = {
  value: ThemeMode;
  onChange: (theme: ThemeMode) => void;
  className?: string;
};

export const ThemeSwitcher = ({
  value,
  onChange,
  className,
}: ThemeSwitcherProps) => {
  return (
    <div
      className={cn(
        "relative isolate flex h-8 rounded-full bg-background p-1",
        className
      )}
    >
      {themes.map(({ key, icon: Icon, label }) => {
        const isActive = value === key;

        return (
          <button
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              "relative h-6 w-6 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive && "bg-secondary text-foreground"
            )}
            key={key}
            onClick={() => onChange(key)}
            type="button"
          >
            <Icon className="relative z-10 m-auto h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
};
