// src/app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import WalkMap from "./components/WalkMap";
import { LatLng } from "./lib/geo";

import { createWalk } from "./lib/saveWalk";
import { uploadMedia } from "./lib/uploadMedia";
import { db } from "./lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

import styles from "./page.module.css";

type WeatherNow = { temperatureF: number; summary: string };

export default function Page() {
  const router = useRouter();

  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [dogs, setDogs] = useState<string>("Corvi and Irma");

  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [distanceMiles, setDistanceMiles] = useState<number>(0);

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [tempF, setTempF] = useState<string>("");
  const [weatherSummary, setWeatherSummary] = useState<string>("");

  const [notes, setNotes] = useState<string>("");

  const [files, setFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Fetch weather based on current location once
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        const r = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
        if (!r.ok) return;

        const data = (await r.json()) as WeatherNow;
        setWeather(data);
        setTempF(String(data.temperatureF));
        setWeatherSummary(data.summary);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  function saveDraft() {
    const report = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      dogs,
      durationMinutes,
      distanceMiles,
      tempF: tempF ? Number(tempF) : null,
      weatherSummary,
      notes,
      routePoints,
    };

    const existing = JSON.parse(localStorage.getItem("walkReports") || "[]");
    existing.unshift(report);
    localStorage.setItem("walkReports", JSON.stringify(existing));

    alert("Saved draft locally on this device.");
  }

  async function publishWalk() {
    if (publishing) return;
    setPublishing(true);

    try {
      // 1) Create walk document
      const walkId = await createWalk({
        dogs,
        durationMinutes,
        distanceMiles,
        tempF: tempF ? Number(tempF) : null,
        weatherSummary,
        notes,
        routePoints,
        media: [],
        // IMPORTANT: make sure you are storing amountDue in the doc elsewhere
        // (your dashboard will sum it). If you already do, ignore this comment.
      });

      // 2) Upload media
      const uploadedMedia = [];
      for (const file of files) {
        const media = await uploadMedia(walkId, file);
        uploadedMedia.push(media);
      }

      // 3) Update document with media URLs
      if (uploadedMedia.length > 0) {
        await updateDoc(doc(db, "walks", walkId), {
          media: uploadedMedia,
        });
      }

      // 4) Go to dashboard (your internal view)
      router.push(`/dashboard?new=${walkId}`);
    } catch (err) {
      console.error(err);
      alert("Failed to publish walk. Check console.");
      setPublishing(false);
    }
  }

  return (
    <div className={styles.pageWrap}>
      <header className={styles.header}>
        <div>
          <div className={styles.headerLeftTitle}>Dog Walk Recap</div>
          <div className={styles.headerLeftSub}>
            Draw route → auto distance • Auto weather • Upload media • Save +
            track
          </div>
        </div>

        <div className={styles.headerBtns}>
          <button onClick={saveDraft} style={secondaryBtn}>
            Save Draft
          </button>
          <button
            onClick={publishWalk}
            style={primaryBtn}
            disabled={publishing}
          >
            {publishing ? "Publishing…" : "Publish Walk"}
          </button>
        </div>
      </header>

      <div className={styles.bodyGrid}>
        {/* Left panel */}
        <div className={styles.leftPanel}>
          <label style={labelStyle}>Dogs</label>
          <input
            value={dogs}
            onChange={(e) => setDogs(e.target.value)}
            style={inputStyle}
          />

          <label style={labelStyle}>Duration (minutes)</label>
          <input
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            style={inputStyle}
            type="number"
          />

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Temp (°F)</label>
              <input
                value={tempF}
                onChange={(e) => setTempF(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Weather</label>
              <input
                value={weatherSummary}
                onChange={(e) => setWeatherSummary(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, height: 120 }}
          />

          <label style={labelStyle}>Photos / Video</label>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />

          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 12,
            }}
          >
            <b>Preview</b>
            <div>Duration: {durationMinutes} min</div>
            <div>Distance: {distanceMiles} miles</div>
            <div>Temp: {tempF || "—"}°F</div>
            <div>Weather: {weatherSummary || "—"}</div>
            <div>Media files: {files.length}</div>
          </div>
        </div>

        {/* Map */}
        <div className={styles.mapPanel}>
          <WalkMap
            onRouteChange={(pts, miles) => {
              setRoutePoints(pts);
              setDistanceMiles(miles);
            }}
          />
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  marginTop: 12,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "black",
  color: "white",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "white",
  border: "1px solid rgba(0,0,0,0.2)",
  fontWeight: 700,
};
