import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "RIFT BRAWL — Platform Fighter",
  description:
    "A fast, polished platform fighter for the browser. Twelve original brawlers, each with its own signature resource, six dynamic stages, adaptive AI, online play and full touch support.",
  keywords: ["RIFT BRAWL", "platform fighter", "browser game", "fighting game", "smash-like"],
  openGraph: {
    title: "RIFT BRAWL",
    description: "Twelve brawlers, twelve signature mechanics. A platform fighter that runs in your browser.",
    type: "website",
  },
};

// Fighting games need the full viewport and no pinch-zoom stealing touch input.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#07060f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased font-game bg-[#07060f] text-white overflow-hidden overscroll-none touch-manipulation">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
