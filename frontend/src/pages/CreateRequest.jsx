import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { BriefcaseBusiness, Crosshair, Home, Loader2, MapPin } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import MapPreview from "@/components/MapPreview";
import { estimateMilesAndMinutes, recommendedPrice, SERVICE_AREA_TEXT, isSupportedMassachusettsTrip } from "@/lib/geo";

const VEHICLES = ["Sedan", "SUV", "Luxury", "Van"];
const VEHICLE_PASSENGER_LIMITS = { Sedan: 3, Luxury: 3, SUV: 6, Van: 9 };
const VEHICLE_PREVIEWS = {
  Sedan: {
    title: "Executive sedan",
    image: "/assets/premium-sedan-interior.png",
    subtitle: "Mercedes S-Class style rear-cabin comfort",
    details: "Best for airport transfers, business travel, and private executive rides.",
  },
  Luxury: {
    title: "First-class sedan",
    image: "/assets/premium-sedan-interior.png",
    subtitle: "Premium flagship sedan experience",
    details: "A quieter, more elevated interior for VIP and special-occasion travel.",
  },
  SUV: {
    title: "Luxury SUV",
    image: "/assets/hero-escalade-chauffeur.png",
    subtitle: "Cadillac Escalade ESV style presence",
    details: "More room for luggage, families, airport runs, and premium group comfort.",
  },
  Van: {
    title: "Executive van",
    image: "/assets/executive-van-preview.png",
    subtitle: "Mercedes Sprinter style group travel",
    details: "Ideal for larger groups, events, luggage-heavy trips, and coordinated transfers.",
  },
};

function TermsBody() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
      <p>Atalay Limo is a private transportation marketplace connecting customers with vetted chauffeurs and approved vehicles.</p>
      <p>By submitting a request or offer, you confirm that the trip details are accurate and that you will not arrange off-platform pricing, payment, or transportation for a ride initiated through Atalay Limo.</p>
      <p>Personal contact details, including phone numbers, emails, and direct payment information, must not be shared before Atalay Limo confirms the booking.</p>
      <p>Payments may be reviewed by Atalay Limo before final confirmation. Approval may take approximately 1–2 hours.</p>
      <p>If a confirmed ride is cancelled after approval, platform commission and applicable charges may still apply.</p>
      <p>Atalay Limo may review bookings, messages, offers, and accounts for safety, support, fraud prevention, and service quality.</p>
    </div>
  );
}

