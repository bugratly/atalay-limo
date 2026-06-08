import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RideCard from "@/components/RideCard";
import StatusBadge from "@/components/StatusBadge";
import DashboardChatPanel from "@/components/DashboardChatPanel";
import MapPreview from "@/components/MapPreview";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  Bell,
  CheckCircle2,
  LocateFixed,
  MapPin,
  MessageSquare,
  Navigation,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  Menu,
  X,
  UserRound,
  CreditCard,
  FileText,
  WalletCards,
  Building2,
  Car,
  HelpCircle,
  Smartphone,
  Sparkles,
  Clock3,
  Handshake,
} from "lucide-react";

const requiredDocs = [
  { type: "driver_license", label: "Driver license" },
  { type: "insurance_liability_1m", label: "Insurance — $1M liability coverage" },
  { type: "car_registration", label: "Car registration" },
  { type: "vehicle_inspection", label: "Vehicle inspection" },
  { type: "tnc_inspection", label: "TNC inspection" },
];

const driverEducationCards = [
  {
    title: "Set the tone with a professional greeting",
    kicker: "Five-star pickup",
    icon: Handshake,
    image: "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=1200&q=80",
    body: "Greet the client by name when possible, confirm the ride, open the door safely, and keep the first impression calm and professional.",
    bullets: ["Be visible and ready at pickup", "Confirm client and destination before departure", "Never share private trip details"],
  },
  {
    title: "Assist with luggage every time",
    kicker: "Service detail",
    icon: UploadCloud,
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    body: "Help with bags at pickup and dropoff when safe. Small service details are what make the ride feel premium.",
    bullets: ["Offer help before the client asks", "Keep bags secure in the vehicle", "Be careful around airport and hotel curbs"],
  },
  {
    title: "Keep the cabin clean, quiet, and stocked",
    kicker: "Vehicle standard",
    icon: Sparkles,
    image: "/assets/luxury-suv-preview.png",
    body: "Your vehicle should feel ready before every ride. Clean seats, water when available, and a quiet cabin help protect your rating.",
    bullets: ["Check water and amenities", "Remove trash before every pickup", "Report cleaning or damage issues immediately"],
  },
  {
    title: "Prepare early for scheduled rides",
    kicker: "Operations rule",
    icon: Clock3,
    image: "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?auto=format&fit=crop&w=1200&q=80",
    body: "For scheduled rides, go online early and review route, pickup notes, luggage, flight, and timing before moving to the pickup point.",
    bullets: ["Be online before required cutoff", "To pickup unlocks close to pickup time", "Arriving too early does not start paid waiting"],
  },
  {
    title: "Keep your phone charged and navigation ready",
    kicker: "Driver tools",
    icon: Smartphone,
    image: "https://images.unsplash.com/photo-1511918984145-48de785d4c4e?auto=format&fit=crop&w=1200&q=80",
    body: "Your phone is your dispatch tool. Keep battery, notifications, and navigation ready until the trip is completed.",
    bullets: ["Do not start a ride without the client code", "Use safe hands-free navigation", "Contact support if route or pickup details change"],
  },
];
const driverFaqs = [
  ["When should I go online?", "For scheduled rides, be online before the required cutoff shown in your dashboard. If you miss it, the ride may be cancelled and affect your cancellation rate."],
  ["When can I go to pickup?", "The pickup action stays locked until the allowed time window. Review route and notes before leaving."],
  ["How do I start a trip?", "Arrive, meet the client, then enter the client’s 4-digit ride code. The trip cannot start without the code."],
  ["How does wait time work?", "The first 15 minutes after scheduled pickup are free for the client. After that, wait time may be billed according to platform rules."],
];
function DriverEducationSection() {
  return <div className="space-y-5">
    <div className="rounded-3xl border border-border/70 bg-[linear-gradient(135deg,hsl(223_34%_9%),hsl(220_24%_14%))] p-6 md:p-8">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Driver service guide</div>
        <h2 className="mt-2 font-serif text-3xl md:text-4xl">Professional habits create premium rides.</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Use these operating reminders to protect your rating, reduce cancellations, and deliver a consistent black-car experience.</p>
      </div>
    </div>
    {driverEducationCards.map((card) => {
      const Icon = card.icon;
      return <Card key={card.title} className="border-border/70 bg-[hsl(222_30%_10%)]/95 shadow-xl shadow-black/20">
        <CardContent className="grid gap-0 overflow-hidden p-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="min-h-[230px] overflow-hidden lg:min-h-[310px]"><img src={card.image} alt={card.title} className="h-full w-full object-cover opacity-90" /></div>
          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground"><Icon className="h-4 w-4 text-slate-300" />{card.kicker}</div>
            <h3 className="mt-3 font-serif text-3xl">{card.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
            <div className="mt-5 space-y-2">{card.bullets.map((b) => <div key={b} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" />{b}</div>)}</div>
          </div>
        </CardContent>
      </Card>;
    })}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="border-border/70 bg-[hsl(222_30%_10%)]/95"><CardContent className="p-5"><div className="mb-2 font-serif text-xl">Privacy & Terms</div><ul className="space-y-2 text-sm leading-relaxed text-muted-foreground"><li>• Respect every client’s privacy. Do not record, share, or discuss trip details.</li><li>• Do not ask clients to pay or book outside the platform.</li><li>• Keep required insurance, registration, inspection, and TNC documents current.</li><li>• Report disputes, damage, no-shows, and route changes through the app.</li></ul></CardContent></Card>
      <Card className="border-border/70 bg-[hsl(222_30%_10%)]/95"><CardContent className="p-5"><div className="mb-4 flex items-center gap-2"><HelpCircle className="h-5 w-5 text-slate-300" /><h3 className="font-serif text-xl">FAQ</h3></div><div className="divide-y divide-border/60">{driverFaqs.map(([q,a]) => <div key={q} className="py-3"><div className="font-medium">{q}</div><p className="mt-1 text-sm text-muted-foreground">{a}</p></div>)}</div></CardContent></Card>
    </div>
  </div>;
}


function DriverPermissionCenter({ onRequestLocation }) {
  const storageKey = "atalay_driver_home_permissions";
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  const save = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  const requestNotifications = async () => {
    if (!("Notification" in window)) { toast.error("Notifications are not available in this browser"); save({ notifications: "unavailable" }); return; }
    const result = await Notification.requestPermission();
    save({ notifications: result });
    if (result === "granted") toast.success("Driver notifications enabled");
  };
  const requestLocation = () => {
    save({ location: "requested" });
    onRequestLocation?.();
  };
  const ToggleRow = ({ title, body, value, required, onAllow, onDeny }) => (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-[hsl(222_30%_10%)]/95 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 font-medium text-foreground">{title}{required && <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-red-200">Required</span>}</div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onDeny} className={`rounded-full border px-4 py-2 text-xs transition ${value === "denied" || value === "dismissed" ? "border-slate-400/40 bg-slate-500/15 text-slate-100" : "border-white/10 bg-black/20 text-muted-foreground hover:bg-white/5"}`}>Don’t allow</button>
        <button type="button" onClick={onAllow} className={`rounded-full border px-4 py-2 text-xs transition ${value === "granted" || value === "requested" ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-slate-200/10 text-slate-100 hover:bg-slate-200/15"}`}>Allow</button>
      </div>
    </div>
  );
  return (
    <Card className="border-border/70 bg-[linear-gradient(135deg,hsl(223_34%_9%),hsl(220_24%_13%))]">
      <CardContent className="space-y-3 p-5">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Driver permissions</div>
          <h3 className="mt-1 font-serif text-2xl">Turn on required driver access</h3>
          <p className="mt-1 text-sm text-muted-foreground">Location is required for drivers. Notifications help you receive schedule reminders, admin messages, and offer updates.</p>
        </div>
        <ToggleRow
          title="Location access"
          body="Required to load your driver map, show your service area, and support dispatch operations."
          required
          value={settings.location}
          onAllow={requestLocation}
          onDeny={() => save({ location: "dismissed" })}
        />
        <ToggleRow
          title="Notifications"
          body="Receive ride reminders, inbox messages, dispatch updates, and payout notices."
          value={settings.notifications}
          onAllow={requestNotifications}
          onDeny={() => save({ notifications: "denied" })}
        />
      </CardContent>
    </Card>
  );
}

function LocationGate({ location, locationStatus, locationError, onRequest }) {
  if (location) return null;
  return (
    <Card className="mb-6 border-[hsl(42_60%_65%)]/40 bg-[hsl(42_60%_65%)]/10">
      <CardContent className="p-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[hsl(42_60%_65%)]/30 bg-black/25">
            <LocateFixed className="h-6 w-6 text-[hsl(42_60%_70%)]" />
          </div>
          <div>
            <div className="font-serif text-2xl text-[hsl(60_56%_91%)]">Location access is required for drivers</div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(60_20%_74%)]">
              Allow location access to load your driver home map and help the platform understand where you are available to serve rides.
            </p>
            {locationError && <p className="mt-2 text-sm text-orange-200">{locationError}</p>}
          </div>
        </div>
        <Button onClick={onRequest} disabled={locationStatus === "requesting"} className="rounded-xl bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
          {locationStatus === "requesting" ? "Requesting…" : "Allow location"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DriverHome({ user, open, mine, documents, loading, location, locationStatus, locationError, onRequestLocation, refresh }) {
  const missingDocs = useMemo(() => requiredDocs.filter((d) => !documents.some((x) => x.document_type === d.type)), [documents]);
  const activeOffers = mine.filter((o) => ["pending", "accepted"].includes(o.status));

  return (
    <div className="space-y-6">
      <LocationGate location={location} locationStatus={locationStatus} locationError={locationError} onRequest={onRequestLocation} />

      <DriverPermissionCenter onRequestLocation={onRequestLocation} />

      <Card className="overflow-hidden border-border/70 bg-card">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b border-border/60 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Driver home</div>
              <h2 className="mt-2 font-serif text-3xl">Welcome back, {user?.name || "Driver"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Your live driver map loads after location permission. This page will become your main driver home.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onRequestLocation} className="rounded-xl border-white/15 bg-transparent">
                <Navigation className="mr-2 h-4 w-4" /> Refresh location
              </Button>
              <Button variant="outline" onClick={refresh} className="rounded-xl border-white/15 bg-transparent">
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh rides
              </Button>
            </div>
          </div>
          <div className="relative">
            <MapPreview me={location} height={520} expandable />
            {!location && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
                <div className="max-w-md rounded-2xl border border-white/15 bg-[hsl(223_39%_7%)]/92 p-6 text-center shadow-2xl">
                  <MapPin className="mx-auto h-8 w-8 text-[hsl(42_60%_70%)]" />
                  <h3 className="mt-3 font-serif text-2xl">Location permission needed</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Drivers must allow location access before using the driver home map.</p>
                  <Button onClick={onRequestLocation} className="mt-4 rounded-xl bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Allow location</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card"><CardContent className="p-5"><div className="text-sm text-muted-foreground">Open requests</div><div className="mt-2 font-serif text-3xl">{open.length}</div></CardContent></Card>
        <Card className="border-border/70 bg-card"><CardContent className="p-5"><div className="text-sm text-muted-foreground">Active offers</div><div className="mt-2 font-serif text-3xl">{activeOffers.length}</div></CardContent></Card>
        <Card className="border-border/70 bg-card"><CardContent className="p-5"><div className="text-sm text-muted-foreground">Missing documents</div><div className="mt-2 font-serif text-3xl">{missingDocs.length}</div></CardContent></Card>
      </div>

      {missingDocs.length > 0 && (
        <Card className="border-[hsl(42_60%_65%)]/35 bg-[hsl(42_60%_65%)]/8">
          <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-serif text-2xl">Let’s get your documents ready</div>
              <p className="mt-2 text-sm text-muted-foreground">Upload your required chauffeur documents so admin can approve your account faster.</p>
            </div>
            <Button asChild variant="outline" className="rounded-xl border-[hsl(42_60%_65%)]/30 bg-transparent">
              <Link to="/profile">Open profile <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <DriverEducationSection />

      {!location ? null : loading ? (
        <div className="text-muted-foreground">Loading requests…</div>
      ) : open.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">No open requests right now.</div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-2xl">Available requests</h3>
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Submit offers</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2" data-testid="driver-open-list">
            {open.map((r) => <RideCard key={r.id} ride={r} action="Submit offer" />)}
          </div>
        </div>
      )}
    </div>
  );
}

function EarningsSummary({ mine }) {
  const accepted = mine.filter((o) => o.status === "accepted");
  const pending = mine.filter((o) => o.status === "pending");
  const acceptedTotal = accepted.reduce((sum, o) => sum + Number(o.driver_payout || o.price * 0.8 || 0), 0);
  const pendingTotal = pending.reduce((sum, o) => sum + Number(o.driver_payout || o.price * 0.8 || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card"><CardContent className="p-5"><div className="text-sm text-muted-foreground">Accepted payouts</div><div className="mt-2 font-serif text-3xl">${acceptedTotal.toFixed(2)}</div></CardContent></Card>
        <Card className="border-border/70 bg-card"><CardContent className="p-5"><div className="text-sm text-muted-foreground">Pending offers</div><div className="mt-2 font-serif text-3xl">${pendingTotal.toFixed(2)}</div></CardContent></Card>
        <Card className="border-border/70 bg-card"><CardContent className="p-5"><div className="text-sm text-muted-foreground">Submitted offers</div><div className="mt-2 font-serif text-3xl">{mine.length}</div></CardContent></Card>
      </div>
      <Card className="border-border/70 bg-card">
        <CardContent className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl">Detailed earnings</h2>
            <p className="mt-2 text-sm text-muted-foreground">Open the full earnings page for balance, latest payout, and waybill-style ride details.</p>
          </div>
          <Button asChild className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
            <Link to="/driver/earnings">Open earnings page <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-4" data-testid="driver-my-offers-list">
        {mine.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">No offers submitted yet.</div>
        ) : mine.map((o) => (
          <Card key={o.id} className="border-border/70 bg-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-2xl">${Number(o.price || 0).toFixed(2)}</div>
                {o.ride && <div className="mt-1 truncate text-sm text-muted-foreground">{o.ride.pickup_address} → {o.ride.dropoff_address} · {o.ride.date} {o.ride.time}</div>}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={o.status === "accepted" ? "accepted_offer" : o.status} />
                {o.ride && <Link to={`/ride/${o.ride.id}`} className="flex items-center gap-1 text-sm hover:text-[hsl(60_56%_91%)]">View <ArrowRight className="h-3 w-3" /></Link>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DriverInbox() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data || []);
    } catch (err) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markRead = async (n) => {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => null);
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  const markAll = async () => {
    await api.post("/notifications/read-all").catch(() => null);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-[hsl(42_60%_70%)]" /><h2 className="font-serif text-2xl">Messages</h2></div>
        </div>
        <DashboardChatPanel />
      </div>
      <Card className="border-border/70 bg-card">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 p-5">
            <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-[hsl(42_60%_70%)]" /><div><h2 className="font-serif text-2xl">Notifications</h2><div className="text-xs text-muted-foreground">Tips, ride updates, approvals, and system messages</div></div></div>
            {unread > 0 && <Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button>}
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading notifications…</div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map((n) => (
                <Link key={n.id} to={n.link || "#"} onClick={() => markRead(n)} className={`block p-4 hover:bg-secondary/40 ${n.read ? "" : "bg-[hsl(42_60%_65%)]/8"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-muted" : "bg-amber-300"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{n.title}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</div>
                      <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function docTone(doc) {
  if (!doc) return { label: "Needs upload", cls: "border-red-500/30 bg-red-500/10 text-red-200" };
  if (doc.status === "approved") {
    if (doc.expiration_date) {
      const days = Math.ceil((new Date(doc.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days <= 30) return { label: "Expiring soon", cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200" };
    }
    return { label: "Approved", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" };
  }
  if (doc.status === "pending") return { label: "Pending review", cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200" };
  return { label: "Re-upload required", cls: "border-red-500/30 bg-red-500/10 text-red-200" };
}

function SmallField({ label, children }) {
  return <label className="block text-xs uppercase tracking-wider text-muted-foreground space-y-1">{label}{children}</label>;
}
const menuInputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[hsl(60_56%_91%)]";

function DriverAccountMenu({ open, onClose, user, documents = [], vehicles = [], earnings, refresh }) {
  const [section, setSection] = useState("vehicles");
  const [taxForm, setTaxForm] = useState({ tax_profile_type: "individual", legal_name: user?.name || "", ssn_last4: "", ein: "", address_line1: "", address_line2: "", city: "", state: "MA", zip_code: "" });
  const [taxInfo, setTaxInfo] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [payoutForm, setPayoutForm] = useState({ method_type: "bank", account_holder_name: user?.name || "", routing_number: "", account_number: "", debit_card_last4: "", debit_card_brand: "Visa" });
  const [busy, setBusy] = useState(false);

  const loadMoneySettings = useCallback(async () => {
    if (!open) return;
    const [tax, methods] = await Promise.all([
      api.get("/driver/tax-info").catch(() => ({ data: null })),
      api.get("/driver/payout-methods").catch(() => ({ data: [] })),
    ]);
    setTaxInfo(tax.data);
    setPayouts(methods.data || []);
    if (tax.data && tax.data.id) {
      setTaxForm((prev) => ({ ...prev, ...tax.data }));
    }
  }, [open]);

  useEffect(() => { loadMoneySettings(); }, [loadMoneySettings]);
  if (!open) return null;

  const stats = earnings?.summary || {};
  const approvedVehicles = vehicles.filter((v) => v.active);
  const selectedVehicle = vehicles.find((v) => v.driver_selected) || approvedVehicles[0];

  const selectVehicle = async (vid) => {
    setBusy(true);
    try {
      await api.post(`/vehicles/mine/${vid}/activate`);
      await refresh?.();
    } finally { setBusy(false); }
  };

  const submitTax = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/driver/tax-info", taxForm);
      setTaxInfo(data);
    } finally { setBusy(false); }
  };

  const addPayout = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/driver/payout-methods", payoutForm);
      await loadMoneySettings();
    } finally { setBusy(false); }
  };

  const requestInstant = async () => {
    setBusy(true);
    try {
      await api.post("/driver/payout/instant");
      await loadMoneySettings();
    } finally { setBusy(false); }
  };

  const sections = [
    ["vehicles", "Vehicles", Car],
    ["documents", "Documents", FileText],
    ["insurance", "Insurance", ShieldAlert],
    ["earnings", "Earnings", Banknote],
    ["tax", "Tax info", Building2],
    ["payout", "Payout methods", WalletCards],
  ];

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Close menu" />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[hsl(223_39%_7%)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[hsl(223_39%_7%)]/95 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Driver menu</div>
          <Button variant="outline" size="sm" onClick={onClose} className="border-white/15 bg-transparent"><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-5">
          <Card className="border-[hsl(42_60%_65%)]/30 bg-[hsl(42_60%_65%)]/8">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-600 to-zinc-800"><UserRound className="h-9 w-9 text-white/60" /></div>
                <div className="min-w-0">
                  <div className="font-serif text-3xl truncate">{user?.name || "Driver"}</div>
                  <div className="mt-1 text-sm text-muted-foreground truncate">{user?.email}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs"><StatusBadge status={user?.admin_approved ? "approved" : "pending"} /><span className="rounded-full border border-white/10 px-2 py-1 text-muted-foreground">English</span></div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="font-serif text-2xl">${Number(stats.available_balance || 0).toFixed(0)}</div><div className="text-xs text-muted-foreground">Available</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="font-serif text-2xl">{vehicles.length}</div><div className="text-xs text-muted-foreground">Vehicles</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="font-serif text-2xl">{documents.filter(d => d.status === "approved").length}</div><div className="text-xs text-muted-foreground">Docs OK</div></div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sections.map(([key, label, Icon]) => <Button key={key} variant={section === key ? "default" : "outline"} onClick={() => setSection(key)} className="justify-start rounded-xl border-white/15 bg-transparent"><Icon className="mr-2 h-4 w-4" />{label}</Button>)}
          </div>

          {section === "vehicles" && <Card className="border-border/70 bg-card"><CardContent className="p-5 space-y-4"><div><h2 className="font-serif text-2xl">Vehicles</h2><p className="mt-1 text-sm text-muted-foreground">Choose your active approved vehicle or submit a new one from profile.</p></div>{vehicles.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No vehicles yet.</div> : vehicles.map(v => <div key={v.id} className="flex gap-3 rounded-xl border border-border/70 bg-secondary/25 p-3"><img src={v.photo_url || (v.vehicle_type === "Van" ? "/assets/executive-van-preview.png" : v.vehicle_type === "SUV" ? "/assets/luxury-suv-preview.png" : "/assets/premium-sedan-interior.png")} alt="Vehicle" className="h-20 w-28 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="font-medium truncate">{v.year} {v.make} {v.model}</div><div className="mt-1 text-sm text-muted-foreground">{v.vehicle_type} · {v.plate || "No plate"}{v.plate_state ? ` (${v.plate_state})` : ""}</div><div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={v.active ? "approved" : (v.approval_status || "pending")} />{v.driver_selected && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Active for offers</span>}</div></div>{v.active && !v.driver_selected && <Button size="sm" variant="outline" disabled={busy} onClick={() => selectVehicle(v.id)}>Use</Button>}</div>)}<Button asChild className="w-full"><Link to="/profile">Add or edit vehicles</Link></Button></CardContent></Card>}

          {section === "documents" && <Card className="border-border/70 bg-card"><CardContent className="p-5"><h2 className="font-serif text-2xl">Documents</h2><p className="mt-1 text-sm text-muted-foreground">Green means approved, yellow means pending or expiring soon, red means re-upload required.</p><div className="mt-4 space-y-3">{requiredDocs.map(req => { const doc = documents.find(d => d.document_type === req.type); const tone = docTone(doc); return <div key={req.type} className={`rounded-xl border p-4 ${tone.cls}`}><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{req.label}</div><div className="text-xs opacity-75">{doc?.expiration_date ? `Expires ${doc.expiration_date}` : "No expiration date on file"}</div></div><span className="text-xs font-medium">{tone.label}</span></div></div> })}</div><Button asChild className="mt-4 w-full"><Link to="/profile">Upload documents</Link></Button></CardContent></Card>}

          {section === "insurance" && <Card className="border-border/70 bg-card"><CardContent className="p-5"><h2 className="font-serif text-2xl">Insurance</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Atalay Limo is a marketplace and does not replace your commercial insurance responsibilities. Drivers are responsible for maintaining active insurance, including the required liability coverage for their operating area. For this MVP, the required insurance document is listed as <b className="text-[hsl(60_56%_91%)]">$1M liability coverage</b> and must be reviewed by admin before active operation.</p><Button asChild variant="outline" className="mt-4"><Link to="/profile">Review insurance document</Link></Button></CardContent></Card>}

          {section === "earnings" && <Card className="border-border/70 bg-card"><CardContent className="p-5"><h2 className="font-serif text-2xl">Earnings</h2><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-muted-foreground">Available</div><div className="font-serif text-3xl">${Number(stats.available_balance || 0).toFixed(2)}</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="font-serif text-3xl">${Number(stats.pending_balance || 0).toFixed(2)}</div></div></div><Button asChild className="mt-4 w-full"><Link to="/driver/earnings">Open full earnings</Link></Button></CardContent></Card>}

          {section === "tax" && <Card className="border-border/70 bg-card"><CardContent className="p-5"><h2 className="font-serif text-2xl">Tax info</h2><p className="mt-1 text-sm text-muted-foreground">Submit your tax profile for admin approval. This is a demo form and should be connected to a secure tax/payment provider before production.</p>{taxInfo?.status && <div className="mt-3"><StatusBadge status={taxInfo.status} /></div>}<form onSubmit={submitTax} className="mt-4 space-y-3"><SmallField label="Profile type"><select className={menuInputClass} value={taxForm.tax_profile_type} onChange={e => setTaxForm({ ...taxForm, tax_profile_type: e.target.value })}><option value="individual">Individual</option><option value="business">Business / Commercial</option></select></SmallField><SmallField label="Legal name"><input className={menuInputClass} value={taxForm.legal_name} onChange={e => setTaxForm({ ...taxForm, legal_name: e.target.value })} required /></SmallField>{taxForm.tax_profile_type === "individual" ? <SmallField label="SSN last 4"><input className={menuInputClass} maxLength={4} value={taxForm.ssn_last4 || ""} onChange={e => setTaxForm({ ...taxForm, ssn_last4: e.target.value.replace(/\D/g, "") })} required /></SmallField> : <SmallField label="EIN"><input className={menuInputClass} value={taxForm.ein || ""} onChange={e => setTaxForm({ ...taxForm, ein: e.target.value.replace(/[^0-9-]/g, "") })} required /></SmallField>}<SmallField label="Address"><input className={menuInputClass} value={taxForm.address_line1} onChange={e => setTaxForm({ ...taxForm, address_line1: e.target.value })} required /></SmallField><div className="grid grid-cols-3 gap-2"><SmallField label="City"><input className={menuInputClass} value={taxForm.city} onChange={e => setTaxForm({ ...taxForm, city: e.target.value })} required /></SmallField><SmallField label="State"><input className={menuInputClass} value={taxForm.state} onChange={e => setTaxForm({ ...taxForm, state: e.target.value.toUpperCase() })} required /></SmallField><SmallField label="ZIP"><input className={menuInputClass} value={taxForm.zip_code} onChange={e => setTaxForm({ ...taxForm, zip_code: e.target.value })} required /></SmallField></div><Button disabled={busy} className="w-full">Submit for admin approval</Button></form></CardContent></Card>}

          {section === "payout" && <Card className="border-border/70 bg-card"><CardContent className="p-5"><h2 className="font-serif text-2xl">Payout methods</h2><div className="mt-4 space-y-2">{payouts.length === 0 ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No payout methods yet.</div> : payouts.map(p => <div key={p.id} className="rounded-xl border border-border/70 bg-secondary/25 p-3"><div className="font-medium">{p.label}</div><div className="text-xs text-muted-foreground">{p.method_type === "bank" ? `${p.routing_number_masked || ""} · ${p.account_number_masked || ""}` : `${p.debit_card_brand || "Debit card"} •••• ${p.debit_card_last4}`}</div></div>)}</div><form onSubmit={addPayout} className="mt-4 space-y-3"><SmallField label="Method"><select className={menuInputClass} value={payoutForm.method_type} onChange={e => setPayoutForm({ ...payoutForm, method_type: e.target.value })}><option value="bank">Bank account</option><option value="debit_card">Instant debit card</option></select></SmallField>{payoutForm.method_type === "bank" ? <><SmallField label="Account holder"><input className={menuInputClass} value={payoutForm.account_holder_name} onChange={e => setPayoutForm({ ...payoutForm, account_holder_name: e.target.value })} /></SmallField><SmallField label="Routing number"><input className={menuInputClass} maxLength={9} value={payoutForm.routing_number} onChange={e => setPayoutForm({ ...payoutForm, routing_number: e.target.value.replace(/\D/g, "") })} /></SmallField><SmallField label="Account number"><input className={menuInputClass} value={payoutForm.account_number} onChange={e => setPayoutForm({ ...payoutForm, account_number: e.target.value.replace(/\D/g, "") })} /></SmallField></> : <><SmallField label="Debit card brand"><input className={menuInputClass} value={payoutForm.debit_card_brand} onChange={e => setPayoutForm({ ...payoutForm, debit_card_brand: e.target.value })} /></SmallField><SmallField label="Debit card last 4"><input className={menuInputClass} maxLength={4} value={payoutForm.debit_card_last4} onChange={e => setPayoutForm({ ...payoutForm, debit_card_last4: e.target.value.replace(/\D/g, "") })} /></SmallField></>}<Button disabled={busy} variant="outline" className="w-full">Save payout method</Button></form><div className="mt-5 rounded-xl border border-[hsl(42_60%_65%)]/30 bg-[hsl(42_60%_65%)]/8 p-4"><div className="font-medium">Instant payout</div><p className="mt-1 text-sm text-muted-foreground">Send available balance to a debit card. Instant payout fee: $3.25.</p><Button disabled={busy} onClick={requestInstant} className="mt-3 w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Request instant payout</Button></div></CardContent></Card>}
        </div>
      </aside>
    </div>
  );
}

export default function DriverDashboard() {
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const [driverOnline, setDriverOnline] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const { user } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBlockedMessage("");
      const [{ data: openRides }, { data: myOffers }, docsResult, vehiclesResult, earningsResult] = await Promise.all([
        api.get("/ride-requests"),
        api.get("/offers/mine"),
        api.get("/driver/documents").catch((err) => ({ data: [], error: err })),
        api.get("/vehicles/mine").catch((err) => ({ data: [], error: err })),
        api.get("/driver/earnings").catch((err) => ({ data: null, error: err })),
      ]);
      const myRideIds = new Set(myOffers.map((o) => o.ride_request_id));
      setOpen(openRides.filter((r) => !myRideIds.has(r.id)));
      setMine(myOffers);
      setDocuments(docsResult.data || []);
      setVehicles(vehiclesResult.data || []);
      setEarnings(earningsResult.data || null);
      setDriverOnline(Boolean(user?.driver_online));
    } catch (err) {
      setBlockedMessage(formatApiError(err.response?.data?.detail) || "Unable to load driver dashboard");
    } finally {
      setLoading(false);
    }
  }, [user?.driver_online]);

  const toggleOnline = async () => {
    const next = !driverOnline;
    setOnlineBusy(true);
    try {
      await api.post("/driver/availability", { online: next });
      setDriverOnline(next);
      if (next) requestLocation();
    } catch (err) {
      setBlockedMessage(formatApiError(err.response?.data?.detail) || "Could not update online status");
    } finally { setOnlineBusy(false); }
  };

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Location services are not available in this browser.");
      setLocationStatus("unsupported");
      return;
    }
    setLocationStatus("requesting");
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("granted");
      },
      (err) => {
        setLocation(null);
        setLocationStatus("denied");
        setLocationError(err?.message || "Location permission was denied. Please allow location access to use driver home.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (user?.role === "driver" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then((status) => {
        if (status.state === "granted") requestLocation();
      }).catch(() => {});
    }
  }, [user?.role, requestLocation]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Driver</div>
          <h1 className="mt-2 font-serif text-4xl tracking-tighter">Driver panel</h1>
          <p className="mt-2 text-sm text-muted-foreground">Home, earnings, inbox, and available ride requests.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={toggleOnline} disabled={onlineBusy} variant={driverOnline ? "default" : "outline"} className={`rounded-xl ${driverOnline ? "bg-emerald-500/90 text-white hover:bg-emerald-500" : "border-orange-500/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"}`}>
            {driverOnline ? "Online" : "Go online"}
          </Button>
          <Button asChild variant="outline" className="rounded-xl border-white/15 bg-transparent"><Link to="/profile">Profile</Link></Button>
          <Button asChild className="rounded-xl bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]"><Link to="/driver/earnings"><Banknote className="mr-2 h-4 w-4" /> Earnings</Link></Button>
          <Button variant="outline" onClick={() => setMenuOpen(true)} className="rounded-xl border-white/15 bg-transparent"><Menu className="mr-2 h-4 w-4" /> Menu</Button>
        </div>
      </div>

      {!user?.admin_approved && (
        <Card className="mb-6 border-orange-500/30 bg-orange-500/10">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-orange-200">
            <ShieldAlert className="mt-0.5 h-5 w-5" />
            <div><div className="font-medium">Pending admin approval</div><div className="mt-1 text-orange-200/80">You can sign in, but you cannot submit offers until admin approves your driver account, required documents, and at least one vehicle.</div></div>
          </CardContent>
        </Card>
      )}
      {blockedMessage && <div className="mb-4 text-sm text-orange-300">{blockedMessage}</div>}
      <Card className="mb-6 border-border/70 bg-card">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <b className="text-[hsl(60_56%_91%)]">Schedule rule:</b> if you have a confirmed scheduled ride, you must be online at least 1 hour before pickup or the ride can be auto-cancelled and added to your cancellation rate.
        </CardContent>
      </Card>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "home"}>
        <TabsList className="border border-border/60 bg-secondary">
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="home" className="mt-6">
          <DriverHome user={user} open={open} mine={mine} documents={documents} loading={loading} location={location} locationStatus={locationStatus} locationError={locationError} onRequestLocation={requestLocation} refresh={load} />
        </TabsContent>

        <TabsContent value="earnings" className="mt-6">
          <EarningsSummary mine={mine} />
        </TabsContent>

        <TabsContent value="inbox" className="mt-6">
          <DriverInbox />
        </TabsContent>
      </Tabs>
      <DriverAccountMenu open={menuOpen} onClose={() => setMenuOpen(false)} user={user} documents={documents} vehicles={vehicles} earnings={earnings} refresh={load} />
    </div>
  );
}
