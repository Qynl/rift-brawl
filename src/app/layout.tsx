import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

const DESCRIPTION =
  "A fast, polished platform fighter for the browser. Twelve original brawlers, each with its own signature resource, six dynamic stages, capability-gated AI, online lobby play, replays and full touch support.";

export const metadata: Metadata = {
  applicationName: "RIFT BRAWL",
  title: {
    default: "RIFT BRAWL — Platform Fighter",
    template: "%s · RIFT BRAWL",
  },
  description: DESCRIPTION,
  keywords: ["RIFT BRAWL", "platform fighter", "browser game", "fighting game", "smash-like", "PWA game"],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RIFT BRAWL",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    siteName: "RIFT BRAWL",
    title: "RIFT BRAWL — Platform Fighter",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Two RIFT BRAWL fighters clashing across a dimensional rift" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RIFT BRAWL — Platform Fighter",
    description: "Twelve brawlers, twelve signature mechanics, deterministic replays. A platform fighter that runs in your browser.",
    images: ["/og.jpg"],
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
        <ServiceWorker />
      </body>
    </html>
  );
}
