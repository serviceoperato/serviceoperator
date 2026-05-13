import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Remote AI operations for hotels, clinics and property operators in Pattaya and Thailand.",
};

const subtitle =
  "Remote AI operations for hotels, clinics and property operators in Pattaya and Thailand. Start free, scale when it works.";

const freeDescription =
  "You receive a private audit report within 48 hours covering your public footprint, 3 visible operational gaps and one pilot idea — built from public data, not assumptions.";

const footerNote =
  "Prices in Thai Baht (THB). Custom build fees may apply for complex integrations on White-Glove. Month-to-month, no annual lock-in. All tiers negotiable for multi-location operators.";

export default function PricingPage() {
  return (
    <main className="mkt-page so-pricing-fadeIn">
      <section aria-labelledby="pricing-heading">
        <header className="so-pricing-header">
          <h1 id="pricing-heading" className="so-pricing-title">
            Pricing
          </h1>
          <p className="so-pricing-subtitle">{subtitle}</p>
        </header>

        <div className="so-pricing-grid">
          <article className="so-pricing-card" aria-labelledby="tier-free-heading">
            <p id="tier-free-heading" className="so-pricing-label">
              Free Audit
            </p>
            <p className="so-pricing-price">฿0</p>
            <p className="so-pricing-subtext">One-time · No card required</p>
            <p className="so-pricing-description">{freeDescription}</p>
            <a
              className="so-pricing-cta so-pricing-cta--primary"
              href="/reports.html#inquiry"
              aria-label="Request your free audit"
            >
              Request your free audit
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
              href="mailto:jack@serviceopera.to?subject=Operator%20Plan"
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
              href="mailto:jack@serviceopera.to?subject=White-Glove"
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
