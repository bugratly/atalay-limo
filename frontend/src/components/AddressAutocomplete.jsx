import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

/**
 * Address autocomplete using OpenStreetMap Nominatim (free, no API key).
 * Fair-use policy: 1 req/sec, identify caller via Referer. We debounce 350ms.
 *
 * IMPORTANT: For higher volume or commercial use, swap to a paid geocoder
 * (Mapbox, OpenRouteService, Google Places, etc.) by replacing the fetch URL
 * + result-parsing inside `searchAddresses`. Keep the onSelect contract.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function searchAddresses(q) {
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Geocoder error");
  const data = await res.json();
  return data.map((d) => ({
    label: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  testId,
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await searchAddresses(v);
        setResults(items);
        setOpen(items.length > 0);
      } catch (err) {
        console.error("Geocoder failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const pick = (r) => {
    onChange(r.label);
    onSelect({ label: r.label, lat: r.lat, lng: r.lng });
    setOpen(false);
  };

  return (
    <div className="relative z-50" ref={containerRef}>
      <div className="relative">
        <Input
          data-testid={testId}
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div
          data-testid={`${testId}-suggestions`}
          className="absolute z-[9999] left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-2xl max-h-72 overflow-y-auto"
        >
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.lat}-${r.lng}-${i}`}
              data-testid={`${testId}-suggestion-${i}`}
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent flex items-start gap-2 border-b border-border/40 last:border-b-0"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-[hsl(60_56%_91%)]/70 shrink-0" />
              <span className="text-sm text-foreground line-clamp-2">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
