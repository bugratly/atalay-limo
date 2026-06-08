import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { Car, CheckCircle2, Mail, Phone, ShieldCheck, UserRound, UploadCloud, ArrowRight, Star, Languages } from "lucide-react";
import { getMakeOptions, getModelsForMake, getVehicleCatalogMatch, inferVehicleTypeFromCatalog, VEHICLE_MIN_YEAR_US } from "@/data/vehicleCatalog";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[hsl(60_56%_91%)]";
const vehicleTypes = ["Sedan", "SUV", "Luxury", "Van"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const REQUIRED_DRIVER_DOCS = [
  { type: "driver_license", label: "Driver license" },
  { type: "insurance_liability_1m", label: "Insurance — $1M liability coverage" },
  { type: "car_registration", label: "Car registration" },
  { type: "vehicle_inspection", label: "Vehicle inspection" },
  { type: "tnc_inspection", label: "TNC inspection" },
];

function Field({ label, children }) {
  return <label className="block text-xs uppercase tracking-wider text-muted-foreground space-y-1">{label}{children}</label>;
}
function toNum(v) { return v === "" || v === null || v === undefined ? null : Number(v); }
function defaultVehiclePhoto(type) {
  if (type === "Van") return "/assets/executive-van-preview.png";
  if (type === "Sedan" || type === "Luxury") return "/assets/premium-sedan-interior.png";
  return "/assets/luxury-suv-preview.png";
}
function Avatar({ user, size = "xl" }) {
  const cls = size === "xl" ? "h-24 w-24 text-3xl" : "h-12 w-12 text-base";
  if (user?.profile_photo_url) return <img src={user.profile_photo_url} alt={user.name} className={`${cls} rounded-full object-cover border border-white/10 bg-secondary`} />;
  return <div className={`${cls} rounded-full border border-white/10 bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-[hsl(60_56%_91%)]/70`}><UserRound className={size === "xl" ? "h-10 w-10" : "h-5 w-5"} /></div>;
}

function RatingPill({ value, count, color }) {
  const bg = color === "green" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : color === "yellow" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200" : "border-border bg-secondary/30 text-muted-foreground";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${bg}`}>
      <Star className="h-4 w-4 fill-current" />
      <span>{value ? Number(value).toFixed(2) : "No rating"}</span>
      <span className="text-xs opacity-75">{count || 0} rating{count === 1 ? "" : "s"}</span>
    </div>
  );
}

