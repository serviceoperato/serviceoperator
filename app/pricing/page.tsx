import type { Metadata } from "next";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Remote AI operations for hotels, clinics and property operators in Pattaya and Thailand.",
};

export default function PricingPage() {
  return (
    <main className={`mkt-page ${styles.fadeIn}`}>
      <section aria-labelledby="pricing-heading">
        <header className={styles.header}>
          <h1 id="pricing-heading" className={styles.title}>
            Pricing
          </h1>
          <p className={styles.subtitle}>
            Remote AI operations for hotels, clinics and property operators in Pattaya and
            Thailand.
          </p>
        </header>

        <div className={styles.grid}>
          <article className={styles.card} aria-labelledby="tier-free-heading">
            <p id="tier-free-heading" className={styles.label}>
              Free Audit
            </p>
            <p className={styles.price}>฿0</p>
            <p className={styles.subtext}>One-time · No card required</p>
            <a
              className={`${styles.cta} ${styles.ctaPrimary}`}
              href="/reports.html#inquiry"
              aria-label="Request your free audit"
            >
              Request your free audit
            </a>
          </article>

          <article
            className={`${styles.card} ${styles.cardRecommended}`}
            aria-labelledby="tier-operator-heading"
          >
            <span className={`${styles.badge} ${styles.badgeAccent}`} aria-hidden="true">
              Most popular
            </span>
            <p id="tier-operator-heading" className={styles.label}>
              Operator
            </p>
            <p className={styles.price}>฿3,900/mo</p>
            <p className={styles.subtext}>
              Recommended · Cancel anytime · Prices in THB excl. VAT
            </p>
            <ul className={styles.features}>
              <li>Monthly audit refresh</li>
              <li>Competitor &amp; price signal dashboard</li>
              <li>One active AI workflow (reviews, intake or follow-up)</li>
              <li>Async support · 48h reply</li>
            </ul>
            <a
              className={`${styles.cta} ${styles.ctaPrimary}`}
              href="mailto:jack@serviceopera.to?subject=Operator%20Plan"
              aria-label="Start Operator"
            >
              Start Operator
            </a>
          </article>

          <article className={styles.card} aria-labelledby="tier-white-heading">
            <span className={styles.badge} aria-hidden="true">
              Limited
            </span>
            <p id="tier-white-heading" className={styles.label}>
              White-Glove
            </p>
            <p className={styles.price}>฿9,900/mo</p>
            <p className={styles.subtext}>Limited to 5 active clients</p>
            <ul className={styles.features}>
              <li>Everything in Operator</li>
              <li>Up to 3 active automations</li>
              <li>Custom integrations</li>
              <li>Monthly review call</li>
              <li>Priority support</li>
            </ul>
            <a
              className={`${styles.cta} ${styles.ctaSecondary}`}
              href="mailto:jack@serviceopera.to?subject=White-Glove"
              aria-label="Apply for White-Glove"
            >
              Apply for White-Glove
            </a>
          </article>
        </div>
      </section>

      <footer>
        <p className={styles.footerNote}>
          {`Prices in Thai Baht (THB). Custom build fees may apply for complex
integrations on White-Glove. Month-to-month, no annual lock-in.
All tiers negotiable for multi-location operators.`}
        </p>
      </footer>
    </main>
  );
}
