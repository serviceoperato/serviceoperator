import type { ReactNode } from "react";

export default function PricingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/pricing-mkt.css" />
      {children}
    </>
  );
}
