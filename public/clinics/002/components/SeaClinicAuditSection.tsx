import React from "react";
import { seaClinicAuditData } from "./seaClinicAuditData";

type Series = {
  label: string;
  color: string;
  values: number[];
  interpretation: string;
};

function LineChart({ stages, series }: { stages: string[]; series: Series[] }) {
  const width = 920;
  const height = 360;
  const pad = { left: 54, right: 24, top: 28, bottom: 54 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i * chartW) / (stages.length - 1);
  const y = (v: number) => pad.top + chartH - (v / 100) * chartH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" role="img">
      {[0, 20, 40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={pad.left} y1={y(v)} x2={width - pad.right} y2={y(v)} stroke="#E5E7EB" strokeWidth="1" />
          <text x={pad.left - 14} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
            {v}
          </text>
        </g>
      ))}

      {stages.map((stage, i) => (
        <text key={stage} x={x(i)} y={height - 18} textAnchor="middle" className="fill-slate-600 text-[12px]">
          {stage}
        </text>
      ))}

      {series.map((s) => {
        const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        return (
          <g key={s.label}>
            <polyline points={points} fill="none" stroke={s.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle key={`${s.label}-${i}`} cx={x(i)} cy={y(v)} r="5" fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function SeaClinicAuditSection() {
  const { profile, scores, opportunities, findings } = seaClinicAuditData;

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 text-slate-950">
      <div className="mb-10 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-700">
          Public data automation audit · Pattaya clinics
        </p>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
          {profile.name} already has reputation. The next growth layer is structured automation.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
          A public-footprint audit showing how WhatsApp, LINE, reviews, treatment demand and competitor signals can become a tracked clinic growth system.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm text-slate-500">Clinic type</p>
          <p className="mt-2 text-xl font-semibold">{profile.market}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm text-slate-500">Primary public channels</p>
          <p className="mt-2 text-xl font-semibold">Website · WhatsApp · LINE · Reviews · Social</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm text-slate-500">Main business risk</p>
          <p className="mt-2 text-xl font-semibold">Untracked inquiries after first message</p>
        </div>
      </div>

      <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">Colored audit lines</p>
            <h2 className="mt-2 text-3xl font-semibold">Where automation creates the most value</h2>
          </div>
          <p className="max-w-md text-sm text-slate-500">
            Scores are inferred from public data, not internal clinic analytics. Refresh with live APIs before a client pitch.
          </p>
        </div>

        <LineChart stages={scores.stages} series={scores.series} />

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {scores.series.map((s: Series) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                <p className="font-semibold">{s.label}</p>
              </div>
              <p className="text-sm leading-6 text-slate-600">{s.interpretation}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Key findings</p>
          <ul className="mt-5 space-y-4">
            {findings.map((item: string) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-slate-200">
                <span className="mt-2 h-2 w-2 flex-none rounded-full bg-indigo-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          {opportunities.slice(0, 4).map((op: any) => (
            <div key={op.name} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xl font-semibold">{op.name}</h3>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  Priority {op.priority}
                </span>
              </div>
              <p className="text-sm leading-6 text-slate-600">{op.business_value}</p>
              <p className="mt-3 text-sm font-medium text-slate-900">{op.site_copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
