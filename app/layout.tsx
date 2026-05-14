import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import { SiteNav } from "./components/SiteNav";

export const metadata: Metadata = {
  metadataBase: new URL("https://serviceopera.to"),
  title: {
    default: "www.serviceopera.to",
    template: "%s · www.serviceopera.to",
  },
  description:
    "AI operations for hotels, clinics, and property operators: 48-hour private audits, pilots, and managed execution.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "www.serviceopera.to",
    url: "https://serviceopera.to/",
    title: "www.serviceopera.to",
    description:
      "AI operations for hotels, clinics, and property operators: 48-hour private audits, pilots, and managed execution.",
    locale: "en_US",
    images: [
      {
        url: "https://serviceopera.to/assets/logo.png",
        width: 512,
        height: 512,
        alt: "www.serviceopera.to",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "www.serviceopera.to",
    description:
      "AI operations for hotels, clinics, and property operators: 48-hour private audits, pilots, and managed execution.",
    images: ["https://serviceopera.to/assets/logo.png"],
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "any" }],
    apple: "/favicon.png",
  },
};

const themeBoot = `(function(){var k='so-theme',d=document.documentElement,t;try{t=localStorage.getItem(k)}catch(e){}if(t!=='light'&&t!=='dark')t='light';d.setAttribute('data-theme',t)})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="page-mkt">
        <div className="grain" aria-hidden="true" />
        <SiteNav />
        {children}
        <Script
          id="ld-org"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "@id": "https://serviceopera.to/#organization",
              name: "ServiceOpera.to",
              alternateName: ["www.serviceopera.to", "serviceopera.to"],
              url: "https://serviceopera.to/",
              logo: "https://serviceopera.to/assets/logo.png",
              email: "jack@serviceopera.to",
              description:
                "AI operations and automation for hotels, clinics, and property operators.",
            }),
          }}
        />
        <Script src="/so-api.js" strategy="afterInteractive" />
        <Script src="/user-account-menu.js" strategy="afterInteractive" />
        <Script src="/site-nav-drawer.js" strategy="afterInteractive" />
        <Script src="/theme.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
