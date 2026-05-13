import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return <div className="page-admin page-admin--with-nav">{children}</div>;
}
