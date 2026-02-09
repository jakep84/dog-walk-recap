// src/app/walk/[id]/WalkPublicClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { WalkMedia } from "../../lib/uploadMedia";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { generateWalkRecapPng } from "../../lib/recapImage";
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
  amountDue?: number | null; // internal-only (not shown to client)
};

function fmtDateTime(d: Date) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WalkPublicClient({ walkId }: { walkId: string }) {
  const search = useSearchParams();
  const isAdmin = search.get("admin") === "1";

  const [walk, setWalk] = useState<WalkDoc | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewBusy, setPreviewBusy] = useState(false);

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
        return fmtDateTime(walk.createdAt.toDate());
      }
    } catch {}
    return "";
  }, [walk?.createdAt]);

  const imageUrls = useMemo(() => {
    const media = walk?.media || [];
    return media
      .filter((m) => m?.type === "image" && typeof m?.url === "string")
      .map((m) => m.url);
  }, [walk?.media]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        window.location.href.replace("?admin=1", ""),
      );
      alert("Link copied!");
    } catch {
      alert("Could not copy link on this device.");
    }
  }

  async function showPreview() {
    if (!walk || previewBusy) return;
    setPreviewBusy(true);

    try {
      // revoke old url if any
      if (previewUrl) URL.revokeObjectURL(previewUrl);

      const blob = await generateWalkRecapPng({
        dogs: walk.dogs,
        durationMinutes: walk.durationMinutes,
        distanceMiles: walk.distanceMiles,
        weather: {
          temperatureF: walk.tempF ?? null,
          summary: walk.weatherSummary || "",
        },
        notes: walk.notes || "",
        createdAtLabel: createdLabel || "",
        routePoints: walk.routePoints || [],
        photoUrls: imageUrls,
        walkId,
      });

      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to generate preview image.");
    } finally {
      setPreviewBusy(false);
    }
  }

  function closePreview() {
    setPreviewOpen(false);
  }

  if (!walkId) return <div className="walkWrap">Loading…</div>;
  if (loading) return <div className="walkWrap">Loading…</div>;
  if (err) return <div className="walkWrap">Error: {err}</div>;
  if (!walk) return <div className="walkWrap">No data.</div>;

  return (
    <div className="walkWrap">
      <div className="walkCard">
        {/* Header */}
        <div className="walkHeader">
          <div>
            <div className="walkTitle">{walk.dogs || "Dog Walk"}</div>
            <div className="walkSub">
              {createdLabel ? createdLabel : ""} {createdLabel ? "• " : ""}
              Walk ID: {walkId}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="copyBtn" onClick={copyLink}>
              Copy Link
            </button>

            {isAdmin ? (
              <button
                className="copyBtn"
                onClick={showPreview}
                disabled={previewBusy}
                style={{ background: previewBusy ? "#d6d6d6" : "white" }}
              >
                {previewBusy ? "Building…" : "Show Walk Preview"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Stats */}
        <div className="statsRow">
          <div className="statBox">
            <div className="statLabel">Duration</div>
            <div className="statValue">{walk.durationMinutes ?? 0} min</div>
          </div>

          <div className="statBox">
            <div className="statLabel">Distance</div>
            <div className="statValue">
              {(walk.distanceMiles ?? 0).toFixed(2)} mi
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

          {/* Admin-only internal money display (NOT client-facing) */}
          {isAdmin ? (
            <div className="statBox">
              <div className="statLabel">Earned</div>
              <div className="statValue">
                {typeof walk.amountDue === "number"
                  ? `$${walk.amountDue.toFixed(2)}`
                  : "—"}
              </div>
            </div>
          ) : null}
        </div>

        {/* Route */}
        <div className="section">
          <div className="sectionTitle">Route</div>
          <div className="leafletContainerFix">
            <WalkViewerMap points={walk.routePoints || []} />
          </div>
        </div>

        {/* Notes */}
        <div className="section">
          <div className="sectionTitle">Notes</div>
          <div style={{ opacity: 0.9, lineHeight: 1.4 }}>
            {(walk.notes || "").trim() || "—"}
          </div>
        </div>

        {/* Media */}
        <div className="section">
          <div className="sectionTitle">Media</div>

          {walk.media?.length ? (
            <div className="mediaGrid">
              {walk.media.map((m, idx) => {
                const key = `${m.path || m.url}-${idx}`;
                if (m.type === "video") {
                  return (
                    <div key={key} className="mediaItem">
                      <video src={m.url} controls playsInline />
                    </div>
                  );
                }
                return (
                  <div key={key} className="mediaItem">
                    <img src={m.url} alt={m.name || "photo"} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ opacity: 0.75 }}>No media uploaded.</div>
          )}
        </div>
      </div>

      {/* Preview Modal (admin only) */}
      {isAdmin && previewOpen ? (
        <div
          onClick={closePreview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 14,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "92vh",
              borderRadius: 16,
              overflow: "hidden",
              background: "#111",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div
              style={{
                padding: 10,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Walk Preview</div>
              <button className="copyBtn" onClick={closePreview}>
                Close
              </button>
            </div>

            <div style={{ padding: 10, overflow: "auto", maxHeight: "86vh" }}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Walk recap"
                  style={{ width: "100%", height: "auto", borderRadius: 12 }}
                />
              ) : (
                <div style={{ opacity: 0.75 }}>No preview.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
