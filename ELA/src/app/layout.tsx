import type { Metadata, Viewport } from "next";
import "./globals.css";
import NetworkGuard from "@/components/NetworkGuard";
import InstallPromptBanner from "@/components/pwa/InstallPromptBanner";

export const viewport: Viewport = {
  themeColor: "#1a5c3a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "منصة ELA | صديقك وخبير مزرعتك",
  description: "هو صديقك وخبير مزرعتك - المنصة الزراعية والذكية المتكاملة",
  applicationName: "ELA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ELA",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.jpg", sizes: "192x192", type: "image/jpeg" },
      { url: "/icons/icon-512x512.jpg", sizes: "512x512", type: "image/jpeg" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.jpg", sizes: "180x180", type: "image/jpeg" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#1a5c3a" />
      </head>
      <body>
        <NetworkGuard />
        {children}
        <InstallPromptBanner />
      </body>
    </html>
  );
}

