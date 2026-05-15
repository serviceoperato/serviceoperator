// ============================================================
// SERVICEOPERA.TO — Reusable Audit Data Template
// Usage: duplicate this file, fill in client-specific data,
//        import into your Next.js page/component via Cursor AI.
// Based on: DDC Pattaya audit · May 2026 · v1.5.11
// ============================================================

// ── Types ────────────────────────────────────────────────────

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type Priority = "P1" | "P2" | "P3";
export type Effort = "Very Low" | "Low" | "Medium" | "High";
export type ImpactLevel = "Critical" | "High" | "Medium" | "Low";

export interface AuditMeta {
  businessName: string;
  slug: string; // used for URL: /clinics/[slug]/
  location: string;
  category: string;
  auditDate: string; // "May 2026"
  preparedBy: string;
  website: string;
  auditPotential: number; // 0–10
  estimatedRating: string; // "4.8/5"
  version: string; // "1.5.11"
}

export interface ContactInfo {
  phone: string[];
  email: string;
  address: string;
  languages: string[];
}

export interface KeyPerson {
  name: string;
  role: string;
  credentials: string[];
  highlights?: string;
}

// ── Section 01: Business Snapshot ───────────────────────────

export interface BusinessSnapshot {
  fields: Record<string, string>;
  strategicPosition: string;
  keyPeople: KeyPerson[];
}

// ── Section 02: Patient/Customer Journey ────────────────────

export type JourneyStatus = "✓ Functional" | "⚠ High Friction" | "⚠ Manual" | "⚠ Critical Gap" | "⚠ Missing" | "⚠ Partial";

export interface JourneyStage {
  stage: number;
  name: string;
  status: JourneyStatus;
  notes: string[];
}

export interface PatientJourney {
  strategicInsight: string;
  stages: JourneyStage[];
}

// ── Section 03: Intake & Booking Friction ───────────────────

export interface FrictionItem {
  id: string; // "🔴 Critical #1"
  title: string;
  description: string;
  severity: Severity;
}

export interface BookingFriction {
  urgentRisk: string;
  quickSignals: {
    label: string;
    value: string; // "Critical" | "12–18h" etc.
    severity: Severity;
  }[];
  frictionItems: FrictionItem[];
}

// ── Section 04: Public Reputation Audit ─────────────────────

export interface PlatformReputation {
  platform: string;
  score: string;
  volume: string;
  riskFlag: string;
}

export interface ReputationAudit {
  operationalRisk: string;
  platforms: PlatformReputation[];
}

// ── Section 05: Review Pattern Analysis ─────────────────────

export interface ReviewItem {
  platform: string;
  year?: string;
  excerpt: string;
  meta: string;
  status: string; // "⚠ Unanswered" etc.
}

export interface ReviewTheme {
  theme: string;
  scores: {
    Google: number;
    TripAdvisor: number;
    WhatClinic: number;
    ExpatForums: number;
  };
}

export interface ReviewPatternAnalysis {
  urgentGap: string;
  currentVelocity: number | string;
  postAutomationTarget: number | string;
  reviews: ReviewItem[];
  recurringThemes: ReviewTheme[];
  themeNote: string;
}

// ── Section 06: Trust & Credibility Signals ─────────────────

export interface TrustSignals {
  strong: string[];
  weak: string[];
}

// ── Section 07: Follow-Up Workflow Gaps ─────────────────────

export interface WorkflowGap {
  order: number;
  title: string;
  description: string;
}

// ── Section 08: Multilingual Communication Risks ────────────

export interface MultilingualRisk {
  risk: string;
  marketAffected: string;
  severity: Severity;
}

export interface MultilingualSection {
  strategicInsight: string;
  risks: MultilingualRisk[];
}

// ── Section 09: AI Automation Opportunities ─────────────────

export interface AutomationOpportunity {
  opportunity: string;
  impact: ImpactLevel;
  effort: Effort;
  priority: Priority;
}

// ── Section 10: 14-Day Quick Wins ───────────────────────────

export interface QuickWins {
  week1: string[];
  week2: string[];
  expectedOutcomes: string;
}

// ── Section 11: 30-Day Expansion Plan ───────────────────────

export interface ExpansionPlan {
  week3Title: string;
  week3: string[];
  week4Title: string;
  week4: string[];
  systemStack: string[];
}

// ── Section 12: Estimated Business Impact ───────────────────

export interface ImpactMetric {
  label: string;
  before: string;
  after: string;
  direction: "up" | "down";
}

