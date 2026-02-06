"use client";

import "leaflet/dist/leaflet.css";
import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import * as L from "leaflet";

type LatLng = { lat: number; lng: number };

export default function WalkViewerMap({ points }: { points: LatLng[] }) {
  const hasRoute = Array.isArray(points) && points.length >= 2;

  // React-Leaflet expects LatLngExpression: [lat,lng] is the simplest.
  const center: LatLngExpression = useMemo(() => {
    if (!points || points.length === 0) return [38.9, -77.0]; // sensible default
    return [points[0].lat, points[0].lng];
  }, [points]);

  const poly: LatLngExpression[] = useMemo(() => {
    return (points || []).map((p) => [p.lat, p.lng] as LatLngExpression);
  }, [points]);

  // Fix Leaflet marker icon URLs (only run in browser)
  useEffect(() => {
    // @ts-expect-error - Leaflet internal private field
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  if (!hasRoute) {
    return <div style={{ opacity: 0.7 }}>No route recorded.</div>;
  }

  return (
    <div style={{ height: 360, width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={poly} />
      </MapContainer>
    </div>
  );
}
