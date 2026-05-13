import type { Metadata } from "next";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing · ServiceOpera",
  description:
    "Remote AI operations for hotels, clinics and property operators in Pattaya and Thailand.",
};

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Pricing</h1>
        <p className={styles.subtitle}>
          {`Remote AI operations for hotels, clinics and property operators
in Pattaya and Thailand. Start free, scale when it works.`}
        </p>
      </header>

      <div className={styles.grid}>
        <article className={styles.card} aria-labelledby="tier-free-heading">
          <p id="tier-free-heading" className={styles.label}>
            Free Audit
          </p>
          <p className={styles.price}>฿0</p>
          <p className={styles.subtext}>One-time · No card required</p>
          <p className={styles.description}>
            {`You receive a private audit report within 48 hours covering
your public footprint, 3 visible operational gaps and one pilot idea —
built from public data, not assumptions.`}
          </p>
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
          <span className={styles.badge} aria-hidden="true">
            Most popular
          </span>
          <p id="tier-operator-heading" className={styles.label}>
            Operator
          </p>
          <p className={styles.price}>฿3,900 / month</p>
          <p className={styles.subtext}>Cancel anytime · Prices in THB excl. VAT</p>
          <ul className={styles.features}>
            <li>Monthly audit refresh</li>
            <li>Competitor &amp; price signal dashboard</li>
            <li>One active AI workflow (reviews, intake or follow-up)</li>
            <li>Async support · 48h reply</li>
          </ul>
          <a
            className={`${styles.cta} ${styles.ctaPrimary}`}
            href="mailto:jack@serviceopera.to?subject=Operator%20Plan"
            aria-label="Start Operator plan via email to jack@serviceopera.to"
          >
            Start Operator
          </a>
        </article>

        <article className={styles.card} aria-labelledby="tier-white-heading">
          <span className={`${styles.badge} ${styles.badgeMuted}`} aria-hidden="true">
            Limited
          </span>
          <p id="tier-white-heading" className={styles.label}>
            White-Glove
          </p>
          <p className={styles.price}>฿9,900 / month</p>
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
            aria-label="Apply for White-Glove plan via email to jack@serviceopera.to"
          >
            Apply for White-Glove
          </a>
        </article>
      </div>

      <p className={styles.footerNote}>
        {`Prices in Thai Baht (THB). Custom build fees may apply for complex
integrations on White-Glove. Month-to-month, no annual lock-in.
All tiers negotiable for multi-location operators.`}
      </p>
    </div>
  );
}