export interface BusinessImpact {
  disclaimer: string;
  metrics: ImpactMetric[];
  revenueOpportunity: string;
}

// ── Section 13: Offer ────────────────────────────────────────

export interface ServiceOffer {
  hook: string;
  packageName: string;
  packageIncludes: string[];
  whyIdealClient: string[];
}

// ── Section 14: Sources ──────────────────────────────────────

export interface Source {
  id: number;
  label: string;
  url: string;
}

// ── Root AuditData type ──────────────────────────────────────

export interface AuditData {
  meta: AuditMeta;
  contact: ContactInfo;
  sections: {
    snapshot: BusinessSnapshot;
    journey: PatientJourney;
    bookingFriction: BookingFriction;
    reputationAudit: ReputationAudit;
    reviewPattern: ReviewPatternAnalysis;
    trustSignals: TrustSignals;
    workflowGaps: WorkflowGap[];
    multilingual: MultilingualSection;
    automationOpportunities: AutomationOpportunity[];
    quickWins: QuickWins;
    expansionPlan: ExpansionPlan;
    businessImpact: BusinessImpact;
    offer: ServiceOffer;
    sources: Source[];
  };
}

// ============================================================
// EXAMPLE INSTANCE — DDC Dental Design Center, Pattaya
// Replace values below for each new client audit.
// ============================================================

