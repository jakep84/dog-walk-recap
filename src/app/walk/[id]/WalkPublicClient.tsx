"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { WalkMedia } from "../../lib/uploadMedia";
import dynamic from "next/dynamic";
import "./walk-public.css";

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

  if (!walkId) return <div style={wrap}>Loading…</div>;
  if (loading) return <div style={wrap}>Loading…</div>;
  if (err) return <div style={wrap}>Error: {err}</div>;
  if (!walk) return <div style={wrap}>No data.</div>;

  return (
    <div style={wrap}>
      {/* ...keep the rest of your existing UI exactly as-is... */}
      {/* (no changes needed other than removing useParams) */}
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
