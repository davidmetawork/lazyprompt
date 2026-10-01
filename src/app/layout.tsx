import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { getBaseUrl } from "@/lib/base-url";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: `${SITE_NAME} - free AI prompts`, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: "website" },
  twitter: { card: "summary_large_image" },
  ...(process.env.SEO_NOINDEX === "true" ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geistSans.variable, geistMono.variable)}>
      <body className="min-h-dvh antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
