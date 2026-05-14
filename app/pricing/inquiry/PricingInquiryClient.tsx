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

const sectorSvgCommon = {
  viewBox: "0 0 24 24" as const,
  focusable: false as const,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Decorative; label text remains the control name for assistive tech. Matches homepage sector line icons + 2×2 grid for Other. */
function SoSectorIcon({ which }: { which: "hotels" | "clinics" | "property" | "other" }) {
  return (
    <span className="so-sector-choice__icon" aria-hidden="true">
      {which === "hotels" ? (
        <svg {...sectorSvgCommon}>
          <path d="M4 20h16" />
          <path d="M6 20V10L12 6.5l6 3.5V20" />
          <path d="M12 6.5V4" />
          <path d="M8 20v-6h8v6" />
          <rect x="8.5" y="11" width="2" height="2" rx="0.35" />
          <rect x="11" y="11" width="2" height="2" rx="0.35" />
          <rect x="13.5" y="11" width="2" height="2" rx="0.35" />
          <rect x="8.5" y="14.5" width="2" height="2" rx="0.35" />
          <rect x="11" y="14.5" width="2" height="2" rx="0.35" />
          <rect x="13.5" y="14.5" width="2" height="2" rx="0.35" />
        </svg>
      ) : which === "clinics" ? (
        <svg {...sectorSvgCommon}>
          <path d="M12 4.5c-1.8 2.8-4.5 5-4.5 8.8a4.5 4.5 0 0 0 9 0c0-3.8-2.7-6-4.5-8.8z" />
          <path d="M8.5 13c1.4 1.1 2.6 1.6 3.5 1.6s2.1-.5 3.5-1.6" />
          <path d="M7.5 15.5c1.8 1.5 3.2 2 4.5 2s2.7-.5 4.5-2" />
          <path d="M12 4.5v2" />
        </svg>
      ) : which === "property" ? (
        <svg {...sectorSvgCommon}>
          <path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11.5z" />
          <path d="M9 21v-7h6v7" />
        </svg>
      ) : (
        <svg {...sectorSvgCommon}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      )}
    </span>
  );
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
    const sector = String(fd.get("sector") || "").trim();
    const improveFirst = String(fd.get("improveFirst") || "").trim();
    const company_url = String(fd.get("company_url") || "").trim();
    if (!email || !sector || !improveFirst) {
      setStatus({
        msg: "Please enter your work email, choose a sector, and describe what to improve first.",
        kind: "error",
      });
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
          sector,
          improveFirst,
          source: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/pricing/inquiry",
          company_url,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Request failed.");
      }
      setStatus({ msg: json.message || "Thanks — your request was sent.", kind: "ok" });
      e.currentTarget.reset();
      const planInput = e.currentTarget.querySelector('input[name="plan"]') as HTMLInputElement | null;
      if (planInput) planInput.value = tier;
    } catch (err) {
      setStatus({
        msg: err instanceof Error ? err.message : "Something went wrong.",
        kind: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const tierTitle = TIER_LABEL[tier] || TIER_LABEL.free;

  return (
    <>
      <header className="so-pricing-header">
        <h1 className="so-pricing-title">Request · {tierTitle}</h1>
        <p className="so-pricing-subtitle">
          Send your work email, sector, and top priority for {tierTitle}. No portal account is created here — use Log in or Register when
          you are ready.
        </p>
      </header>

      <form className="inquiry-form so-pricing-inquiry__form" onSubmit={onSubmit} noValidate>
        <input type="hidden" name="plan" value={tier} />
        <p className="so-pricing-inquiry__privacy">
          We collect your IP address, pages visited, and timestamps to deliver the audit or plan you requested and to protect the service.
          Questions: <a href="mailto:jack@serviceopera.to">jack@serviceopera.to</a>.
        </p>

        <label className="inquiry-form__field" htmlFor="field-email">
          <span className="inquiry-form__label">Work email</span>
          <input className="inquiry-form__control" id="field-email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>

        <fieldset className="inquiry-form__field so-sector-choice">
          <legend className="inquiry-form__label">Sector</legend>
          <div className="so-sector-choice__grid" role="presentation">
            <label className="so-sector-choice__opt">
              <input type="radio" name="sector" value="hotels" className="so-sector-choice__input" required />
              <SoSectorIcon which="hotels" />
              <span className="so-sector-choice__label">Hotels</span>
            </label>
            <label className="so-sector-choice__opt">
              <input type="radio" name="sector" value="clinics" className="so-sector-choice__input" />
              <SoSectorIcon which="clinics" />
              <span className="so-sector-choice__label">Clinics</span>
            </label>
            <label className="so-sector-choice__opt">
              <input type="radio" name="sector" value="property" className="so-sector-choice__input" />
              <SoSectorIcon which="property" />
              <span className="so-sector-choice__label">Property</span>
            </label>
            <label className="so-sector-choice__opt">
              <input type="radio" name="sector" value="other" className="so-sector-choice__input" />
              <SoSectorIcon which="other" />
              <span className="so-sector-choice__label">Other</span>
            </label>
          </div>
        </fieldset>

        <label className="inquiry-form__field" htmlFor="field-improve-first">
          <span className="inquiry-form__label">What should we improve first?</span>
          <textarea
            className="inquiry-form__control"
            id="field-improve-first"
            name="improveFirst"
            rows={4}
            required
            placeholder="One urgent operational pain, bottleneck, or goal."
          />
        </label>

        <div className="inquiry-form__hp" aria-hidden="true">
          <label htmlFor="field-company-url">Company website</label>
          <input type="text" id="field-company-url" name="company_url" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="inquiry-form__actions">
          <button type="submit" className="btn btn-primary inquiry-form__submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send request"}
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
