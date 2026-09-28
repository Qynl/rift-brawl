import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "RIFT BRAWL — Platform Fighter",
  description: "A fast, polished 1v1 platform fighting game. Four original fighters, six dynamic stages, adaptive AI. Playable in your browser.",
  keywords: ["RIFT BRAWL", "platform fighter", "browser game", "fighting game"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased font-game bg-[#07060f] text-white overflow-hidden">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
