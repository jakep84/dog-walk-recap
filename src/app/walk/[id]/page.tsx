"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { WalkMedia } from "../../lib/uploadMedia";
import dynamic from "next/dynamic";
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
  createdAt?: any; // Firestore Timestamp
};

export default function WalkPublicPage() {
  const params = useParams();
  const walkId = (params?.id as string) || "";

  const [walk, setWalk] = useState<WalkDoc | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);

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
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied!");
    } catch {
      alert("Could not copy link on this device.");
    }
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
            <div className="walkTitle">{walk.dogs}</div>
            <div className="walkSub">
              {createdLabel ? `Walked: ${createdLabel}` : "Walk Recap"}
            </div>
          </div>

          <button onClick={copyLink} className="copyBtn">
            Copy Link
          </button>
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
              {Number(walk.distanceMiles || 0).toFixed(2)} mi
            </div>
          </div>

          <div className="statBox">
            <div className="statLabel">Temp</div>
            <div className="statValue">
              {walk.tempF === null || walk.tempF === undefined
                ? "—"
                : `${walk.tempF}°F`}
            </div>
          </div>

          <div className="statBox">
            <div className="statLabel">Weather</div>
            <div className="statValue">{walk.weatherSummary || "—"}</div>
          </div>
        </div>

        {/* Notes */}
        {walk.notes ? (
          <div className="section">
            <div className="sectionTitle">Notes</div>
            <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
              {walk.notes}
            </div>
          </div>
        ) : null}

        {/* Route */}
        <div className="section">
          <div className="sectionTitle">Route</div>

          {walk.routePoints?.length >= 2 ? (
            <div className="leafletContainerFix">
              <WalkViewerMap points={walk.routePoints} />
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>No route recorded for this walk.</div>
          )}
        </div>

        {/* Media */}
        <div className="section">
          <div className="sectionTitle">Photos & Videos</div>

          {walk.media.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No media uploaded.</div>
          ) : (
            <div className="mediaGrid">
              {walk.media.map((m) => (
                <div key={m.url} className="mediaItem">
                  {m.type === "video" ? (
                    <video controls src={m.url} />
                  ) : (
                    <img src={m.url} alt={m.name || "Walk photo"} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            opacity: 0.55,
            fontSize: 12,
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          Dog Walk Recap
        </div>
      </div>
    </div>
  );
}