function RatingBreakdown({ stats }) {
  const dist = stats?.rating_distribution || {};
  const total = stats?.rating_count || 0;
  return (
    <div className="space-y-2">
      {[5,4,3,2,1].map((star) => {
        const count = Number(dist[String(star)] || 0);
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="w-12">{star} star</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-[hsl(42_60%_65%)]" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", age: "", profile_photo_url: "", home_address: "", business_name: "" });
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleForm, setVehicleForm] = useState({ vehicle_type: "SUV", year: "2024", make: "", model: "", color: "Black", plate: "", plate_state: "MA", livery_plate: true, seats: "", luggage_capacity: "", photo_url: "" });
  const [vehicleBusy, setVehicleBusy] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || "", email: user.email || "", phone: user.phone || "", age: user.age || "",
      profile_photo_url: user.profile_photo_url || "", home_address: user.home_address || "", business_name: user.business_name || "",
    });
  }, [user]);

  const loadVehicles = async () => {
    if (user?.role !== "driver") return;
    const { data } = await api.get("/vehicles/mine");
    setVehicles(data || []);
  };
  useEffect(() => { loadVehicles().catch(() => {}); }, [user?.role]);
  useEffect(() => {
    api.get("/profile/stats").then(({ data }) => setStats(data)).catch(() => setStats(null));
  }, [user?.id]);

  const makeOptions = useMemo(() => getMakeOptions(), []);
  const modelOptions = useMemo(() => getModelsForMake(vehicleForm.make), [vehicleForm.make]);
  const selectedCatalogVehicle = useMemo(() => getVehicleCatalogMatch(vehicleForm.make, vehicleForm.model), [vehicleForm.make, vehicleForm.model]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const oldEmail = user.email;
      const oldPhone = user.phone;
      const payload = { ...form, age: toNum(form.age) };
      const { data } = await api.patch("/profile", payload);
      refresh(data);
      if (data.email !== oldEmail || data.phone !== oldPhone) toast.info("Email or phone changed. Verification is required again.");
      else toast.success("Profile updated");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const submitVehicle = async (e) => {
    e.preventDefault();
    const year = toNum(vehicleForm.year);
    if (year && year < VEHICLE_MIN_YEAR_US) return toast.error(`Vehicle year must be ${VEHICLE_MIN_YEAR_US} or newer.`);
    setVehicleBusy(true);
    try {
      await api.post("/driver/vehicles", {
        ...vehicleForm,
        year,
        seats: toNum(vehicleForm.seats || (vehicleForm.vehicle_type === "Van" ? 9 : "")),
        luggage_capacity: toNum(vehicleForm.luggage_capacity),
        livery_plate: Boolean(vehicleForm.livery_plate),
      });
      toast.success("Vehicle submitted for admin approval");
      setVehicleForm({ vehicle_type: "SUV", year: "2024", make: "", model: "", color: "Black", plate: "", plate_state: "MA", livery_plate: true, seats: "", luggage_capacity: "", photo_url: "" });
      await loadVehicles();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setVehicleBusy(false);
    }
  };

  const applyCatalogMatch = (make, model) => {
    const match = getVehicleCatalogMatch(make, model);
    const type = inferVehicleTypeFromCatalog(match);
    return type ? { vehicle_type: type, seats: type === "SUV" ? (vehicleForm.seats || "6") : (vehicleForm.seats || "3") } : {};
  };

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <Avatar user={user} />
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Account profile</div>
            <h1 className="font-serif text-4xl mt-2 tracking-tighter">{user.name}</h1>
            <div className="mt-2 text-sm text-muted-foreground capitalize">{user.role} account</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={user.email_verified ? "email verified" : "email pending"} />
          <StatusBadge status={user.phone_verified ? "phone verified" : "phone pending"} />
          {user.role === "driver" && <StatusBadge status={user.admin_approved ? "driver approved" : "driver pending"} />}
        </div>
      </div>


      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card className="border-border/70 bg-card md:col-span-2">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Public rating</div>
            <div className="mt-3"><RatingPill value={stats?.rating} count={stats?.rating_count} color={stats?.rating_color} /></div>
            <div className="mt-4"><RatingBreakdown stats={stats} /></div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Completed trips</div>
            <div className="mt-3 font-serif text-4xl">{stats?.completed_trips || 0}</div>
            <p className="mt-2 text-xs text-muted-foreground">Completed through Atalay Limo.</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Member profile</div>
            <div className="mt-3 text-sm text-[hsl(60_56%_91%)]">{stats?.member_years || user.member_years || 0} year{(stats?.member_years || user.member_years || 0) === 1 ? "" : "s"}</div>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Languages className="h-4 w-4" /> {(stats?.languages || user.languages || ["English"]).join(", ")}</div>
          </CardContent>
        </Card>
      </div>

      {user.role === "driver" && (
        <Card className="mb-6 border-[hsl(42_60%_65%)]/35 bg-[hsl(42_60%_65%)]/10">
          <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-serif text-2xl">Let’s get your documents ready</div>
              <p className="mt-2 text-sm text-muted-foreground">Upload your driver license, $1M liability insurance, car registration, vehicle inspection, and TNC inspection so admin can approve your account faster.</p>
            </div>
            <Button asChild className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
              <Link to="/driver?tab=documents">Gather documents <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="bg-card border-border/70">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5"><ShieldCheck className="h-5 w-5 text-[hsl(60_56%_91%)]" /><h2 className="font-serif text-2xl">Profile details</h2></div>
            <form onSubmit={saveProfile} className="space-y-4">
              <Field label="Full name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email"><input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Phone"><input required className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100/90">
                <div className="font-medium">Email and phone verification are required.</div>
                <div className="mt-1 text-amber-100/70">If you change either one, your account will ask for verification again before using protected features.</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Age"><input type="number" min="18" max="100" className={inputClass} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, "") })} /></Field>
                <Field label={user.role === "driver" ? "Business / company name" : "Company / optional"}><input className={inputClass} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></Field>
              </div>
              <Field label="Profile photo URL"><input className={inputClass} placeholder="Optional image URL" value={form.profile_photo_url} onChange={(e) => setForm({ ...form, profile_photo_url: e.target.value })} /></Field>
              <Field label="Address / notes"><textarea rows={3} className={inputClass} value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} /></Field>
              <Button disabled={saving} className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">{saving ? "Saving…" : "Save profile"}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card border-border/70">
            <CardContent className="p-6">
              <h2 className="font-serif text-2xl mb-4">Verification status</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 flex items-start gap-3"><Mail className="h-5 w-5 text-[hsl(60_56%_91%)]" /><div><div className="font-medium">Email</div><div className="text-sm text-muted-foreground mt-1">{user.email_verified ? "Verified" : "Verification required"}</div></div></div>
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 flex items-start gap-3"><Phone className="h-5 w-5 text-[hsl(60_56%_91%)]" /><div><div className="font-medium">Phone</div><div className="text-sm text-muted-foreground mt-1">{user.phone_verified ? "Verified" : "Verification required"}</div></div></div>
              </div>
              {(!user.email_verified || !user.phone_verified) && <Button asChild variant="outline" className="mt-4"><Link to="/verify">Go to verification <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
            </CardContent>
          </Card>

          {user.role === "driver" && (
            <Card className="bg-card border-border/70">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5"><Car className="h-5 w-5 text-[hsl(60_56%_91%)]" /><h2 className="font-serif text-2xl">Add vehicle for approval</h2></div>
                <p className="text-sm text-muted-foreground mb-5">Drivers can submit vehicle details here. Vehicles stay pending until an admin approves them.</p>
                <form onSubmit={submitVehicle} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Type"><select className={inputClass} value={vehicleForm.vehicle_type} onChange={(e) => { const type = e.target.value; setVehicleForm({ ...vehicleForm, vehicle_type: type, make: type === "Van" ? "Other" : vehicleForm.make, model: type === "Van" ? "" : vehicleForm.model, seats: type === "Van" ? "9" : vehicleForm.seats }); }}>{vehicleTypes.map(v => <option key={v}>{v}</option>)}</select></Field>
                    <Field label="Year"><input required type="number" min={VEHICLE_MIN_YEAR_US} className={inputClass} value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value.replace(/\D/g, "") })} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Make"><input required list="profile-vehicle-makes" className={inputClass} placeholder="Type, e.g. Toy..." value={vehicleForm.make} onChange={(e) => { const make = e.target.value; const models = getModelsForMake(make); setVehicleForm({ ...vehicleForm, make, model: models.includes(vehicleForm.model) ? vehicleForm.model : "" }); }} /><datalist id="profile-vehicle-makes">{makeOptions.map((m) => <option key={m} value={m} />)}</datalist></Field>
                    <Field label="Model"><input required list="profile-vehicle-models" className={inputClass} placeholder={vehicleForm.make ? "Type model" : "Select make first"} value={vehicleForm.model} onChange={(e) => { const model = e.target.value; setVehicleForm({ ...vehicleForm, model, ...applyCatalogMatch(vehicleForm.make, model) }); }} /><datalist id="profile-vehicle-models">{modelOptions.map((m) => <option key={m} value={m} />)}</datalist></Field>
                  </div>
                  {selectedCatalogVehicle && <div className="rounded-xl border border-[hsl(42_60%_65%)]/25 bg-[hsl(42_60%_65%)]/8 p-3 text-xs text-muted-foreground"><div className="font-medium text-[hsl(60_56%_91%)]">Catalog match: {selectedCatalogVehicle.make} {selectedCatalogVehicle.model}</div><div>US minimum year: {VEHICLE_MIN_YEAR_US} · SUV eligible: {selectedCatalogVehicle.suvEligible ? "Yes" : "No"}</div></div>}
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Color"><input className={inputClass} value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} /></Field><Field label="Plate number"><input required className={inputClass} placeholder="3723AB" value={vehicleForm.plate} onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></Field></div>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Plate state"><select required className={inputClass} value={vehicleForm.plate_state} onChange={(e) => setVehicleForm({ ...vehicleForm, plate_state: e.target.value })}>{US_STATES.map((st) => <option key={st} value={st}>{st}</option>)}</select></Field><label className="mt-6 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"><input type="checkbox" checked={vehicleForm.livery_plate} onChange={(e) => setVehicleForm({ ...vehicleForm, livery_plate: e.target.checked })} /> Livery plate</label></div>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Seats"><input className={inputClass} value={vehicleForm.seats} onChange={(e) => setVehicleForm({ ...vehicleForm, seats: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Luggage"><input className={inputClass} value={vehicleForm.luggage_capacity} onChange={(e) => setVehicleForm({ ...vehicleForm, luggage_capacity: e.target.value.replace(/\D/g, "") })} /></Field></div>
                  <Field label="Vehicle photo URL"><input className={inputClass} placeholder="Image URL or /assets/..." value={vehicleForm.photo_url} onChange={(e) => setVehicleForm({ ...vehicleForm, photo_url: e.target.value })} /></Field>
                  <Button disabled={vehicleBusy} className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]"><UploadCloud className="mr-2 h-4 w-4" />{vehicleBusy ? "Submitting…" : "Submit vehicle for approval"}</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {user.role === "driver" && (
            <Card className="bg-card border-border/70">
              <CardContent className="p-6">
                <h2 className="font-serif text-2xl mb-4">Your vehicles</h2>
                <div className="space-y-3">
                  {vehicles.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No vehicles submitted yet.</div> : vehicles.map((v) => (
                    <div key={v.id} className="rounded-xl border border-border/70 bg-secondary/25 p-4 flex gap-4">
                      <img src={v.photo_url || defaultVehiclePhoto(v.vehicle_type)} alt="Vehicle" className="h-20 w-28 rounded-lg object-cover border border-white/10 bg-black/30" />
                      <div className="min-w-0 flex-1"><div className="font-medium truncate">{v.year || ""} {v.make} {v.model}</div><div className="text-sm text-muted-foreground mt-1">{v.vehicle_type} · {v.color || "Color not set"} · {v.plate || "No plate"}{v.plate_state ? ` (${v.plate_state})` : ""}{v.livery_plate ? " · Livery plate" : ""}</div><div className="mt-2"><StatusBadge status={v.active ? "approved" : (v.approval_status || "pending")} /></div></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
