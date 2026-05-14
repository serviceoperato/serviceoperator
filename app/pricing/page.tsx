import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Remote AI operations for hotels, clinics, wellness and property operators. Start free; pricing in THB with USD/EUR quotes on request.",
  alternates: { canonical: "https://serviceopera.to/pricing" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Pricing · www.serviceopera.to",
    description:
      "Remote AI operations for hotels, clinics, wellness and property operators. Start free; pricing in THB with USD/EUR quotes on request.",
    url: "https://serviceopera.to/pricing",
    siteName: "www.serviceopera.to",
    type: "website",
    locale: "en_US",
    images: [{ url: "https://serviceopera.to/assets/logo.png", width: 512, height: 512, alt: "www.serviceopera.to" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing · www.serviceopera.to",
    description:
      "Remote AI operations for hotels, clinics, wellness and property operators. Start free; pricing in THB with USD/EUR quotes on request.",
    images: ["https://serviceopera.to/assets/logo.png"],
  },
};

const subtitle =
  "Remote AI operations for hotels, clinics and property operators serving international customers. Start free, scale when it works.";

const credibility =
  "Remote AI operations for hotels, clinics, wellness brands, and property portfolios serving international demand — delivery and support on a fixed cadence.";

const freeDescription =
  "Private audit within 48 hours: public footprint review, three visible operational gaps, three automation opportunities, and one pilot idea — structured, not generic.";

const footerNote =
  "International clients welcome. Pricing shown in Thai Baht (THB); USD/EUR quotes available on request. Custom build fees may apply for complex integrations on White-Glove. Month-to-month, no annual lock-in. All tiers negotiable for multi-location operators.";

export default function PricingPage() {
  return (
    <main className="mkt-page so-pricing-fadeIn">
      <section aria-labelledby="pricing-heading">
        <header className="so-pricing-header">
          <h1 id="pricing-heading" className="so-pricing-title">
            Pricing
          </h1>
          <p className="so-pricing-subtitle">{subtitle}</p>
          <p className="so-pricing-credibility">{credibility}</p>
        </header>

        <div className="so-pricing-grid">
          <article className="so-pricing-card" aria-labelledby="tier-free-heading">
            <p id="tier-free-heading" className="so-pricing-label">
              48-hour private audit
            </p>
            <p className="so-pricing-price">฿0</p>
            <p className="so-pricing-subtext">One-time · No card required</p>
            <p className="so-pricing-description">{freeDescription}</p>
            <a
              className="so-pricing-cta so-pricing-cta--primary"
              href="/pricing/inquiry?plan=free"
              aria-label="Request a 48-hour private audit"
            >
              Request a 48-hour private audit
            </a>
          </article>

          <article
            className="so-pricing-card so-pricing-card--recommended"
            aria-labelledby="tier-operator-heading operator-recommended"
          >
            <span id="operator-recommended" className="sr-only">
              Recommended tier.
            </span>
            <span className="so-pricing-badge so-pricing-badge--accent">Most popular</span>
            <p id="tier-operator-heading" className="so-pricing-label">
              Operator
            </p>
            <p className="so-pricing-price">฿3,900 / month</p>
            <p className="so-pricing-subtext">Cancel anytime · Prices in THB excl. VAT</p>
            <ul className="so-pricing-features">
              <li>Monthly audit refresh</li>
              <li>Competitor &amp; price signal dashboard</li>
              <li>One active AI workflow (reviews, intake or follow-up)</li>
              <li>Async support · 48h reply</li>
            </ul>
            <a
              className="so-pricing-cta so-pricing-cta--primary"
              href="/pricing/inquiry?plan=operator"
              aria-label="Start Operator"
            >
              Start Operator
            </a>
          </article>

          <article className="so-pricing-card" aria-labelledby="tier-white-heading">
            <span className="so-pricing-badge">Limited</span>
            <p id="tier-white-heading" className="so-pricing-label">
              White-Glove
            </p>
            <p className="so-pricing-price">฿9,900 / month</p>
            <p className="so-pricing-subtext">Limited to 5 active clients</p>
            <ul className="so-pricing-features">
              <li>Everything in Operator</li>
              <li>Up to 3 active automations</li>
              <li>Custom integrations</li>
              <li>Monthly review call</li>
              <li>Priority support</li>
            </ul>
            <a
              className="so-pricing-cta so-pricing-cta--secondary"
              href="/pricing/inquiry?plan=white"
              aria-label="Apply for White-Glove"
            >
              Apply for White-Glove
            </a>
          </article>
        </div>
      </section>

      <footer>
        <p className="so-pricing-footerNote">{footerNote}</p>
      </footer>
    </main>
  );
}
