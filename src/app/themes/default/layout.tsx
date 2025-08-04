import { NavBlock } from "@/components/frontend/layout/NavBlock";
import { FooterBlock } from "@/components/frontend/layout/FooterBlock";
import { type ReactNode } from "react";

export default function DefaultThemeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-50">
        <div>
          <NavBlock />
        </div>
      </div>
      {children}
      <FooterBlock />
    </>
  )
} 