"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { WalkMedia } from "../../lib/uploadMedia";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import "./components/walk-public.css";

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

export default function WalkPublicClient({ walkId }: { walkId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";

  const [walk, setWalk] = useState<WalkDoc | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  async function copyLink() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("admin");
      await navigator.clipboard.writeText(u.toString());
      alert("Link copied!");
    } catch {
      alert("Could not copy link on this device.");
    }
  }

  async function showPreview() {
    if (!walkId || previewBusy) return;
    setPreviewBusy(true);

    try {
      // ✅ correct route: /walk/[id]/recap-image
      const r = await fetch(`/walk/${walkId}/recap-image`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        console.error("Preview route failed:", r.status, txt);
        throw new Error(`Preview failed (${r.status})`);
      }

      const blob = await r.blob();

      // Replace any existing object URL
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (e: any) {
      console.error(e);
      alert("Could not generate preview image.");
    } finally {
      setPreviewBusy(false);
    }
  }

  function closePreview() {
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  if (!walkId || loading) return <div style={wrap}>Loading…</div>;
  if (err) return <div style={wrap}>Error: {err}</div>;
  if (!walk) return <div style={wrap}>No data.</div>;

  return (
    <div style={wrap}>
      <div className="walkWrap">
        <div className="walkCard">
          {/* Header */}
          <div className="walkHeader">
            <div>
              <div className="walkTitle">{walk.dogs}</div>
              <div className="walkSub">
                {createdLabel} • Walk ID: {walkId}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isAdmin && (
                <button
                  className="copyBtn"
                  onClick={() => router.push("/dashboard")}
                >
                  ← Dashboard
                </button>
              )}

              <button className="copyBtn" onClick={copyLink}>
                Copy Link
              </button>

              {isAdmin && (
                <button
                  className="copyBtn"
                  onClick={showPreview}
                  disabled={previewBusy}
                  style={{ background: previewBusy ? "#d6d6d6" : "white" }}
                >
                  {previewBusy ? "Building…" : "Show Walk Preview"}
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="statsRow">
            <div className="statBox">
              <div className="statLabel">Duration</div>
              <div className="statValue">{walk.durationMinutes} min</div>
            </div>

            <div className="statBox">
              <div className="statLabel">Distance</div>
              <div className="statValue">
                {walk.distanceMiles.toFixed(2)} mi
              </div>
            </div>

            <div className="statBox">
              <div className="statLabel">Temp</div>
              <div className="statValue">
                {walk.tempF != null ? `${walk.tempF}°F` : "—"}
              </div>
            </div>

            <div className="statBox">
              <div className="statLabel">Weather</div>
              <div className="statValue">{walk.weatherSummary || "—"}</div>
            </div>
          </div>

          {/* Route */}
          <div className="section">
            <div className="sectionTitle">Route</div>
            <div className="leafletContainerFix">
              <WalkViewerMap points={walk.routePoints} />
            </div>
          </div>

          {/* Notes */}
          <div className="section">
            <div className="sectionTitle">Notes</div>
            <div style={{ opacity: 0.85, whiteSpace: "pre-wrap" }}>
              {(walk.notes || "").trim() || "—"}
            </div>
          </div>

          {/* Media */}
          {walk.media?.length ? (
            <div className="section">
              <div className="sectionTitle">Media</div>
              <div className="mediaGrid">
                {walk.media.map((m, i) => (
                  <div key={`${m.path || m.url}-${i}`} className="mediaItem">
                    {m.type === "video" ? (
                      <video src={m.url} controls playsInline />
                    ) : (
                      <img src={m.url} alt={m.name || "photo"} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Preview modal */}
          {isAdmin && previewUrl ? (
            <div
              onClick={closePreview}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 50,
                padding: 16,
              }}
            >
              <img
                src={previewUrl}
                alt="Walk recap preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  borderRadius: 16,
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0c",
  color: "white",
  padding: 16,
};
