"use client";

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

export function PlacesLeadsNavPill() {
  return (
    <button
      type="button"
      className="tf-admin-nav__pill"
      aria-label="Open Google Places lead collector in a new tab"
      onClick={(ev) => {
        ev.preventDefault();
        const adminToken = readAdminJwt();
        if (!adminToken) {
          window.location.href = "/admin/users";
          return;
        }
        fetch(apiUrl("/api/admin/places-page-token"), {
          method: "POST",
          credentials: apiCred(),
          cache: "no-store",
          headers: { Authorization: `Bearer ${adminToken}` },
        })
          .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
          .then((pack) => {
            if (!pack.ok || !pack.j?.page_token) {
              const msg =
                (pack.j && (pack.j.error || pack.j.message)) ||
                "Could not open Places tool. Sign in again.";
              window.alert(String(msg));
              return;
            }
            const origin = window.location.origin || "";
            const url = `${origin}/operator/places-leads.html?t=${encodeURIComponent(pack.j.page_token)}`;
            window.open(url, "_blank", "noopener,noreferrer");
          })
          .catch(() => {
            window.alert("Network error opening Places tool.");
          });
      }}
    >
      Places leads
    </button>
  );
}