export default function CreateRequest({ guestMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    pickup_address: "", dropoff_address: "",
    pickup_coords: null, dropoff_coords: null,
    date: today, time: "09:00",
    passengers: "1", luggage: "0", vehicle_type: "Sedan", notes: "",
    pricing_mode: "per_mile", round_trip: false, return_date: today, return_time: "",
    guest_name: "", guest_email: "", guest_phone: "",
  });
  const [me, setMe] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guestSuccess, setGuestSuccess] = useState(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const maxPassengers = VEHICLE_PASSENGER_LIMITS[form.vehicle_type] || 9;
  const vehiclePreview = VEHICLE_PREVIEWS[form.vehicle_type] || VEHICLE_PREVIEWS.Sedan;
  const customerShortcuts = useMemo(() => {
    try {
      const raw = localStorage.getItem("atalay_customer_shortcuts_guest") || Object.keys(localStorage).find((k) => k.startsWith("atalay_customer_shortcuts_"));
      const parsed = raw && raw.startsWith("[") ? JSON.parse(raw) : JSON.parse(localStorage.getItem(raw) || "[]");
      return Array.isArray(parsed) ? parsed.filter((x) => x?.address) : [];
    } catch { return []; }
  }, []);
  const applyShortcut = (target, item) => {
    const patch = target === "pickup" ? { pickup_address: item.address, pickup_coords: item.coords || null } : { dropoff_address: item.address, dropoff_coords: item.coords || null };
    setForm((f) => ({ ...f, ...patch }));
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const to = params.get("to");
    const from = params.get("from");
    const toLat = params.get("toLat");
    const toLng = params.get("toLng");
    if (to) setForm((f) => ({ ...f, dropoff_address: to, dropoff_coords: toLat && toLng ? { lat: Number(toLat), lng: Number(toLng) } : null }));
    if (from === "current") useMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const setNumericField = (field, value, max) => {
    if (value === "") {
      setForm((f) => ({ ...f, [field]: "" }));
      return;
    }
    const cleaned = String(value).replace(/[^0-9]/g, "");
    if (cleaned === "") {
      setForm((f) => ({ ...f, [field]: "" }));
      return;
    }
    const n = Math.min(max, Math.max(0, parseInt(cleaned, 10)));
    setForm((f) => ({ ...f, [field]: String(n) }));
  };

  // --- Geolocation -----------------------------------------------------------
  const useMyLocation = async () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported by this browser");
      return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(coords);
        // Reverse-geocode via Nominatim (free, no key). Replace with paid API for scale.
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}`,
            { headers: { Accept: "application/json" } },
          );
          const data = await res.json();
          if (data?.display_name) {
            setForm((f) => ({ ...f, pickup_address: data.display_name, pickup_coords: coords }));
          } else {
            setForm((f) => ({ ...f, pickup_coords: coords }));
          }
          toast.success("Pickup set to your current location");
        } catch (err) {
          console.error("Reverse geocode failed:", err);
          setForm((f) => ({ ...f, pickup_coords: coords }));
        } finally {
          setLocBusy(false);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        toast.error(err.code === 1 ? "Location permission denied" : "Could not get your location");
        setLocBusy(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  // --- Live route + price estimate ------------------------------------------
  const route = useMemo(
    () => estimateMilesAndMinutes(form.pickup_coords, form.dropoff_coords),
    [form.pickup_coords, form.dropoff_coords],
  );
  const recPrice = useMemo(
    () => recommendedPrice({ miles: route.miles, minutes: route.minutes, mode: form.pricing_mode, vehicleType: form.vehicle_type }),
    [route.miles, route.minutes, form.pricing_mode, form.vehicle_type],
  );

  // Long-trip hint: suggest hourly mode if very long
  useEffect(() => {
    if (route.minutes != null && route.minutes > 60 && form.pricing_mode === "per_mile") {
      toast.info("Long trip detected — hourly service may be a better fit.");
    }
  }, [route.minutes, form.pricing_mode]);

  useEffect(() => {
    const current = parseInt(form.passengers || "0", 10);
    if (current > maxPassengers) {
      setForm((f) => ({ ...f, passengers: String(maxPassengers) }));
      toast.info(`${form.vehicle_type} supports up to ${maxPassengers} passengers.`);
    }
  }, [form.vehicle_type, form.passengers, maxPassengers]);

  const submit = async (e) => {
    e.preventDefault();
    if (!isSupportedMassachusettsTrip(form.pickup_address, form.pickup_coords, form.dropoff_address, form.dropoff_coords)) {
      toast.error("Trip must start in Massachusetts or end in Massachusetts.");
      return;
    }
    const passengers = parseInt(form.passengers || "0", 10);
    const luggage = parseInt(form.luggage || "0", 10);
    if (!passengers || passengers < 1) {
      toast.error("Please enter at least 1 passenger.");
      return;
    }
    if (passengers > maxPassengers) {
      toast.error(`${form.vehicle_type} supports up to ${maxPassengers} passengers.`);
      return;
    }
    if (luggage < 0) {
      toast.error("Luggage cannot be negative.");
      return;
    }
    if (form.round_trip && !form.return_date) {
      toast.error("Please select a return date for the round trip.");
      return;
    }
    if (guestMode) {
      if (!form.guest_name.trim() || !form.guest_email.trim() || !form.guest_phone.trim()) {
        toast.error("Please enter your name, email, and phone to continue as a guest.");
        return;
      }
    }
    if (!acceptedTerms) {
      toast.error("Please accept the Terms & Conditions to continue.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        pickup_address: form.pickup_address,
        dropoff_address: form.dropoff_address,
        date: form.date,
        time: form.time,
        passengers,
        luggage,
        vehicle_type: form.vehicle_type,
        notes: form.notes,
        pickup_lat: form.pickup_coords?.lat ?? null,
        pickup_lng: form.pickup_coords?.lng ?? null,
        dropoff_lat: form.dropoff_coords?.lat ?? null,
        dropoff_lng: form.dropoff_coords?.lng ?? null,
        estimated_miles: route.miles,
        estimated_minutes: route.minutes,
        recommended_price: recPrice,
        pricing_mode: form.pricing_mode,
        round_trip: form.round_trip,
        return_date: form.round_trip ? form.return_date : null,
        return_time: form.round_trip ? form.return_time : null,
        ...(guestMode ? { guest_name: form.guest_name, guest_email: form.guest_email, guest_phone: form.guest_phone } : {}),
      };
      const { data } = await api.post(guestMode ? "/guest/ride-requests" : "/ride-requests", payload);
      toast.success(guestMode ? "Request posted as guest" : "Ride request posted");
      if (guestMode) {
        setGuestSuccess(data);
      } else {
        navigate(`/ride/${data.id}`);
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to create request");
    } finally {
      setBusy(false);
    }
  };

  if (guestMode && guestSuccess) {
    return (
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12">
        <Card className="bg-card border-border/70">
          <CardContent className="p-8 text-center">
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Guest request posted</div>
            <h1 className="font-serif text-4xl mt-3 tracking-tighter">We received your trip request.</h1>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Atalay Limo will review the trip and contact you when chauffeur offers are available. You can create an account later if you want to manage the request online.</p>
            <div className="mt-6 rounded-xl border border-border/70 bg-secondary/40 p-4 text-left">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Request reference</div>
              <div className="font-serif text-2xl mt-1">{guestSuccess.id?.slice?.(0, 8)?.toUpperCase()}</div>
              <div className="text-xs text-muted-foreground mt-1">Final ride number is assigned after payment/admin approval.</div>
            </div>
            <Button className="mt-6 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]" onClick={() => navigate("/register/customer")}>Create customer account</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{guestMode ? "Guest request" : "New request"}</div>
      <h1 className="font-serif text-4xl mt-2 tracking-tighter">Tell us about the ride.</h1>
      <p className="text-muted-foreground mt-2">Drivers in our Boston-based network will privately quote your trip. {SERVICE_AREA_TEXT} Once submitted, vetted chauffeurs can send you an all-in offer.</p>

      <Card className="mt-8 bg-card border-border/70">
        <CardContent className="p-6 sm:p-8 space-y-5">
          <form onSubmit={submit} className="space-y-5">
            {guestMode && (
              <div className="rounded-lg border border-[hsl(60_56%_91%)]/20 bg-[hsl(60_56%_91%)]/5 p-4 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Continue as guest</div>
                  <p className="text-sm text-muted-foreground mt-1">No account required to request offers. We use this info only to contact you about this trip.</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Name</Label><Input required value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} placeholder="Full name" /></div>
                  <div className="space-y-2"><Label>Email</Label><Input required type="email" value={form.guest_email} onChange={(e) => setForm({ ...form, guest_email: e.target.value })} placeholder="you@example.com" /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input required value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} placeholder="+1..." /></div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pickup address</Label>
                <button
                  type="button"
                  data-testid="use-my-location-btn"
                  onClick={useMyLocation}
                  disabled={locBusy}
                  className="text-xs inline-flex items-center gap-1.5 text-[hsl(60_56%_91%)] hover:underline disabled:opacity-50"
                >
                  {locBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                  Use my current location
                </button>
              </div>
              {customerShortcuts.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-1">
                  {customerShortcuts.map((s) => { const Icon = s.key === "home" ? Home : s.key === "work" ? BriefcaseBusiness : MapPin; return <button key={`pickup-${s.key}`} type="button" onClick={() => applyShortcut("pickup", s)} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/35 px-3 py-1 text-xs text-muted-foreground hover:text-[hsl(60_56%_91%)]"><Icon className="h-3 w-3" /> {s.label}</button>; })}
                </div>
              )}
              <AddressAutocomplete
                testId="pickup-input"
                value={form.pickup_address}
                onChange={(v) => setForm((f) => ({ ...f, pickup_address: v, pickup_coords: null }))}
                onSelect={(s) => setForm((f) => ({ ...f, pickup_address: s.label, pickup_coords: { lat: s.lat, lng: s.lng } }))}
                placeholder="Start typing an address…"
              />
            </div>
            <div className="space-y-2">
              <Label>Drop-off address</Label>
              {customerShortcuts.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-1">
                  {customerShortcuts.map((s) => { const Icon = s.key === "home" ? Home : s.key === "work" ? BriefcaseBusiness : MapPin; return <button key={`dropoff-${s.key}`} type="button" onClick={() => applyShortcut("dropoff", s)} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/35 px-3 py-1 text-xs text-muted-foreground hover:text-[hsl(60_56%_91%)]"><Icon className="h-3 w-3" /> {s.label}</button>; })}
                </div>
              )}
              <AddressAutocomplete
                testId="dropoff-input"
                value={form.dropoff_address}
                onChange={(v) => setForm((f) => ({ ...f, dropoff_address: v, dropoff_coords: null }))}
                onSelect={(s) => setForm((f) => ({ ...f, dropoff_address: s.label, dropoff_coords: { lat: s.lat, lng: s.lng } }))}
                placeholder="Where to?"
              />
            </div>

            {/* Map preview */}
            <MapPreview pickup={form.pickup_coords} dropoff={form.dropoff_coords} me={me} />

            {/* Route summary shown to customer without exposing internal pricing guidance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="route-summary">
              <div className="rounded-md border border-border/70 p-3 bg-secondary/40">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated miles</div>
                <div data-testid="estimated-miles" className="font-serif text-xl mt-1">
                  {route.miles != null ? `${route.miles} mi` : "—"}
                </div>
              </div>
              <div className="rounded-md border border-border/70 p-3 bg-secondary/40">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated duration</div>
                <div data-testid="estimated-duration" className="font-serif text-xl mt-1">
                  {route.minutes != null ? `${route.minutes} min` : "—"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date</Label><Input data-testid="date-input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Time</Label><Input data-testid="time-input" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Passengers</Label>
                  <span className="text-[10px] text-muted-foreground">Max {maxPassengers} for {form.vehicle_type}</span>
                </div>
                <Input
                  data-testid="passengers-input"
                  type="text"
                  inputMode="numeric"
                  required
                  value={form.passengers}
                  onChange={(e) => setNumericField("passengers", e.target.value, maxPassengers)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Luggage</Label>
                <Input
                  data-testid="luggage-input"
                  type="text"
                  inputMode="numeric"
                  required
                  value={form.luggage}
                  onChange={(e) => setNumericField("luggage", e.target.value, 20)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle type</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_type: v, passengers: String(Math.min(parseInt(f.passengers || "1", 10) || 1, VEHICLE_PASSENGER_LIMITS[v] || 9)) }))}>
                  <SelectTrigger data-testid="vehicle-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{VEHICLES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service type</Label>
                <Select value={form.pricing_mode} onValueChange={(v) => setForm({ ...form, pricing_mode: v })}>
                  <SelectTrigger data-testid="pricing-mode-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_mile">Standard transfer</SelectItem>
                    <SelectItem value="hourly">Hourly service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 overflow-hidden bg-secondary/30" data-testid="vehicle-preview-card">
              <div className="grid sm:grid-cols-[1.15fr_0.85fr] gap-0">
                <div className="h-44 sm:h-full min-h-[190px] overflow-hidden bg-black">
                  <img src={vehiclePreview.image} alt={vehiclePreview.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-4 flex flex-col justify-center">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Selected class</div>
                  <div className="font-serif text-2xl mt-1">{vehiclePreview.title}</div>
                  <div className="text-sm text-[hsl(60_56%_91%)] mt-1">{vehiclePreview.subtitle}</div>
                  <p className="text-sm text-muted-foreground mt-3">{vehiclePreview.details}</p>
                  <div className="mt-4 text-xs text-muted-foreground">Up to {maxPassengers} passenger{maxPassengers > 1 ? "s" : ""}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 p-4 bg-secondary/30 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  data-testid="round-trip-checkbox"
                  type="checkbox"
                  checked={form.round_trip}
                  onChange={(e) => setForm({ ...form, round_trip: e.target.checked })}
                  className="h-4 w-4 accent-[hsl(60_56%_91%)]"
                />
                <span>
                  <span className="block text-sm font-medium">Round trip</span>
                  <span className="block text-xs text-muted-foreground">Add return details if the customer needs a ride back.</span>
                </span>
              </label>
              {form.round_trip && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Return date</Label><Input data-testid="return-date-input" type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Return time</Label><Input data-testid="return-time-input" type="time" value={form.return_time} onChange={(e) => setForm({ ...form, return_time: e.target.value })} /></div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea data-testid="notes-input" rows={3} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Child seat, meet inside terminal, etc." />
            </div>

            <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input
                  data-testid="terms-checkbox"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[hsl(60_56%_91%)]"
                />
                <span className="text-muted-foreground">
                  I accept the {" "}
                  <button type="button" onClick={() => setTermsOpen(true)} className="text-[hsl(60_56%_91%)] underline underline-offset-4">
                    Terms & Conditions
                  </button>
                  .
                </span>
              </label>
            </div>

            <Button data-testid="create-request-submit-btn" type="submit" disabled={busy || !acceptedTerms} className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)] disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "Posting…" : guestMode ? "Get private offers" : "Post ride request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader><DialogTitle className="font-serif text-2xl">Terms & Conditions</DialogTitle></DialogHeader>
          <TermsBody />
          <Button type="button" onClick={() => setTermsOpen(false)} className="mt-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
