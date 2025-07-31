import { Navbar } from "@/components/navigation/navbar";
import Footer from "@/components/navigation/footer";
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