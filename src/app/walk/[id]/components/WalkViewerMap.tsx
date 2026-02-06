"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type LatLng = { lat: number; lng: number };

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length < 2) return;

    const bounds = L.latLngBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, points]);

  return null;
}

export default function WalkViewerMap({ points }: { points: LatLng[] }) {
  const center = useMemo(() => {
    if (!points || points.length === 0)
      return [38.8895, -77.0353] as [number, number]; // fallback (DC)
    const mid = points[Math.floor(points.length / 2)];
    return [mid.lat, mid.lng] as [number, number];
  }, [points]);

  const path = useMemo(() => {
    return (points || []).map((p) => [p.lat, p.lng] as [number, number]);
  }, [points]);

  return (
    <div style={{ height: 320, borderRadius: 14, overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {path.length >= 2 ? (
          <>
            <Polyline positions={path} />
            <FitBounds points={points} />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}
