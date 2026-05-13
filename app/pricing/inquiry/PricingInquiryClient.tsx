"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const TIER_LABEL: Record<string, string> = {
  free: "Free Audit",
  operator: "Operator",
  white: "White-Glove",
};

function parseTier(raw: string | null): "free" | "operator" | "white" {
  const s = (raw || "").toLowerCase().trim();
  if (s === "operator") return "operator";
  if (s === "white" || s === "white-glove" || s === "white_glove") return "white";
  return "free";
}

function apiPath(path: string) {
  if (typeof window !== "undefined" && typeof window.soApiUrl === "function") {
    return window.soApiUrl(path);
  }
  return path;
}

function apiCredentials(): RequestCredentials {
  if (typeof window !== "undefined" && typeof window.soApiCredentials === "function") {
    return window.soApiCredentials();
  }
  return "same-origin";
}

export function PricingInquiryClient() {
  const searchParams = useSearchParams();
  const tier = useMemo(() => parseTier(searchParams.get("plan")), [searchParams]);
  const [status, setStatus] = useState<{ msg: string; kind: "error" | "ok" | "" }>({ msg: "", kind: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/pricing/inquiry";
    void fetch(apiPath("/api/marketing/lead-event"), {
      method: "POST",
      credentials: apiCredentials(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "pricing_form_view",
        tier,
        path,
        referrer: typeof document !== "undefined" ? document.referrer || "" : "",
      }),
    }).catch(() => {});
  }, [tier]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ msg: "", kind: "" });
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "").trim();
    const business = String(fd.get("business") || "").trim();
    const sector = String(fd.get("sector") || "").trim();
    const improvement = String(fd.get("improvement") || "").trim();
    if (!email || !password || password.length < 8 || !name || !business || !sector || !improvement) {
      setStatus({ msg: "Please fill all fields. Password must be at least 8 characters.", kind: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiPath("/api/marketing/pricing-inquiry"), {
        method: "POST",
        credentials: apiCredentials(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: tier,
          email,
          password,
          name,
          business,
          sector,
          improvement,
          source: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/pricing/inquiry",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        sessionId?: string;
        reportUrl?: string;
        message?: string;
      };
      if (!res.ok || !json.token) {
        throw new Error(json.error || "Request failed.");
      }
      try {
        localStorage.setItem("so_user_jwt", json.token);
        if (json.sessionId) {
          localStorage.setItem("so_user_session_id", json.sessionId);
          sessionStorage.setItem("so_user_session_id", json.sessionId);
        }
      } catch {
        /* ignore */
      }
      setStatus({ msg: json.message || "Signed in. Redirecting…", kind: "ok" });
      const dest = json.reportUrl || "/clinics/report.html";
      setTimeout(() => {
        window.location.href = dest.startsWith("/") ? dest : `/${dest}`;
      }, 400);
    } catch (err) {
      setStatus({
        msg: err instanceof Error ? err.message : "Something went wrong.",
        kind: "error",
      });
      setSubmitting(false);
    }
  }

  const tierTitle = TIER_LABEL[tier] || TIER_LABEL.free;

  return (
    <>
      <header className="so-pricing-header">
        <h1 className="so-pricing-title">Request · {tierTitle}</h1>
        <p className="so-pricing-subtitle">
          Create or sign in to your portal account for this tier. You will be redirected to your private report after submit.
        </p>
      </header>

      <form className="inquiry-form so-pricing-inquiry__form" onSubmit={onSubmit} noValidate>
        <p className="so-pricing-inquiry__privacy">
          We collect your IP address, pages visited, and timestamps to deliver the audit or plan you requested and to protect the
          service. Questions:{" "}
          <a href="mailto:jack@serviceopera.to">jack@serviceopera.to</a>.
        </p>

        <label className="inquiry-form__field" htmlFor="field-email">
          <span className="inquiry-form__label">Work email</span>
          <input className="inquiry-form__control" id="field-email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className="inquiry-form__field" htmlFor="field-password">
          <span className="inquiry-form__label">Password (min 8 characters)</span>
          <input
            className="inquiry-form__control"
            id="field-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        <label className="inquiry-form__field" htmlFor="field-name">
          <span className="inquiry-form__label">Name</span>
          <input className="inquiry-form__control" id="field-name" name="name" type="text" autoComplete="name" required />
        </label>
        <label className="inquiry-form__field" htmlFor="field-business">
          <span className="inquiry-form__label">Business</span>
          <input className="inquiry-form__control" id="field-business" name="business" type="text" autoComplete="organization" required />
        </label>
        <label className="inquiry-form__field" htmlFor="field-sector">
          <span className="inquiry-form__label">Sector</span>
          <input
            className="inquiry-form__control"
            id="field-sector"
            name="sector"
            type="text"
            placeholder="Hotels, clinics, property, other"
            required
          />
        </label>
        <label className="inquiry-form__field" htmlFor="field-improvement">
          <span className="inquiry-form__label">What do you want to improve?</span>
          <textarea
            className="inquiry-form__control"
            id="field-improvement"
            name="improvement"
            rows={4}
            required
            placeholder="One urgent operational pain, bottleneck, or goal."
          />
        </label>

        <div className="inquiry-form__actions">
          <button type="submit" className="btn btn-primary inquiry-form__submit" disabled={submitting}>
            {submitting ? "Sending…" : "Submit and open workspace"}
          </button>
        </div>
        {status.msg ? (
          <p
            className={`inquiry-form__status${status.kind === "error" ? " is-error" : ""}${status.kind === "ok" ? " is-success" : ""}`}
            role="status"
            aria-live="polite"
          >
            {status.msg}
          </p>
        ) : null}
      </form>
    </>
  );
}
