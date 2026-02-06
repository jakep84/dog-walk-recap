"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LatLng,
  metersToMiles,
  routeDistanceMeters,
  thinPoints,
} from "../lib/geo";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type Props = {
  onRouteChange?: (points: LatLng[], miles: number) => void;
};

export default function WalkMap({ onRouteChange }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const onRouteChangeRef = useRef<Props["onRouteChange"]>(onRouteChange);
  useEffect(() => {
    onRouteChangeRef.current = onRouteChange;
  }, [onRouteChange]);

  const [locError, setLocError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [miles, setMiles] = useState(0);

  const geojson = useMemo(() => {
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [p.lng, p.lat]),
      },
    } as const;
  }, [points]);

  // Initialize map + center on current location
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapboxgl.accessToken) {
      setLocError("Missing NEXT_PUBLIC_MAPBOX_TOKEN");
      return;
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-77.0365, 38.8977], // fallback: DC
      zoom: 15,
    });

    mapRef.current = map;
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );

    if (!navigator.geolocation) {
      setLocError("Geolocation not supported on this device.");
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.flyTo({
            center: [longitude, latitude],
            zoom: 16,
            essential: true,
          });

          new mapboxgl.Marker({ color: "#1d4ed8" })
            .setLngLat([longitude, latitude])
            .addTo(map);
        },
        (err) => {
          setLocError(err.message || "Location permission denied.");
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: geojson as any,
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map route when points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(geojson as any);
  }, [geojson]);

  // Recompute distance when points change (NO dependency on onRouteChange)
  useEffect(() => {
    const meters = routeDistanceMeters(points);
    const mi = metersToMiles(meters);
    const rounded = Math.round(mi * 100) / 100;

    setMiles(rounded);
    onRouteChangeRef.current?.(points, rounded);
  }, [points]);

  function clearRoute() {
    setPoints([]);
  }

  function undoLast() {
    setPoints((prev) => prev.slice(0, Math.max(0, prev.length - 1)));
  }

  // Drawing logic
  function handlePointerDown(e: React.PointerEvent) {
    if (!mapRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    setIsDrawing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const map = mapRef.current;
    const rect = (map.getContainer() as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ll = map.unproject([x, y]);
    setPoints((prev) => thinPoints([...prev, { lat: ll.lat, lng: ll.lng }], 2));
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDrawing || !mapRef.current) return;

    const map = mapRef.current;
    const rect = (map.getContainer() as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ll = map.unproject([x, y]);
    setPoints((prev) => thinPoints([...prev, { lat: ll.lat, lng: ll.lng }], 2));
  }

  function handlePointerUp(e: React.PointerEvent) {
    setIsDrawing(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}
    >
      <div
        style={{
          padding: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 700 }}>Route Drawer</div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            Distance: <b>{miles}</b> mi {isDrawing ? "(drawing…)" : ""}
          </div>
          {locError ? (
            <div style={{ fontSize: 12, color: "#b91c1c" }}>{locError}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={undoLast}
            disabled={points.length === 0}
            style={btnStyle}
          >
            Undo
          </button>
          <button
            onClick={clearRoute}
            disabled={points.length === 0}
            style={btnStyle}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={mapContainerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      />
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white",
  fontWeight: 600,
};