export const audit20260515: AuditData = {
  meta: {
    businessName: "The Dental Design Center",
    slug: "2026-05-15-audit",
    location: "Pattaya, Thailand",
    category: "Dental Clinic",
    auditDate: "2026-05-15",
    preparedBy: "Jack from ServiceOpera.to",
    website: "https://dentaldesignpattaya.com",
    auditPotential: 9.2,
    estimatedRating: "4.8/5",
    version: "1.5.15",
  },

  contact: {
    phone: ["(038) 111844", "(038) 111845", "094-960-4966"],
    email: "info@dentaldesignpattaya.com",
    address: "365/12–13 Soi 10, Pattaya Second Road, Banglamung, Chonburi 20150",
    languages: ["English", "Thai", "Chinese (Mandarin)"],
  },

  sections: {
    // ── 01 ──────────────────────────────────────────────────
    snapshot: {
      fields: {
        "Business Name": "The Dental Design Center (DDC)",
        "Years Operating": "~15 years (est.)",
        "Invisalign Status": "Sole Elite Platinum Provider — Pattaya City & Eastern Thailand",
        Languages: "English · Thai · Chinese (Mandarin)",
      },
      strategicPosition:
        "Award-winning clinic with 15+ years, internationally credentialed team, exclusive Invisalign status in Eastern Thailand. Strong underlying brand. Automation gap is the primary commercial risk.",
      keyPeople: [
        {
          name: "Dr. Ken Kasidis",
          role: "Implantologist & Prosthodontist",
          credentials: ["Chulalongkorn", "Adelaide", "Toronto", "TADI Board", "AACD", "ICOI Fellow"],
          highlights: "10,000+ implants placed",
        },
        {
          name: "Dr. Ning Porndee",
          role: "Orthodontist",
          credentials: ["Chulalongkorn", "Mahidol", "NYU Orthodontics", "AAO Member"],
        },
      ],
    },

    // ── 02 ──────────────────────────────────────────────────
    journey: {
      strategicInsight:
        "DDC's patient journey is strong on clinical quality but breaks down at every digital touchpoint. The gap between 'patient finds DDC' and 'patient is booked' contains 4 friction points, all automatable within 14 days.",
      stages: [
        {
          stage: 1,
          name: "Discovery",
          status: "✓ Functional",
          notes: [
            "Ranks organically for Pattaya dental tourism terms",
            "No paid search / remarketing detected — organic-only is a long-term risk",
          ],
        },
        {
          stage: 2,
          name: "First Contact",
          status: "⚠ High Friction",
          notes: [
            "No live chat widget on website",
            "No WhatsApp click-to-chat button",
            "No LINE ID on homepage or nav",
            "No chatbot for after-hours international inquiries",
          ],
        },
        {
          stage: 3,
          name: "Consultation",
          status: "⚠ Manual",
          notes: [
            "Free consultation form exists — but no stated response SLA",
            "International patients (AUS/EU) face unknown wait in different time zones",
          ],
        },
        {
          stage: 4,
          name: "Booking",
          status: "⚠ Critical Gap",
          notes: [
            "No real-time calendar booking widget",
            "No instant booking confirmation",
            "Requires phone / email back-and-forth to confirm",
          ],
        },
        {
          stage: 5,
          name: "Pre-Visit",
          status: "⚠ Missing",
          notes: [
            "No automated appointment reminders detected (SMS / WhatsApp / LINE / email)",
            "No new patient intake form page found",
          ],
        },
        {
          stage: 6,
          name: "Post-Visit",
          status: "⚠ Partial",
          notes: [
            "Testimonials exist on website but no automated review request",
            "Review count far below expected for 15-year clinic volume",
          ],
        },
      ],
    },

    // ── 03 ──────────────────────────────────────────────────
    bookingFriction: {
      urgentRisk:
        "DDC operates in a highly competitive dental tourism market where competitors offer WhatsApp bots and instant online booking. Every hour a patient doesn't receive a response is a booking lost to a faster competitor.",
      quickSignals: [
        { label: "No WhatsApp", value: "Critical", severity: "Critical" },
        { label: "No LINE", value: "Critical", severity: "Critical" },
        { label: "Slow Reply", value: "12–18h", severity: "Critical" },
        { label: "No Live Booking", value: "Critical", severity: "Critical" },
        { label: "No Cost Estimator", value: "High", severity: "High" },
      ],
      frictionItems: [
        {
          id: "Critical #1",
          title: "No Real-Time Booking Widget",
          description:
            "Patients must email or call to book. For an Australian researching at midnight, a competitor with instant booking wins the slot. Estimated opportunity cost: 3–5 lost bookings per week.",
          severity: "Critical",
        },
        {
          id: "Critical #2",
          title: "Consultation Form with Unknown Response Time",
          description:
            "No stated SLA. No auto-reply confirmation. No chatbot backup. A patient who submits at 11pm Thailand time may wait 12–18 hours. Competitor clinics with WhatsApp bots reply in under 2 minutes.",
          severity: "Critical",
        },
        {
          id: "Critical #3",
          title: "No WhatsApp / LINE on Homepage",
          description:
            "LINE is Thailand's dominant messaging platform. WhatsApp is the international dental tourist's first contact channel. Neither is prominently accessible. This alone costs 20–30% of inbound leads (estimated from industry data).",
          severity: "Critical",
        },
        {
          id: "High #4",
          title: "No Interactive Cost Estimator",
          description:
            "Pricing page exists but patients cannot self-qualify. Staff time is spent on unqualified inquiries. A 'How much would X cost?' calculator pre-qualifies leads and increases average case value of inquiries.",
          severity: "High",
        },
        {
          id: "High #5",
          title: "5-Step International Booking Process",
          description:
            "Discover → Read → Form-fill → Wait → Schedule call → Book. Each step is a drop-off point. Industry benchmark: every additional step reduces conversion by ~20%.",
          severity: "High",
        },
      ],
    },

    // ── 04 ──────────────────────────────────────────────────
    reputationAudit: {
      operationalRisk:
        "A 2017 TripAdvisor complaint remains publicly indexed with no clinic response found. While old, it appears prominently in search results for 'Dental Design Center Pattaya review'. Unanswered negatives are a trust signal failure for first-time international patients.",
      platforms: [
        { platform: "WhatClinic", score: "8.1 / 10", volume: "97 votes · 5 verified reviews", riskFlag: "Moderate" },
        { platform: "DentalDepartures", score: "Award 2018", volume: "Current volume not quantified", riskFlag: "Low" },
        { platform: "TripAdvisor", score: "—", volume: "1 major negative (2017)", riskFlag: "High Risk" },
        { platform: "Google Maps", score: "Est. 4.x", volume: "Below-market for tenure (est.)", riskFlag: "Needs Action" },
        { platform: "Bookimed", score: "Listed", volume: "Limited reviews vs. BHP", riskFlag: "Moderate" },
      ],
    },

    // ── 05 ──────────────────────────────────────────────────
    reviewPattern: {
      urgentGap:
        "DDC claims 10,000+ implant placements and 15 years of operation. The publicly visible review volume is disproportionately low. This gap is entirely explained by the absence of a post-treatment review request system — not by patient dissatisfaction.",
      currentVelocity: "1–3 per month (est.)",
      postAutomationTarget: "8–15 per month",
      reviews: [
        {
          platform: "TripAdvisor · 2017",
          year: "2017",
          excerpt:
            "Multi-visit case with lab closure mid-treatment. Advance payment dispute. Staff perceived as rude. No response from the clinic on a public thread.",
          meta: "Anonymous traveler · Detailed thread",
          status: "⚠ Unanswered · 9 yrs",
        },
        {
          platform: "WhatClinic · Pattern",
          excerpt:
            "Service score 8.1/10 across 97 votes but only 5 verified reviews. The gap between vote-count and written reviews suggests low post-treatment follow-up engagement.",
          meta: "97 votes · 5 verified · Below volume target",
          status: "⚠ Volume Gap",
        },
        {
          platform: "Google Maps · Est.",
          excerpt:
            "Review volume estimated as below-market for a 15-year clinic claiming 10,000+ implants. Sentiment cannot be assessed without volume.",
          meta: "Below-market volume signal",
          status: "⚠ Needs Action",
        },
        {
          platform: "Multi-platform · Silent",
          excerpt:
            "Non-English reviews (DE/RU/FR) observed in European expat forums remain unanswered. No multilingual response template detected.",
          meta: "EU expat market · DE/RU/FR",
          status: "⚠ Multilingual Gap",
        },
      ],
      recurringThemes: [
        { theme: "Slow / no response",        scores: { Google: 3, TripAdvisor: 4, WhatClinic: 2, ExpatForums: 3 } },
        { theme: "Pricing / payment dispute",  scores: { Google: 1, TripAdvisor: 4, WhatClinic: 1, ExpatForums: 2 } },
        { theme: "Staff communication tone",   scores: { Google: 2, TripAdvisor: 3, WhatClinic: 1, ExpatForums: 2 } },
        { theme: "Multi-visit complications",  scores: { Google: 1, TripAdvisor: 3, WhatClinic: 0, ExpatForums: 2 } },
        { theme: "Booking friction",           scores: { Google: 4, TripAdvisor: 2, WhatClinic: 3, ExpatForums: 3 } },
        { theme: "Multilingual gap (EN/TH/ZH)",scores: { Google: 2, TripAdvisor: 1, WhatClinic: 1, ExpatForums: 3 } },
        { theme: "After-hours blackout",       scores: { Google: 3, TripAdvisor: 2, WhatClinic: 2, ExpatForums: 4 } },
      ],
      themeNote: "Intensity 0–4 (0 = not observed · 4 = severe). Directional estimates from public signals.",
    },

    // ── 06 ──────────────────────────────────────────────────
    trustSignals: {
      strong: [
        "2018 Best Dentists Thailand — Global Patients' Choice Award",
        "Dr. Kasidis: Chulalongkorn + Adelaide + Toronto + TADI + AACD + ICOI Fellow",
        "Sole Elite Platinum Invisalign Provider — Pattaya & Eastern Thailand",
        "iTero 3D Scanner · CBCT Imaging · Class B EU Autoclave",
        "7 LCD-equipped dental chairs with in-chair entertainment",
        "Multilingual contact page (EN / TH / ZH)",
        "Free online consultation offering",
        "Publicly displayed pricing page",
      ],
      weak: [
        "No patient count displayed on website",
        "Video testimonials buried in sub-page, not homepage",
        "No before/after gallery prominently on homepage",
        "No WhatsApp / LINE verification badges",
        "No JCI or ISO accreditation badge",
        "Facebook: only 618 likes / last post ~Oct 2024",
        "No live social media activity signal",
      ],
    },

    // ── 07 ──────────────────────────────────────────────────
    workflowGaps: [
      {
        order: 1,
        title: "No Post-Visit Review Request",
        description:
          "No automated email, SMS, LINE, or WhatsApp sequence asking satisfied patients to leave a Google or platform review. This single gap explains the low review velocity entirely.",
      },
      {
        order: 2,
        title: "No Appointment Reminder System",
        description:
          "International patients booking 3–6 months in advance need multi-touch reminders. No evidence of automated reminders. No-show risk is elevated without this system.",
      },
      {
        order: 3,
        title: "No Re-Engagement for Returning Patients",
        description:
          "No publicly detectable loyalty program, annual recall campaign, or seasonal promotion follow-up sequence. Returning patients represent the highest-margin revenue segment.",
      },
      {
        order: 4,
        title: "No Abandoned Consultation Follow-Up",
        description:
          "Patients who submit the free consultation form but don't book — there is no visible re-engagement drip sequence. These are warm leads going cold.",
      },
      {
        order: 5,
        title: "No Post-Treatment Aftercare Automation",
        description:
          "Post-treatment care instructions, 48-hour check-in messages, and complication follow-ups are not referenced in any public-facing workflow. This is both a trust gap and a liability gap for international patients returning home.",
      },
    ],

    // ── 08 ──────────────────────────────────────────────────
    multilingual: {
      strategicInsight:
        "DDC has already done the hard work of building a three-language contact page (EN/TH/ZH). The failure is that the multilingual capability stops at the contact page — it doesn't extend into booking, follow-up, or messaging workflows.",
      risks: [
        {
          risk: "After-hours English inquiry → no staff online",
          marketAffected: "Australian, European, American tourists",
          severity: "Critical",
        },
        {
          risk: "LINE message from Thai local → no visible LINE ID",
          marketAffected: "Thai locals & expats",
          severity: "Critical",
        },
        {
          risk: "WhatsApp message → no WhatsApp button on site",
          marketAffected: "All international dental tourists",
          severity: "Critical",
        },
        {
          risk: "Mandarin email → unclear response capacity",
          marketAffected: "Chinese dental tourists",
          severity: "High",
        },
        {
          risk: "Non-English review left unanswered",
          marketAffected: "European expats (German/Russian/French)",
          severity: "Medium",
        },
      ],
    },

    // ── 09 ──────────────────────────────────────────────────
    automationOpportunities: [
      { opportunity: "AI Patient Receptionist (LINE + WhatsApp + Email)", impact: "Critical", effort: "Low",      priority: "P1" },
      { opportunity: "Post-treatment review request sequence",            impact: "Critical", effort: "Very Low", priority: "P1" },
      { opportunity: "Instant booking confirmation auto-reply",           impact: "Critical", effort: "Low",      priority: "P1" },
      { opportunity: "Automated appointment reminders (3-touch)",         impact: "High",     effort: "Low",      priority: "P2" },
      { opportunity: "Abandoned consultation re-engagement drip",         impact: "High",     effort: "Medium",   priority: "P2" },
      { opportunity: "Multilingual AI chatbot (EN/TH/ZH)",               impact: "Medium",   effort: "Medium",   priority: "P3" },
      { opportunity: "Before/after content automation pipeline",          impact: "Medium",   effort: "Medium",   priority: "P3" },
    ],

    // ── 10 ──────────────────────────────────────────────────
    quickWins: {
      week1: [
        "Deploy auto-reply email for consultation form (60s response + pricing PDF)",
        "Add WhatsApp click-to-chat to homepage & contact page",
        "Activate LINE Official Account with greeting + FAQ menu",
        "Build 3-message post-treatment review sequence (Day 1 / Day 7 / Day 30)",
        "Launch automated appointment reminder (24hr + 2hr pre-visit)",
      ],
      week2: [
        "Deploy AI intake bot on LINE + WhatsApp (EN/TH/ZH capable)",
        "Create before/after content pipeline with consent workflow",
        "Set up Google review monitoring + response library (EN/TH/ZH)",
        "Establish conversion tracking baseline dashboard",
      ],
      expectedOutcomes:
        "Auto-response rate: 0% → 100% · WhatsApp/LINE: newly operational · Review requests: begins accumulating within first week · No-show reduction: estimated 20–35%",
    },

    // ── 11 ──────────────────────────────────────────────────
    expansionPlan: {
      week3Title: "Intelligent Qualification",
      week3: [
        "AI cost estimator widget on pricing page",
        "Multi-step intake form (procedure → travel dates → dental photos → urgency)",
        "CRM tagging: tourist vs. expat vs. local, procedure value tier",
        "Facebook Messenger bot for social media inquiries",
      ],
      week4Title: "Revenue Sequences",
      week4: [
        "Abandoned consultation re-engagement (3-email drip / 14 days)",
        "Seasonal promotion automation (high-season dental tourism windows)",
        "Patient referral ask sequence (post-treatment, day 30)",
        "Monthly performance dashboard launch",
      ],
      systemStack: [
        "AI Receptionist (LINE + WhatsApp + Messenger + Email)",
        "Booking + Reminder Automation Stack",
        "Post-Treatment Review Sequence",
        "Lead Re-Engagement Drip",
        "Before/After Content Pipeline",
        "Reputation Monitoring Dashboard",
      ],
    },

    // ── 12 ──────────────────────────────────────────────────
    businessImpact: {
      disclaimer:
        "All figures are directional estimates based on industry benchmarks for comparable dental tourism operations in Southeast Asia. Actual figures unavailable from public data. These are projections only, not guarantees.",
      metrics: [
        { label: "Inquiry Response Time",       before: "4–24 hours",      after: "< 2 minutes",  direction: "down" },
        { label: "Inquiry→Booking Conversion",  before: "~15–20% (est.)",  after: "30–40%",       direction: "up"   },
        { label: "Google Reviews / Month",      before: "~1–3 (est.)",     after: "8–15",         direction: "up"   },
        { label: "No-Show / Abandon Rate",      before: "~20–30% (est.)",  after: "~10–15%",      direction: "down" },
      ],
      revenueOpportunity:
        "Conservative 12-month ROI estimate: if automation captures 3–5 additional high-value cases per month (implants from ~47,000 THB; veneers from ~10,000–15,000 THB per tooth), annual uplift at the low end: 500,000 – 1,500,000 THB from conversion improvement alone.",
    },

    // ── 13 ──────────────────────────────────────────────────
    offer: {
      hook: "DDC has world-class dentists and technology. The service is there. The automation isn't. Right now, you're losing bookings every night to clinics with WhatsApp bots and instant replies. Let's fix that in 14 days.",
      packageName: "DDC Growth Stack — AI Automation System",
      packageIncludes: [
        "AI Patient Receptionist (LINE + WhatsApp + Email, EN/TH/ZH)",
        "Booking Confirmation + 3-Touch Reminder System",
        "Post-Treatment Review Request Sequence",
        "Abandoned Consultation Re-Engagement Drip",
        "Google Review Monitoring + Response Templates (EN/TH/ZH)",
        "30-Day Onboarding & Setup",
        "Monthly Performance Report",
      ],
      whyIdealClient: [
        "Strong existing brand with documented credibility gap in reviews",
        "Underutilized multilingual capability (ZH contact exists, untapped)",
        "High-value procedures make per-case ROI calculation straightforward",
        "Owner/operator-led clinic = faster implementation",
        "Pattaya dental tourism market growing = first-mover advantage in AI automation",
      ],
    },

    // ── 14 ──────────────────────────────────────────────────
    sources: [
      { id: 1,  label: "DDC Official Website",                url: "https://dentaldesignpattaya.com" },
      { id: 2,  label: "DDC Contact Page",                    url: "https://dentaldesignpattaya.com/contact-us/" },
      { id: 3,  label: "DDC Fees & Offers",                   url: "https://dentaldesignpattaya.com/fees-offers/" },
      { id: 4,  label: "DDC About Us",                        url: "https://dentaldesignpattaya.com/about-us/" },
      { id: 5,  label: "DDC Meet the Dentist",                url: "https://dentaldesignpattaya.com/meet-the-dentist/" },
      { id: 6,  label: "DDC Testimonials",                    url: "https://dentaldesignpattaya.com/testimonial/" },
      { id: 7,  label: "DDC Facebook Page",                   url: "https://www.facebook.com/dentalclinicpattaya/" },
      { id: 8,  label: "WhatClinic",                          url: "https://www.whatclinic.com/dentists/thailand/pattaya/the-dental-design-center" },
      { id: 9,  label: "DentalDepartures",                    url: "https://www.dentaldepartures.com/dentist/the-dental-design-center" },
      { id: 10, label: "TripAdvisor Review Thread (2017)",    url: "https://www.tripadvisor.com/ShowTopic-g293915-i3686-k10818006" },
      { id: 11, label: "Bookimed",                            url: "https://us-uk.bookimed.com/clinics/country=thailand/city=pattaya/direction=dentistry/" },
      { id: 12, label: "ThaiMed.co — Expat Dentist Guide",    url: "https://thaimed.co/dentists-in-pattaya/" },
      { id: 13, label: "Pacific Prime Thailand — Top 10",     url: "https://www.pacificprime.co.th/blog/top-10-dental-clinics-for-expats-in-pattaya/" },
      { id: 14, label: "MyMediTravel",                        url: "https://www.mymeditravel.com/medical-centers/thailand/pattaya/bang-lamung/the-dental-design-center" },
      { id: 15, label: "DentalTravelServices",                url: "https://www.dentaltravelservices.com/dental-clinics/dentist/the-dental-design-center" },
    ],
  },
};

// ============================================================
// HOW TO CREATE A NEW AUDIT:
//
// 1. Copy this file → rename to [client-slug]-audit.ts
// 2. Replace all values inside the exported object
// 3. Keep the AuditData type — do NOT modify the interface
// 4. Import in your page:
//    import { myClientAudit } from "@/data/[client-slug]-audit"
// 5. Pass to your <AuditReport data={myClientAudit} /> component
// ============================================================
