import type { Metadata } from "next";
import Link from "next/link";
import { OperatorReportsClient } from "./OperatorReportsClient";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

export default function OperatorReportsPage() {
  return (
    <main className="tf-admin-table-card" style={{ maxWidth: 1200, margin: "1.25rem auto 3rem", padding: "0 1rem" }}>
      <nav className="tf-admin-nav" aria-label="Operator sections" style={{ marginBottom: "1rem" }}>
        <div className="tf-admin-nav__row">
          <Link className="tf-admin-nav__pill" href="/admin/users">
            Users &amp; payouts
          </Link>
          <Link className="tf-admin-nav__pill" href="/admin/activity">
            Activity log
          </Link>
          <Link className="tf-admin-nav__pill" href="/admin/deploy-log">
            Deploy log
          </Link>
          <Link className="tf-admin-nav__pill" href="/admin/site-appearance">
            Site appearance
          </Link>
          <Link className="tf-admin-nav__pill is-active" href="/operator/reports" aria-current="page">
            Reports
          </Link>
          <Link className="tf-admin-nav__pill" href="/reports/catalog.html">
            Report catalog
          </Link>
          <Link className="tf-admin-nav__pill" href="/admin/user-reports">
            User reports
          </Link>
        </div>
      </nav>

      <h1 className="tf-admin-section-title" style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>
        Audit reports
      </h1>
      <p className="tf-admin-muted" style={{ margin: "0 0 1rem" }}>
        Management view for all audit/report entries the API aggregates from{" "}
        <code className="mono">public/reports/index.json</code>,{" "}
        <code className="mono">public/clinics/data/*.json</code>, and portal users with a{" "}
        <code className="mono">reportSlug</code>.
      </p>

      <OperatorReportsClient />
    </main>
  );
}
