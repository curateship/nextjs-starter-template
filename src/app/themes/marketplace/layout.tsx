import { NavBlock } from "@/components/frontend/pages/navigation/PageNavigationBlock";
import { FooterBlock } from "@/components/frontend/pages/footer/PageFooterBlock";
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