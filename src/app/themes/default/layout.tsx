import { Navbar } from "@/components/ui/navigation/navbar";
import Footer from "@/components/ui/navigation/footer";
import { type ReactNode } from "react";

export default function DefaultThemeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  )
} 