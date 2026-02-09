// src/app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import WalkMap from "./components/WalkMap";
import type { LatLng } from "./lib/geo";

import { createWalk } from "./lib/saveWalk";
import { uploadMedia, type WalkMedia } from "./lib/uploadMedia";
import { db } from "./lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

import styles from "./page.module.css";

// ✅ NEW: generates the single recap PNG (canvas + static map + collage)
import { generateWalkRecapPng } from "./lib/recapImage";

type WeatherNow = { temperatureF: number; summary: string };

export default function Page() {
  const router = useRouter();

  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [dogs, setDogs] = useState<string>("Corvi and Irma");

  // ✅ NEW: pricing so payday is easy
  const [ratePerHour, setRatePerHour] = useState<number>(40);

  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [distanceMiles, setDistanceMiles] = useState<number>(0);

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [tempF, setTempF] = useState<string>("");
  const [weatherSummary, setWeatherSummary] = useState<string>("");

  const [notes, setNotes] = useState<string>("");

  const [files, setFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);

  // ✅ Derived: how much this walk costs
  const amountDue = useMemo(() => {
    const amt = (Number(durationMinutes) / 60) * Number(ratePerHour || 0);
    return Math.round(amt * 100) / 100;
  }, [durationMinutes, ratePerHour]);

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
      ratePerHour,
      amountDue,
      // NOTE: files + recap image not stored in local draft right now
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
      const walkDateISO = new Date().toISOString();

      // 1️⃣ Create walk document first (no public page required)
      const walkId = await createWalk({
        dogs,
        durationMinutes,
        distanceMiles,
        tempF: tempF ? Number(tempF) : null,
        weatherSummary,
        notes,
        routePoints,
        media: [],
        ratePerHour,
        amountDue,
        walkDate: walkDateISO,
        // recapImageUrl/path added after we generate + upload it
      });

      // 2️⃣ Upload media selected by user (photos/videos)
      const uploadedMedia: WalkMedia[] = [];
      for (const file of files) {
        const media = await uploadMedia(walkId, file);
        uploadedMedia.push(media);
      }

      // 3️⃣ Generate ONE recap PNG (map + stats + collage of photos)
      const photoUrls = uploadedMedia
        .filter((m) => m.type === "image")
        .map((m) => m.url);

      const createdAtLabel = new Date().toLocaleString();

      // Prefer the user-edited temp/weather fields; fallback to fetched weather
      const finalTemp =
        tempF !== "" ? Number(tempF) : weather ? weather.temperatureF : null;
      const finalSummary =
        (weatherSummary || "").trim() || weather?.summary || "";

      const recapBlob = await generateWalkRecapPng({
        dogs,
        durationMinutes,
        distanceMiles,
        weather:
          finalTemp !== null
            ? { temperatureF: finalTemp, summary: finalSummary }
            : null,
        notes,
        createdAtLabel,
        routePoints,
        photoUrls,
        // amountDue,
        walkId,
      });

      const recapFile = new File([recapBlob], `walk-recap-${walkId}.png`, {
        type: "image/png",
      });

      const recapMedia = await uploadMedia(walkId, recapFile);

      // 4️⃣ Update walk doc with media + recap image + pricing fields
      await updateDoc(doc(db, "walks", walkId), {
        media: uploadedMedia,
        recapImageUrl: recapMedia.url,
        recapImagePath: recapMedia.path,
        ratePerHour,
        amountDue,
        walkDate: walkDateISO,
      });

      // ✅ For now: just open the recap image (single deliverable)
      window.open(recapMedia.url, "_blank", "noopener,noreferrer");

      // You can route wherever you want later (ledger page, etc.)
      router.push(`/`);
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
            Draw route → auto distance • Auto weather • Upload media • Generate
            1 recap image
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
            min={0}
          />

          {/* ✅ NEW: Rate */}
          <label style={labelStyle}>Rate ($/hour)</label>
          <input
            value={ratePerHour}
            onChange={(e) => setRatePerHour(Number(e.target.value))}
            style={inputStyle}
            type="number"
            min={0}
            step={1}
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
            <div>Rate: ${ratePerHour}/hr</div>
            <div>
              <b>Amount Due: ${amountDue.toFixed(2)}</b>
            </div>
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
