import type { Metadata } from "next";
import { Suspense } from "react";
import { PricingInquiryClient } from "./PricingInquiryClient";

export const metadata: Metadata = {
  title: "Pricing inquiry",
  description:
    "Request Free Audit, Operator, or White-Glove — work email, sector, and priority (lead only; no automatic portal signup).",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://serviceopera.to/pricing/inquiry" },
};

export default function PricingInquiryPage() {
  return (
    <main className="mkt-page so-pricing-fadeIn so-pricing-inquiry">
      <Suspense
        fallback={
          <p className="so-pricing-subtitle" style={{ textAlign: "center", marginTop: "2rem" }}>
            Loading…
          </p>
        }
      >
        <PricingInquiryClient />
      </Suspense>
    </main>
  );
}
