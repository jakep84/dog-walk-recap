"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { WalkMedia } from "../../lib/uploadMedia";
import dynamic from "next/dynamic";
import "./components/walk-public.css";
import { useRouter, useSearchParams } from "next/navigation";

const WalkViewerMap = dynamic(() => import("./components/WalkViewerMap"), {
  ssr: false,
});

type LatLng = { lat: number; lng: number };

type WalkDoc = {
  dogs: string;
  durationMinutes: number;
  distanceMiles: number;
  tempF?: number | null;
  weatherSummary?: string;
  notes?: string;
  routePoints: LatLng[];
  media: WalkMedia[];
  createdAt?: any;
};

function computeEarned(durationMinutes: number): number {
  // Your rule: $20 per 30 minutes => 30=$20, 60=$40
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  const blocks = Math.round(durationMinutes / 30);
  return blocks * 20;
}

export default function WalkPublicClient({ walkId }: { walkId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const isAdmin = search?.get("admin") === "1";

  const [walk, setWalk] = useState<WalkDoc | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!walkId) return;
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const snap = await getDoc(doc(db, "walks", walkId));
        if (!snap.exists()) throw new Error("Walk not found.");

        const data = snap.data() as WalkDoc;
        if (!alive) return;

        setWalk({
          ...data,
          routePoints: Array.isArray(data.routePoints) ? data.routePoints : [],
          media: Array.isArray(data.media) ? data.media : [],
        });
      } catch (e: any) {
        if (alive) setErr(e?.message || "Failed to load walk.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [walkId]);

  const createdLabel = useMemo(() => {
    if (!walk?.createdAt) return "";
    try {
      if (typeof walk.createdAt?.toDate === "function") {
        return walk.createdAt.toDate().toLocaleString();
      }
    } catch {}
    return "";
  }, [walk?.createdAt]);

  const earned = useMemo(() => {
    if (!walk) return 0;
    return computeEarned(walk.durationMinutes);
  }, [walk]);

  const photoUrls = useMemo(() => {
    const imgs = (walk?.media || [])
      .filter((m) => m.type === "image" && typeof m.url === "string")
      .map((m) => m.url);
    return imgs;
  }, [walk?.media]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied!");
    } catch {
      alert("Could not copy link on this device.");
    }
  }

  function openPreview() {
    setPreviewLoaded(false);
    setPreviewError("");
    setShowPreview(true);
  }

  function closePreview() {
    setShowPreview(false);
  }

  // IMPORTANT: absolute-from-root path so it doesn't become /walk/[id]/walk/[id]/...
  const previewSrc = useMemo(() => {
    if (!walkId) return "";
    return `/walk/${walkId}/recap-image`;
  }, [walkId]);

  if (!walkId) return <div style={wrap}>Loading…</div>;
  if (loading) return <div style={wrap}>Loading…</div>;
  if (err) return <div style={wrap}>Error: {err}</div>;
  if (!walk) return <div style={wrap}>No data.</div>;

  return (
    <div style={wrap}>
      {/* Top bar */}
      <div style={topBar}>
        <div>
          <div style={title}>{walk.dogs}</div>
          <div style={sub}>
            {createdLabel ? `${createdLabel} • ` : ""}
            Walk ID: {walkId}
          </div>
        </div>

        <div style={btnRow}>
          <button style={btn} onClick={() => router.push("/dashboard")}>
            ← Dashboard
          </button>
          <button style={btn} onClick={copyLink}>
            Copy Link
          </button>
          <button style={btnPrimary} onClick={openPreview}>
            Show Walk Preview
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div style={statsGrid}>
        <Stat label="Duration" value={`${walk.durationMinutes} min`} />
        <Stat label="Distance" value={`${walk.distanceMiles.toFixed(2)} mi`} />
        <Stat
          label="Temp"
          value={walk.tempF != null ? `${walk.tempF}°F` : "—"}
        />
        <Stat label="Weather" value={walk.weatherSummary || "—"} />
        {isAdmin ? (
          <Stat label="Earned" value={`$${earned.toFixed(2)}`} />
        ) : null}
      </div>

      {/* Route */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Route</div>
        <WalkViewerMap points={walk.routePoints || []} />
      </div>

      {/* Notes */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Notes</div>
        <div style={{ opacity: 0.9, fontSize: 16 }}>
          {(walk.notes || "").trim() || "—"}
        </div>
      </div>

      {/* Media */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Media</div>
        {photoUrls.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No media uploaded.</div>
        ) : (
          <div style={mediaGrid}>
            {photoUrls.map((url, idx) => (
              <div key={idx} style={mediaItem}>
                {/* plain img avoids next/image host config issues */}
                <img
                  src={url}
                  alt={`Photo ${idx + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {showPreview ? (
        <div style={modalOverlay} onClick={closePreview}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                Walk Recap Preview
              </div>
              <button style={btnPrimary} onClick={closePreview}>
                Close
              </button>
            </div>

            <div style={modalBody}>
              {!previewLoaded && !previewError ? (
                <div style={{ opacity: 0.8, padding: 12 }}>
                  Building preview…
                </div>
              ) : null}

              {previewError ? (
                <div style={{ color: "#fca5a5", padding: 12 }}>
                  Preview failed to load: {previewError}
                  <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
                    Tried: {previewSrc}
                  </div>
                </div>
              ) : null}

              <img
                src={previewSrc}
                alt="Walk recap preview"
                onLoad={() => setPreviewLoaded(true)}
                onError={() =>
                  setPreviewError(
                    "Image request failed (route missing or returned non-image).",
                  )
                }
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: 16,
                  display: previewError ? "none" : "block",
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ opacity: 0.7, fontSize: 13, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 32, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0c",
  color: "white",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  lineHeight: 1.05,
};

const sub: React.CSSProperties = {
  opacity: 0.75,
  fontSize: 13,
  marginTop: 6,
};

const btnRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const btn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.92)",
  color: "black",
  fontWeight: 900,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "white",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
};

const sectionCard: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const mediaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const mediaItem: React.CSSProperties = {
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.2)",
  aspectRatio: "1 / 1",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
  zIndex: 50,
};

const modalCard: React.CSSProperties = {
  width: "min(980px, 100%)",
  maxHeight: "92vh",
  overflow: "auto",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#0b0b0c",
  boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: 14,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  position: "sticky",
  top: 0,
  background: "#0b0b0c",
  zIndex: 2,
};

const modalBody: React.CSSProperties = {
  padding: 14,
};
