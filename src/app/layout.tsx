import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

/**
 * Everything the browser fetches by absolute path has to carry the base path,
 * or the whole site 404s the moment it is served from a sub-directory (which
 * is exactly what a GitHub project page is).
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://qynl.github.io/rift-brawl";

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
  metadataBase: new URL(SITE),
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    title: "RIFT BRAWL",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: `${BASE}/favicon.ico`, sizes: "any" },
      { url: `${BASE}/favicon-32.png`, type: "image/png", sizes: "32x32" },
      { url: `${BASE}/icon-192.png`, type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: `${BASE}/apple-touch-icon.png`, sizes: "180x180" }],
  },
  openGraph: {
    siteName: "RIFT BRAWL",
    title: "RIFT BRAWL — Platform Fighter",
    description: DESCRIPTION,
    type: "website",
    url: SITE,
    images: [{ url: `${BASE}/og.jpg`, width: 1200, height: 630, alt: "Two RIFT BRAWL fighters clashing across a dimensional rift" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RIFT BRAWL — Platform Fighter",
    description: "Twelve brawlers, twelve signature mechanics, deterministic replays. A platform fighter that runs in your browser.",
    images: [`${BASE}/og.jpg`],
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
      <body className="antialiased font-game bg-[#07060f] text-white touch-manipulation">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
