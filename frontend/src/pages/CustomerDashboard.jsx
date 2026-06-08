import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RideCard from "@/components/RideCard";
import DashboardChatPanel from "@/components/DashboardChatPanel";
import MapPreview from "@/components/MapPreview";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { toast } from "sonner";
import { Bell, BriefcaseBusiness, CalendarClock, CreditCard, Gift, History, Home, Inbox, MapPin, Menu, Navigation, Plus, Settings, Star, UserRound, Smartphone, Droplets, Handshake, Luggage, ShieldCheck, HelpCircle } from "lucide-react";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[hsl(60_56%_91%)]";
const shortcutSeed = [
  { key: "home", label: "Home", icon: Home, address: "", coords: null },
  { key: "work", label: "Work", icon: BriefcaseBusiness, address: "", coords: null },
  { key: "other", label: "Other", icon: MapPin, address: "", coords: null },
];

const charcoalCardClass = "border-border/70 bg-[hsl(222_30%_10%)]/95 shadow-xl shadow-black/20";
const softAccentClass = "text-[hsl(210_22%_82%)]";
const customerEducationCards = [
  {
    title: "Stay connected during pickup",
    kicker: "Phone ready",
    icon: Smartphone,
    image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=80",
    body: "Keep your phone nearby and charged so your chauffeur, support team, and ride updates can reach you before pickup.",
    bullets: ["Use the vehicle charger when available", "Keep notifications on until the ride starts", "Check your 4-digit ride code before the chauffeur arrives"],
  },
  {
    title: "Refreshments prepared for the ride",
    kicker: "Comfort details",
    icon: Droplets,
    image: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=80",
    body: "Your ride experience should feel calm and prepared. Complimentary water and a clean cabin are part of the premium Atalay Limo standard.",
    bullets: ["Bottled water when available", "Clean seating area before pickup", "Quiet, private, professional environment"],
  },
  {
    title: "Professional greeting and luggage help",
    kicker: "Pickup etiquette",
    icon: Luggage,
    image: "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=1200&q=80",
    body: "Your chauffeur should greet you professionally, confirm the ride, assist with bags, and help make airport or hotel pickups smooth.",
    bullets: ["Chauffeur verifies the trip before departure", "Luggage assistance at pickup and dropoff", "Support available if pickup details change"],
  },
  {
    title: "Privacy and comfort come first",
    kicker: "Premium standard",
    icon: ShieldCheck,
    image: "/assets/premium-sedan-interior.png",
    body: "Ride details, addresses, and private conversations should stay confidential. Atalay Limo is built around a quiet, respectful black-car experience.",
    bullets: ["No sharing private ride details", "Respectful, professional service", "Contact support for any concern"],
  },
];
const customerFaqs = [
  ["Will my chauffeur help with luggage?", "Yes. Your chauffeur should assist with luggage at pickup and dropoff when it is safe to do so."],
  ["How does wait time work?", "Scheduled pickups include 15 free minutes after the pickup time. Extra wait time may be added to the receipt."],
  ["How do I start a shortcut ride?", "Save Home, Work, or Other, then tap Ride to open the request screen from your current location."],
  ["Can I message support?", "Yes. Use Inbox or Support for ride, payment, or account questions."],
];
function InfoStrip({ title, children }) {
  return <div className="rounded-2xl border border-border/70 bg-[hsl(220_24%_12%)] p-5 text-sm leading-relaxed text-muted-foreground"> <div className="mb-2 font-serif text-xl text-foreground">{title}</div>{children}</div>;
}
function CustomerEducationSection() {
  return <div className="space-y-5">
    <div className="rounded-3xl border border-border/70 bg-[linear-gradient(135deg,hsl(223_34%_9%),hsl(220_24%_14%))] p-6 md:p-8">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Premium ride guide</div>
        <h2 className="mt-2 font-serif text-3xl md:text-4xl">A smoother ride starts before pickup.</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Helpful reminders, privacy notes, and service standards for a complete Atalay Limo experience.</p>
      </div>
    </div>
    {customerEducationCards.map((card) => {
      const Icon = card.icon;
      return <Card key={card.title} className={charcoalCardClass}>
        <CardContent className="grid gap-0 overflow-hidden p-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="min-h-[230px] overflow-hidden lg:min-h-[310px]"><img src={card.image} alt={card.title} className="h-full w-full object-cover opacity-90" /></div>
          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground"><Icon className={`h-4 w-4 ${softAccentClass}`} />{card.kicker}</div>
            <h3 className="mt-3 font-serif text-3xl">{card.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
            <div className="mt-5 space-y-2">{card.bullets.map((b) => <div key={b} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" />{b}</div>)}</div>
          </div>
        </CardContent>
      </Card>;
    })}
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoStrip title="Privacy & Terms">
        <ul className="space-y-2"><li>• Your personal information and trip details are treated as private.</li><li>• Drivers and customers must not move trips or payments off platform.</li><li>• Cancellation, wait time, cleaning, and damage fees may apply based on the ride record.</li><li>• Use support if anything feels wrong before, during, or after the ride.</li></ul>
      </InfoStrip>
      <Card className={charcoalCardClass}><CardContent className="p-5"><div className="mb-4 flex items-center gap-2"><HelpCircle className="h-5 w-5 text-slate-300" /><h3 className="font-serif text-xl">FAQ</h3></div><div className="divide-y divide-border/60">{customerFaqs.map(([q,a]) => <div key={q} className="py-3"><div className="font-medium">{q}</div><p className="mt-1 text-sm text-muted-foreground">{a}</p></div>)}</div></CardContent></Card>
    </div>
  </div>;
}


function loadShortcuts(user) {
  const saved = JSON.parse(localStorage.getItem(`atalay_customer_shortcuts_${user?.id || "guest"}`) || "null");
  const userHome = user?.saved_home_address || user?.home_address || "";
  const userWork = user?.saved_work_address || "";
  return shortcutSeed.map((s) => {
    const item = saved?.find((x) => x.key === s.key);
    if (item) return item;
    if (s.key === "home") return { ...s, address: userHome };
    if (s.key === "work") return { ...s, address: userWork };
    return s;
  });
}
function saveShortcuts(user, shortcuts) { localStorage.setItem(`atalay_customer_shortcuts_${user?.id || "guest"}`, JSON.stringify(shortcuts)); }
function initials(name = "") { return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "C"; }
function ratingColor(r) { return Number(r || 0) < 4.5 ? "text-yellow-200 bg-yellow-500/10 border-yellow-500/30" : "text-emerald-200 bg-emerald-500/10 border-emerald-500/30"; }
function qsForShortcut(fromCurrent, to) {
  const params = new URLSearchParams();
  if (fromCurrent) params.set("from", "current");
  if (to?.address) params.set("to", to.address);
  if (to?.coords?.lat) params.set("toLat", to.coords.lat);
  if (to?.coords?.lng) params.set("toLng", to.coords.lng);
  return `/customer/new?${params.toString()}`;
}

function HomePermissionCenter({ role = "customer", onRequestLocation }) {
  const storageKey = `atalay_${role}_home_permissions`;
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
    if (result === "granted") toast.success("Notifications enabled");
  };
  const requestLocation = () => {
    save({ location: "requested" });
    onRequestLocation?.();
  };
  const ToggleRow = ({ title, body, value, onAllow, onDeny }) => (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-[hsl(222_30%_10%)]/95 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium text-foreground">{title}</div>
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
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Permissions</div>
          <h3 className="mt-1 font-serif text-2xl">Set up your ride experience</h3>
          <p className="mt-1 text-sm text-muted-foreground">Turn on location and notifications for faster pickups, reminders, and ride updates. You can change this later.</p>
        </div>
        <ToggleRow
          title="Location access"
          body="Use your current location for Home/Work shortcuts and faster ride requests."
          value={settings.location}
          onAllow={requestLocation}
          onDeny={() => save({ location: "dismissed" })}
        />
        <ToggleRow
          title="Notifications"
          body="Get ride reminders, offer updates, driver messages, and support replies."
          value={settings.notifications}
          onAllow={requestNotifications}
          onDeny={() => save({ notifications: "denied" })}
        />
      </CardContent>
    </Card>
  );
}

function CustomerHome({ user, shortcuts, setShortcuts }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(null);
  const [locStatus, setLocStatus] = useState("idle");
  const [editingKey, setEditingKey] = useState(null);

  const requestLocation = () => {
    if (!navigator.geolocation) return toast.error("Location is not available in this browser");
    setLocStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCurrent({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocStatus("granted"); toast.success("Current location ready"); },
      (err) => { setLocStatus("denied"); toast.error(err?.message || "Location permission denied"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };
  useEffect(() => { if (navigator.permissions?.query) navigator.permissions.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") requestLocation(); }).catch(() => {}); }, []);

  const updateShortcut = (key, patch) => {
    const next = shortcuts.map((s) => s.key === key ? { ...s, ...patch } : s);
    setShortcuts(next); saveShortcuts(user, next);
  };
  const persist = async () => {
    setSaving(true);
    try {
      const home = shortcuts.find((s) => s.key === "home");
      const work = shortcuts.find((s) => s.key === "work");
      await api.patch("/customer/preferences", {
        saved_home_address: home?.address || "", saved_home_lat: home?.coords?.lat ?? null, saved_home_lng: home?.coords?.lng ?? null,
        saved_work_address: work?.address || "", saved_work_lat: work?.coords?.lat ?? null, saved_work_lng: work?.coords?.lng ?? null,
      }).catch(() => null);
      toast.success("Shortcuts saved");
    } finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <Card className="border-border/70 bg-card overflow-hidden">
      <CardContent className="p-0">
        <div className="p-6 border-b border-border/60 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Customer home</div>
            <h2 className="mt-2 font-serif text-3xl">Welcome back, {user?.name || "Client"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Save Home, Work, and Other shortcuts. Tap one to start a request from your current location.</p>
          </div>
          <Button onClick={requestLocation} className="rounded-xl bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]"><Navigation className="mr-2 h-4 w-4" /> {locStatus === "requesting" ? "Requesting…" : "Use current location"}</Button>
        </div>
        <MapPreview me={current} height={360} expandable />
      </CardContent>
    </Card>

    <HomePermissionCenter role="customer" onRequestLocation={requestLocation} />

    <div className="grid gap-4 md:grid-cols-3">
      {shortcuts.map((s) => {
        const Icon = s.icon || MapPin;
        const isReady = !!s.address;
        return <Card key={s.key} className="border-border/70 bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-secondary flex items-center justify-center"><Icon className="h-5 w-5 text-[hsl(60_56%_91%)]" /></div><div><div className="font-serif text-2xl">{s.label}</div><div className="text-xs text-muted-foreground">{isReady ? "Saved shortcut" : "Not set yet"}</div></div></div>
            <div className="mt-4 min-h-[42px] text-sm text-muted-foreground line-clamp-2">{s.address || `Add your ${s.label.toLowerCase()} address`}</div>
            {editingKey === s.key ? <div className="mt-4 space-y-3"><AddressAutocomplete value={s.address} onChange={(v) => updateShortcut(s.key, { address: v, coords: null })} onSelect={(x) => updateShortcut(s.key, { address: x.label, coords: { lat: x.lat, lng: x.lng } })} placeholder={`Search ${s.label} address`} /><Button variant="outline" onClick={() => { setEditingKey(null); persist(); }} className="w-full">Save {s.label}</Button></div> : <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setEditingKey(s.key)}>Edit</Button><Button disabled={!isReady} onClick={() => navigate(qsForShortcut(true, s))} className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Ride</Button></div>}
          </CardContent>
        </Card>;
      })}
    </div>
    <div className="flex justify-end"><Button disabled={saving} variant="outline" onClick={persist}>{saving ? "Saving…" : "Save shortcuts"}</Button></div>
    <CustomerEducationSection />
  </div>;
}

function Schedules({ rides, loading }) {
  const scheduled = rides.filter((r) => !["completed", "cancelled"].includes(r.status)).sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h2 className="font-serif text-3xl">Schedules</h2><p className="text-sm text-muted-foreground mt-1">Active scheduled requests and confirmed rides.</p></div><Button asChild><Link to="/customer/new"><Plus className="mr-2 h-4 w-4" /> New ride</Link></Button></div>
    {loading ? <div className="text-muted-foreground">Loading…</div> : scheduled.length === 0 ? <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">No active schedules yet.</div> : <div className="grid sm:grid-cols-2 gap-5">{scheduled.map((r) => <RideCard key={r.id} ride={r} />)}</div>}
  </div>;
}

function CustomerInbox() {
  const [notifications, setNotifications] = useState([]);
  useEffect(() => { api.get("/notifications").then(({ data }) => setNotifications(data || [])).catch(() => setNotifications([])); }, []);
  return <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
    <Card className="border-border/70 bg-card"><CardContent className="p-6"><div className="flex items-center gap-3 mb-5"><Inbox className="h-5 w-5 text-[hsl(60_56%_91%)]" /><h2 className="font-serif text-3xl">Inbox</h2></div><DashboardChatPanel /><div className="mt-5 rounded-xl border border-border/70 bg-secondary/25 p-4"><div className="font-medium">Private support</div><p className="mt-1 text-sm text-muted-foreground">Message Atalay Limo support about any ride, payment, reminder, or account issue.</p><Button asChild variant="outline" className="mt-3"><Link to="/support">Open support chat</Link></Button></div></CardContent></Card>
    <Card className="border-border/70 bg-card"><CardContent className="p-6"><div className="flex items-center gap-3 mb-5"><Bell className="h-5 w-5 text-[hsl(60_56%_91%)]" /><h2 className="font-serif text-2xl">Ride notifications</h2></div><div className="space-y-3 max-h-[520px] overflow-auto">{notifications.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No notifications yet.</div> : notifications.map((n) => <Link key={n.id} to={n.link || "/customer"} className="block rounded-xl border border-border/70 bg-secondary/25 p-4 hover:bg-secondary/45"><div className="flex items-center justify-between gap-3"><div className="font-medium">{n.title}</div>{!n.read && <span className="h-2 w-2 rounded-full bg-[hsl(42_60%_65%)]" />}</div><p className="mt-1 text-sm text-muted-foreground">{n.body}</p><div className="mt-2 text-xs text-muted-foreground">{n.created_at?.slice?.(0, 16)?.replace("T", " ")}</div></Link>)}</div></CardContent></Card>
  </div>;
}

function CustomerMenu({ user, rides, stats }) {
  const [section, setSection] = useState("history");
  const [payments, setPayments] = useState([]);
  const [paymentForm, setPaymentForm] = useState({ card_brand: "Visa", card_last4: "", label: "Personal card" });
  const [busy, setBusy] = useState(false);
  const completed = rides.filter((r) => r.status === "completed");
  const referralCode = user?.referral_code || `ATALAY-${String(user?.id || "000000").slice(0, 6).toUpperCase()}`;
  useEffect(() => { api.get("/customer/payment-methods").then(({ data }) => setPayments(data || [])).catch(() => setPayments([])); }, []);
  const addPayment = async (e) => { e.preventDefault(); setBusy(true); try { const { data } = await api.post("/customer/payment-methods", paymentForm); setPayments([data, ...payments]); setPaymentForm({ card_brand: "Visa", card_last4: "", label: "Personal card" }); toast.success("Payment method saved"); } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); } };
  return <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
    <aside className="space-y-3">
      <Card className="border-border/70 bg-card"><CardContent className="p-5 text-center"><div className="mx-auto h-24 w-24 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 border border-white/10 flex items-center justify-center text-2xl font-serif text-[hsl(60_56%_91%)]/80">{initials(user?.name)}</div><h2 className="mt-4 font-serif text-3xl">{user?.name}</h2><div className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm border-emerald-500/30 bg-emerald-500/10 text-emerald-200"><Star className="h-4 w-4 fill-current" /> {Number(stats?.rating || 4.78).toFixed(2)} · {stats?.rating_count || 33} ratings</div><div className="mt-3 text-sm text-muted-foreground">{stats?.completed_trips || completed.length} completed trips · {stats?.member_years || user?.member_years || 0} years</div><div className="mt-2 text-sm text-muted-foreground">Languages: {(stats?.languages || user?.languages || ["English"]).join(", ")}</div></CardContent></Card>
      {[ ["history", History, "Ride history"], ["ratings", Star, "Account ratings"], ["payments", CreditCard, "Payment methods"], ["refer", Gift, "Refer a friend"], ["notifications", Bell, "Notifications"] ].map(([k, Icon, label]) => <button key={k} onClick={() => setSection(k)} className={`w-full rounded-xl border p-4 text-left flex items-center gap-3 ${section === k ? "border-[hsl(60_56%_91%)]/40 bg-[hsl(60_56%_91%)]/10" : "border-border/70 bg-card hover:bg-secondary/40"}`}><Icon className="h-5 w-5 text-[hsl(60_56%_91%)]" /> {label}</button>)}
    </aside>
    <div>
      {section === "history" && <Card className="border-border/70 bg-card"><CardContent className="p-6"><h2 className="font-serif text-3xl mb-4">Ride history</h2>{rides.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No rides yet.</div> : <div className="grid sm:grid-cols-2 gap-4">{rides.map((r) => <RideCard key={r.id} ride={r} />)}</div>}</CardContent></Card>}
      {section === "ratings" && <Card className="border-border/70 bg-card"><CardContent className="p-6"><h2 className="font-serif text-3xl">Account ratings</h2><p className="mt-2 text-sm text-muted-foreground">Drivers see a public customer profile like “Client with {stats?.rating_count || 33} ratings.”</p><div className={`mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 ${ratingColor(stats?.rating || 4.78)}`}><Star className="h-5 w-5 fill-current" /> {Number(stats?.rating || 4.78).toFixed(2)} from {stats?.rating_count || 33} ratings</div><div className="mt-6 space-y-2">{[5,4,3,2,1].map((s, i) => { const counts = stats?.rating_distribution || {5:28,4:2,3:2,2:1,1:0}; return <div key={s} className="flex items-center gap-3 text-sm text-muted-foreground"><span className="w-16">{s} star</span><div className="h-2 flex-1 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full bg-[hsl(42_60%_65%)]" style={{width: `${Math.min(100, ((counts[s] || 0) / (stats?.rating_count || 33)) * 100)}%`}} /></div><span className="w-8 text-right">{counts[s] || 0}</span></div>})}</div></CardContent></Card>}
      {section === "payments" && <Card className="border-border/70 bg-card"><CardContent className="p-6"><h2 className="font-serif text-3xl">Payment methods</h2><div className="mt-4 space-y-2">{payments.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No saved cards yet.</div> : payments.map((p) => <div key={p.id} className="rounded-xl border border-border/70 bg-secondary/25 p-4"><div className="font-medium">{p.label}</div><div className="text-sm text-muted-foreground">{p.card_brand} •••• {p.card_last4}</div></div>)}</div><form onSubmit={addPayment} className="mt-5 grid gap-3 sm:grid-cols-3"><div><Label>Label</Label><Input value={paymentForm.label} onChange={e => setPaymentForm({...paymentForm,label:e.target.value})} /></div><div><Label>Brand</Label><Input value={paymentForm.card_brand} onChange={e => setPaymentForm({...paymentForm,card_brand:e.target.value})} /></div><div><Label>Last 4</Label><Input maxLength={4} value={paymentForm.card_last4} onChange={e => setPaymentForm({...paymentForm,card_last4:e.target.value.replace(/\D/g,"")})} required /></div><Button disabled={busy} className="sm:col-span-3">Save payment method</Button></form></CardContent></Card>}
      {section === "refer" && <Card className="border-border/70 bg-card"><CardContent className="p-6"><h2 className="font-serif text-3xl">Refer a friend</h2><p className="mt-2 text-sm text-muted-foreground">Share this code. New customers can enter it as a promo code while creating an account.</p><div className="mt-5 rounded-2xl border border-[hsl(42_60%_65%)]/30 bg-[hsl(42_60%_65%)]/10 p-6 text-center"><div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your referral code</div><div className="mt-2 font-serif text-4xl tracking-widest">{referralCode}</div><Button variant="outline" className="mt-4" onClick={() => navigator.clipboard?.writeText(referralCode)}>Copy code</Button></div></CardContent></Card>}
      {section === "notifications" && <CustomerInbox />}
    </div>
  </div>;
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(user));

  useEffect(() => { setShortcuts(loadShortcuts(user)); }, [user?.id]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, statsResult] = await Promise.all([api.get("/ride-requests"), api.get("/profile/stats").catch(() => ({ data: null }))]);
      setRides(data || []); setStats(statsResult.data || null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Customer</div><h1 className="mt-2 font-serif text-4xl tracking-tighter">Customer panel</h1><p className="mt-2 text-sm text-muted-foreground">Home shortcuts, schedules, inbox, and account menu.</p></div>
      <Button asChild className="rounded-xl bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]"><Link to="/customer/new"><Plus className="mr-2 h-4 w-4" /> New ride request</Link></Button>
    </div>
    <Tabs defaultValue="home">
      <TabsList className="border border-border/60 bg-secondary"><TabsTrigger value="home"><Home className="mr-2 h-4 w-4" />Home</TabsTrigger><TabsTrigger value="schedules"><CalendarClock className="mr-2 h-4 w-4" />Schedules</TabsTrigger><TabsTrigger value="inbox"><Inbox className="mr-2 h-4 w-4" />Inbox</TabsTrigger><TabsTrigger value="menu"><Menu className="mr-2 h-4 w-4" />Menu</TabsTrigger></TabsList>
      <TabsContent value="home" className="mt-6"><CustomerHome user={user} shortcuts={shortcuts} setShortcuts={setShortcuts} /></TabsContent>
      <TabsContent value="schedules" className="mt-6"><Schedules rides={rides} loading={loading} /></TabsContent>
      <TabsContent value="inbox" className="mt-6"><CustomerInbox /></TabsContent>
      <TabsContent value="menu" className="mt-6"><CustomerMenu user={user} rides={rides} stats={stats} /></TabsContent>
    </Tabs>
  </div>;
}
