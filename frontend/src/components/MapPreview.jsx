import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * A → B route preview.
 * Primary provider: Apple MapKit JS when REACT_APP_APPLE_MAPS_TOKEN is set.
 * Fallback provider: OpenStreetMap/CARTO so Codespaces/demo never breaks without an Apple token.
 */
const ICON_BASE = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images";
const LOGAN = { lat: 42.3656, lng: -71.0096 };
const APPLE_MAPS_TOKEN = process.env.REACT_APP_APPLE_MAPS_TOKEN || "";

const makeIcon = (color, label) =>
  L.divIcon({
    className: "atalay-pin",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    html: `<div style="position:relative;width:28px;height:28px;"><div style="width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #f4ecbf;box-shadow:0 3px 10px rgba(0,0,0,.45);"></div><div style="position:absolute;top:3px;left:0;width:24px;text-align:center;color:#0b0f19;font-size:10px;font-weight:800;line-height:18px;">${label}</div></div>`,
  });

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${ICON_BASE}/marker-icon-2x.png`,
  iconUrl: `${ICON_BASE}/marker-icon.png`,
  shadowUrl: `${ICON_BASE}/marker-shadow.png`,
});

const PICKUP_ICON = makeIcon("#10b981", "A");
const DROPOFF_ICON = makeIcon("#ef4444", "B");
const ME_ICON = makeIcon("#60a5fa", "•");

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const real = points.filter(Boolean);
    if (real.length === 0) return;
    if (real.length === 1) {
      map.setView([real[0].lat, real[0].lng], 13, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(real.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [46, 46], maxZoom: 14 });
  }, [points, map]);
  return null;
}

function LeafletMapCanvas({ pickup, dropoff, me, height = 260 }) {
  const center = pickup || dropoff || me || LOGAN;
  const routeLine = useMemo(() => {
    if (!pickup || !dropoff) return [];
    return [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]];
  }, [pickup, dropoff]);

  return (
    <div className="relative h-full w-full" style={{ minHeight: height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", background: "#0e1217" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {routeLine.length > 0 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#f4ecbf", weight: 5, opacity: 0.92, dashArray: "10 8" }}
          />
        )}
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON} />}
        {dropoff && <Marker position={[dropoff.lat, dropoff.lng]} icon={DROPOFF_ICON} />}
        {me && !pickup && <Marker position={[me.lat, me.lng]} icon={ME_ICON} />}
        <FitBounds points={[pickup, dropoff, me]} />
      </MapContainer>
      {pickup && dropoff && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[hsl(60_56%_91%)] backdrop-blur">
          A → B route
        </div>
      )}
      {!APPLE_MAPS_TOKEN && (
        <div className="pointer-events-none absolute left-3 bottom-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[hsl(60_20%_75%)] backdrop-blur">
          Map fallback
        </div>
      )}
    </div>
  );
}

let mapkitPromise;
function loadMapKit() {
  if (!APPLE_MAPS_TOKEN) return Promise.reject(new Error("Missing Apple Maps token"));
  if (window.mapkit) return Promise.resolve(window.mapkit);
  if (!mapkitPromise) {
    mapkitPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-atalay-mapkit="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.mapkit));
        existing.addEventListener("error", reject);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
      script.async = true;
      script.dataset.atalayMapkit = "true";
      script.onload = () => resolve(window.mapkit);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return mapkitPromise;
}

function AppleMapCanvas({ pickup, dropoff, me, height = 260, onFallback }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const center = pickup || dropoff || me || LOGAN;

    loadMapKit()
      .then((mapkit) => {
        if (cancelled || !ref.current) return;
        if (!mapkit.initialized) {
          mapkit.init({
            authorizationCallback(done) {
              done(APPLE_MAPS_TOKEN);
            },
          });
        }

        if (mapRef.current?.destroy) mapRef.current.destroy();
        const map = new mapkit.Map(ref.current, {
          center: new mapkit.Coordinate(center.lat, center.lng),
          showsMapTypeControl: false,
          showsCompass: mapkit.FeatureVisibility.Hidden,
          showsZoomControl: false,
          showsUserLocationControl: false,
        });
        mapRef.current = map;

        const items = [];
        const annotations = [];

        if (pickup) {
          const a = new mapkit.MarkerAnnotation(new mapkit.Coordinate(pickup.lat, pickup.lng), {
            glyphText: "A",
            color: "#10b981",
            title: "Pickup",
          });
          annotations.push(a);
          items.push(a);
        }
        if (dropoff) {
          const b = new mapkit.MarkerAnnotation(new mapkit.Coordinate(dropoff.lat, dropoff.lng), {
            glyphText: "B",
            color: "#ef4444",
            title: "Drop-off",
          });
          annotations.push(b);
          items.push(b);
        }
        if (me && !pickup) {
          const current = new mapkit.MarkerAnnotation(new mapkit.Coordinate(me.lat, me.lng), {
            glyphText: "•",
            color: "#60a5fa",
            title: "Current location",
          });
          annotations.push(current);
          items.push(current);
        }

        if (annotations.length) map.addAnnotations(annotations);

        if (pickup && dropoff) {
          const route = new mapkit.PolylineOverlay(
            [new mapkit.Coordinate(pickup.lat, pickup.lng), new mapkit.Coordinate(dropoff.lat, dropoff.lng)],
            { style: new mapkit.Style({ strokeColor: "#f4ecbf", lineWidth: 5, lineJoin: "round", lineCap: "round" }) }
          );
          map.addOverlay(route);
          items.push(route);
        }

        if (items.length > 1 && map.showItems) {
          map.showItems(items, { padding: new mapkit.Padding(46, 46, 46, 46), animate: true });
        } else if (items.length === 1 && map.setCenterAnimated) {
          map.setCenterAnimated(new mapkit.Coordinate(center.lat, center.lng));
        }
      })
      .catch(() => {
        if (!cancelled) onFallback?.();
      });

    return () => {
      cancelled = true;
      if (mapRef.current?.destroy) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [pickup, dropoff, me, onFallback]);

  return (
    <div className="relative h-full w-full" style={{ minHeight: height }}>
      <div ref={ref} className="h-full w-full bg-[#0e1217]" />
      {pickup && dropoff && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[hsl(60_56%_91%)] backdrop-blur">
          A → B route
        </div>
      )}
      <div className="pointer-events-none absolute left-3 bottom-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[hsl(60_20%_75%)] backdrop-blur">
        Apple Maps
      </div>
    </div>
  );
}

function MapCanvas({ pickup, dropoff, me, height = 260 }) {
  const [fallback, setFallback] = useState(!APPLE_MAPS_TOKEN);
  if (fallback) return <LeafletMapCanvas pickup={pickup} dropoff={dropoff} me={me} height={height} />;
  return <AppleMapCanvas pickup={pickup} dropoff={dropoff} me={me} height={height} onFallback={() => setFallback(true)} />;
}

export default function MapPreview({ pickup, dropoff, me, height = 260, expandable = true }) {
  const [open, setOpen] = useState(false);
  const canExpand = expandable && (pickup || dropoff || me || true);
  return (
    <>
      <button
        type="button"
        data-testid="map-preview"
        onClick={() => canExpand && setOpen(true)}
        className="relative z-0 block w-full overflow-hidden rounded-lg border border-border/70 bg-black text-left"
        style={{ height }}
        title={canExpand ? "Click to enlarge map" : undefined}
      >
        <MapCanvas pickup={pickup} dropoff={dropoff} me={me} height={height} />
        {canExpand && (
          <div className="absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[hsl(60_56%_91%)] backdrop-blur">
            Enlarge map
          </div>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[hsl(223_39%_7%)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Route map</div>
                <div className="font-serif text-xl text-[hsl(60_56%_91%)]">A → B trip preview</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/15 px-3 py-1 text-sm text-[hsl(60_56%_91%)] hover:bg-white/10">Close</button>
            </div>
            <div className="h-[70vh] min-h-[420px]">
              <MapCanvas pickup={pickup} dropoff={dropoff} me={me} height={520} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
