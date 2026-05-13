"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Artifact = { label: string; href: string };

export type AuditReportRow = {
  id: string;
  vertical: string;
  title: string;
  subject: string;
  slug: string | null;
  status: string;
  primaryHref: string;
  updatedAt: string | null;
  artifacts: Artifact[];
};

function apiUrl(path: string) {
  if (typeof window !== "undefined" && typeof window.soApiUrl === "function") {
    return window.soApiUrl(path);
  }
  return path;
}

function apiCred(): RequestCredentials {
  if (typeof window !== "undefined" && typeof window.soApiCredentials === "function") {
    return window.soApiCredentials();
  }
  return "same-origin";
}

function readAdminJwt() {
  try {
    return localStorage.getItem("so_admin_jwt") || sessionStorage.getItem("so_admin_jwt") || "";
  } catch {
    return "";
  }
}

export function OperatorReportsClient() {
  const [rows, setRows] = useState<AuditReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"loading" | "unauth" | null>("loading");

  useEffect(() => {
    const token = readAdminJwt();
    if (!token) {
      setGate("unauth");
      setRows(null);
      return;
    }
    setGate(null);
    let cancelled = false;
    fetch(apiUrl("/api/admin/audit-reports"), {
      method: "GET",
      credentials: apiCred(),
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const j = (await r.json()) as { ok?: boolean; error?: string; reports?: AuditReportRow[] };
        if (r.status === 401) {
          setGate("unauth");
          return;
        }
        if (!r.ok || !j.ok) {
          throw new Error(j.error || "Request failed");
        }
        if (!cancelled) {
          setRows(Array.isArray(j.reports) ? j.reports : []);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load reports.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate === "unauth") {
    return (
      <p className="tf-admin-muted">
        Sign in to the{" "}
        <Link href="/admin/users">operator console</Link> first. This page uses the same admin JWT (
        <code className="mono">so_admin_jwt</code>) as the console.
      </p>
    );
  }

  if (error) {
    return (
      <p className="tf-admin-muted" style={{ color: "var(--danger, #c44)" }}>
        {error}
      </p>
    );
  }

  if (rows === null) {
    return <p className="tf-admin-muted">Loading…</p>;
  }

  if (!rows.length) {
    return (
      <div className="tf-admin-muted">
        <p>No reports in the catalog yet.</p>
        <p>
          Add entries to <code className="mono">public/reports/index.json</code>, add slug JSON under{" "}
          <code className="mono">public/clinics/data/</code>, or assign a <code className="mono">reportSlug</code>{" "}
          when creating portal users. New rows appear here after the next API load.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tf-users-table">
        <thead>
          <tr>
            <th scope="col">Updated</th>
            <th scope="col">Vertical</th>
            <th scope="col">Title</th>
            <th scope="col">Subject</th>
            <th scope="col">Status</th>
            <th scope="col">View</th>
            <th scope="col">Artifacts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="mono">
                {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
              </td>
              <td>{row.vertical}</td>
              <td>{row.title}</td>
              <td>{row.subject}</td>
              <td>{row.status}</td>
              <td>
                <a href={row.primaryHref}>Open</a>
              </td>
              <td>
                {row.artifacts?.length ? (
                  row.artifacts.map((a, i) => (
                    <span key={a.href}>
                      {i > 0 ? " · " : null}
                      <a href={a.href}>{a.label}</a>
                    </span>
                  ))
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
