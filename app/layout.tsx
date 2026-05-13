import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import { SiteNav } from "./components/SiteNav";

export const metadata: Metadata = {
  title: {
    default: "ServiceOpera",
    template: "%s · ServiceOpera",
  },
  icons: {
    icon: "/assets/favicon.png",
    apple: "/assets/favicon.png",
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
        <Script src="/so-api.js" strategy="afterInteractive" />
        <Script src="/user-account-menu.js" strategy="afterInteractive" />
        <Script src="/site-nav-drawer.js" strategy="afterInteractive" />
        <Script src="/theme.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
