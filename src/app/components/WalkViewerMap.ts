// src/app/components/WalkViewerMap.tsx
"use client";

import React, { useMemo } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type LatLng = { lat: number; lng: number };

export default function WalkViewerMap({ routePoints }: { routePoints: LatLng[] }) {
  const center = useMemo(() => {
    if (routePoints?.length) return [routePoints[0].lat, routePoints[0].lng] as [number, number];
    // fallback center (won't matter much)
    return [38.75, -77.10] as [number, number];
  }, [routePoints]);

  const line = useMemo(() => {
    return (routePoints || []).map((p) => [p.lat, p.lng] as [number, number]);
  }, [routePoints]);

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {line.length >= 2 ? <Polyline positions={line} /> : null}
    </MapContainer>
  );
}
