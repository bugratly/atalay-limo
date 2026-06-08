import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { Users, Car, Receipt, CheckCircle2, LifeBuoy, MessageCircle, ShieldCheck, FileText, Activity } from "lucide-react";
import { toast } from "sonner";
import { getMakeOptions, getModelsForMake, getVehicleCatalogMatch, inferVehicleTypeFromCatalog, VEHICLE_MIN_YEAR_US } from "@/data/vehicleCatalog";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[hsl(60_56%_91%)]";
const VEHICLES = ["Sedan", "SUV", "Luxury", "Van"];

function Stat({ label, value, icon: Icon }) {
  return (
    <Card className="bg-card border-border/70"><CardContent className="p-5 flex items-center gap-4"><div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center"><Icon className="w-5 h-5 text-[hsl(60_56%_91%)]" /></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="font-serif text-2xl">{value ?? 0}</div></div></CardContent></Card>
  );
}

function Field({ label, children }) {
  return <label className="block text-xs uppercase tracking-wider text-muted-foreground space-y-1">{label}{children}</label>;
}

function toNum(v) { return v === "" || v === null || v === undefined ? null : Number(v); }


function AdminAccountManagement({ users, onRefresh }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadOverview = useCallback(async (uid = selectedUserId) => {
    if (!uid) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/users/${uid}/overview`);
      setOverview(data);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => { if (selectedUserId) loadOverview(selectedUserId); }, [selectedUserId, loadOverview]);

  const updateCustomerPayment = async (pm) => {
    const label = window.prompt("Payment label", pm.label || "");
    if (label === null) return;
    const card_brand = window.prompt("Card brand", pm.card_brand || "Card");
    if (card_brand === null) return;
    const card_last4 = window.prompt("Card last 4", pm.card_last4 || "");
    if (card_last4 === null) return;
    const status = window.prompt("Status: active / inactive / needs_review", pm.status || "active") || pm.status || "active";
    await api.patch(`/admin/customer-payment-methods/${pm.id}`, { label, card_brand, card_last4, status });
    toast.success("Payment method updated");
    loadOverview(); onRefresh?.();
  };

  const updatePayoutMethod = async (pm) => {
    const label = window.prompt("Payout method label", pm.label || "");
    if (label === null) return;
    const status = window.prompt("Status: active / inactive / needs_review", pm.status || "active") || pm.status || "active";
    await api.patch(`/admin/payout-methods/${pm.id}`, { label, status });
    toast.success("Payout method updated");
    loadOverview(); onRefresh?.();
  };

  const reviewTax = async (tax, status) => {
    const admin_note = window.prompt(`Admin note for tax ${status}`, tax.admin_note || "") || "";
    await api.post(`/admin/tax-info/${tax.id}/status`, { status, admin_note });
    toast.success(`Tax info marked ${status}`);
    loadOverview(); onRefresh?.();
  };

  const reviewPayout = async (request, status) => {
    const admin_note = window.prompt(`Admin note for payout ${status}`, request.admin_note || "") || "";
    await api.post(`/admin/payout-requests/${request.id}/status`, { status, admin_note });
    toast.success(`Payout request marked ${status}`);
    loadOverview(); onRefresh?.();
  };

  const reviewDoc = async (doc, status) => {
    const admin_note = window.prompt(`Admin note for document ${status}`, doc.admin_note || "") || "";
    await api.post(`/admin/driver-documents/${doc.id}/status`, { status, admin_note });
    toast.success(`Document marked ${status}`);
    loadOverview(); onRefresh?.();
  };

  const updateVehicleAdmin = async (v) => {
    const plate = window.prompt("Plate", v.plate || "");
    if (plate === null) return;
    const plate_state = window.prompt("Plate state", v.plate_state || "MA");
    if (plate_state === null) return;
    const active = window.confirm("Approve/keep active? OK = active, Cancel = pending/inactive");
    await api.patch(`/admin/vehicles/${v.id}`, { plate, plate_state, active });
    toast.success("Vehicle updated");
    loadOverview(); onRefresh?.();
  };

  const user = overview?.user;
  const stats = overview?.stats || {};
  const dist = stats.rating_distribution || {};
  const ratingColorClass = stats.rating_color === "yellow" ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" : stats.rating_color === "green" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : "text-muted-foreground border-border bg-secondary/40";

  return (
    <div className="grid lg:grid-cols-[0.35fr_0.65fr] gap-6">
      <Card className="bg-card border-border/70"><CardContent className="p-5 space-y-4">
        <h2 className="font-serif text-2xl">Account control</h2>
        <p className="text-sm text-muted-foreground">Admin can open customer or driver accounts and review private payment, vehicle, tax, payout, document, and rating details.</p>
        <Field label="Select account"><select className={inputClass} value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}><option value="">Choose customer or driver</option>{users.filter(u => ["customer","driver"].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.role.toUpperCase()} · {u.name} · {u.email}</option>)}</select></Field>
        {loading && <div className="text-sm text-muted-foreground">Loading account...</div>}
      </CardContent></Card>

      {!user ? <Card className="bg-card border-border/70"><CardContent className="p-6 text-muted-foreground">Select an account to see admin-only controls.</CardContent></Card> : <div className="space-y-6">
        <Card className="bg-card border-border/70"><CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4"><div className="w-16 h-16 rounded-full bg-secondary border border-border/70 flex items-center justify-center text-2xl text-muted-foreground">{(user.name || "A").slice(0,1).toUpperCase()}</div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">{user.role} account</div><h3 className="font-serif text-3xl">{user.name}</h3><div className="text-sm text-muted-foreground">{user.email} · {user.phone || "No phone"}</div></div></div>
            <div className={`rounded-xl border px-4 py-3 ${ratingColorClass}`}><div className="text-xs uppercase tracking-wider">Rating</div><div className="text-2xl font-semibold">{stats.rating ?? "New"}</div><div className="text-xs">from {stats.rating_count || 0} ratings · {stats.completed_trips || 0} completed trips</div></div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-5 text-sm"><div className="rounded-lg border border-border/60 p-3"><div className="text-muted-foreground text-xs uppercase">Member for</div><div>{stats.member_years ?? 0} years</div></div><div className="rounded-lg border border-border/60 p-3"><div className="text-muted-foreground text-xs uppercase">Languages</div><div>{(stats.languages || ["English"]).join(", ")}</div></div><div className="rounded-lg border border-border/60 p-3"><div className="text-muted-foreground text-xs uppercase">Rating breakdown</div><div>5★ {dist["5"] || 0} · 4★ {dist["4"] || 0} · 3★ {dist["3"] || 0} · 2★ {dist["2"] || 0} · 1★ {dist["1"] || 0}</div></div></div>
        </CardContent></Card>

        <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Private rating details</h3><div className="space-y-2">{(overview.rating_rows || []).length === 0 && <div className="text-sm text-muted-foreground">No rating details yet.</div>}{(overview.rating_rows || []).map(r => <div key={`${r.booking_id}-${r.rating}`} className="rounded-lg border border-border/60 p-3 text-sm"><div className="flex justify-between"><b>{r.rating}★ from {r.rated_by_name || "User"}</b><span className="text-muted-foreground">Ride #{r.ride_number || "—"}</span></div>{r.comment && <div className="text-muted-foreground mt-1">“{r.comment}”</div>}</div>)}</div></CardContent></Card>

        {(overview.driver_performance || overview.customer_risk) && <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Risk / performance score</h3>{overview.driver_performance && <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm"><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Acceptance</div><b>{overview.driver_performance.acceptance_rate}%</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Cancellation</div><b>{overview.driver_performance.cancellation_rate}%</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">No-show</div><b>{overview.driver_performance.no_show_count}</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Late</div><b>{overview.driver_performance.late_count}</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Complaints</div><b>{overview.driver_performance.complaint_count}</b></div></div>}{overview.customer_risk && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Risk</div><b>{overview.customer_risk.risk_level}</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Cancels</div><b>{overview.customer_risk.cancellation_count}</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">No-show</div><b>{overview.customer_risk.no_show_count}</b></div><div className="rounded-lg border border-border/60 p-3"><div className="text-xs text-muted-foreground">Disputes</div><b>{overview.customer_risk.dispute_count}</b></div></div>}</CardContent></Card>}

        {user.role === "customer" && <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Customer payment methods</h3><div className="space-y-2">{(overview.payment_methods || []).length === 0 && <div className="text-sm text-muted-foreground">No saved cards.</div>}{(overview.payment_methods || []).map(pm => <div key={pm.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3 text-sm"><div><b>{pm.label || pm.card_brand || "Card"}</b><div className="text-muted-foreground">{pm.card_brand || "Card"} ending {pm.card_last4 || "••••"} · {pm.status || "active"}</div><div className="text-xs text-muted-foreground">Last edited by {pm.updated_by_admin_name || "—"}</div></div><Button size="sm" variant="outline" onClick={() => updateCustomerPayment(pm)}>Edit</Button></div>)}</div></CardContent></Card>}

        {user.role === "driver" && <>
          <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Vehicles</h3><div className="space-y-2">{(overview.vehicles || []).map(v => <div key={v.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3 text-sm"><div><b>{v.year || ""} {v.make} {v.model}</b><div className="text-muted-foreground">{v.vehicle_type} · {v.plate || "No plate"} {v.plate_state ? `(${v.plate_state})` : ""} · {v.livery_plate ? "Livery plate" : "Regular plate"} · {v.active ? "Approved/active" : "Pending/inactive"}</div><div className="text-xs text-muted-foreground">Last edited by {v.updated_by_admin_name || "—"}</div></div><Button size="sm" variant="outline" onClick={() => updateVehicleAdmin(v)}>Review/Edit</Button></div>)}</div></CardContent></Card>

          <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Documents</h3><div className="space-y-2">{(overview.documents || []).map(d => <div key={d.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3 text-sm"><div><b>{d.document_name}</b><div className="text-muted-foreground">{d.document_type} · {d.status} · expires {d.expiration_date || "—"}</div><div className="text-xs text-muted-foreground">Reviewed by {d.reviewed_by_admin_name || "—"}</div></div><div className="flex gap-2"><Button size="sm" onClick={() => reviewDoc(d, "approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewDoc(d, "expired")}>Expire</Button><Button size="sm" variant="outline" onClick={() => reviewDoc(d, "rejected")}>Reject</Button></div></div>)}</div></CardContent></Card>

          <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Tax number info</h3>{!overview.tax_info ? <div className="text-sm text-muted-foreground">No tax info submitted.</div> : <div className="rounded-lg border border-border/60 p-3 text-sm"><div><b>{overview.tax_info.legal_name}</b> · {overview.tax_info.tax_profile_type} · {overview.tax_info.status}</div><div className="text-muted-foreground">SSN last 4: {overview.tax_info.ssn_last4 || "—"} · EIN: {overview.tax_info.ein || "—"}</div><div className="text-muted-foreground">{overview.tax_info.address_line1} {overview.tax_info.address_line2 || ""}, {overview.tax_info.city}, {overview.tax_info.state} {overview.tax_info.zip_code}</div><div className="text-xs text-muted-foreground mt-1">Reviewed by {overview.tax_info.reviewed_by_admin_name || "—"}</div><div className="flex gap-2 mt-3"><Button size="sm" onClick={() => reviewTax(overview.tax_info, "approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewTax(overview.tax_info, "rejected")}>Reject</Button></div></div>}</CardContent></Card>

          <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Bank / payout methods</h3><div className="space-y-2">{(overview.payout_methods || []).map(pm => <div key={pm.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3 text-sm"><div><b>{pm.label}</b><div className="text-muted-foreground">{pm.method_type === "bank" ? `Routing ${pm.routing_number_masked || "****"} · Account ${pm.account_number_masked || "****"}` : `${pm.debit_card_brand || "Debit"} ending ${pm.debit_card_last4 || "••••"}`} · {pm.status}</div><div className="text-xs text-muted-foreground">Last edited by {pm.updated_by_admin_name || "—"}</div></div><Button size="sm" variant="outline" onClick={() => updatePayoutMethod(pm)}>Edit</Button></div>)}</div></CardContent></Card>

          <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Instant payout requests</h3><div className="space-y-2">{(overview.payout_requests || []).length === 0 && <div className="text-sm text-muted-foreground">No payout requests.</div>}{(overview.payout_requests || []).map(pr => <div key={pr.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3 text-sm"><div><b>${pr.net_amount?.toFixed?.(2) || pr.net_amount} net</b><div className="text-muted-foreground">Gross ${pr.gross_amount} · instant fee ${pr.instant_fee} · {pr.status}</div><div className="text-xs text-muted-foreground">Reviewed by {pr.reviewed_by_admin_name || "—"}</div></div><div className="flex gap-2"><Button size="sm" onClick={() => reviewPayout(pr, "approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewPayout(pr, "paid")}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => reviewPayout(pr, "rejected")}>Reject</Button></div></div>)}</div></CardContent></Card>
        </>}

        <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Ride history</h3><div className="space-y-2">{(overview.ride_history || []).slice(0, 10).map(b => <div key={b.id} className="rounded-lg border border-border/60 p-3 text-sm flex justify-between gap-3"><div><b>Ride #{b.ride_number || "—"}</b><div className="text-muted-foreground">{b.pickup_address} → {b.dropoff_address}</div></div><div className="text-right"><div>{b.status}</div><div className="text-muted-foreground">${b.customer_total_with_tax || b.price || 0}</div></div></div>)}</div></CardContent></Card>

        <Card className="bg-card border-border/70"><CardContent className="p-5"><h3 className="font-serif text-2xl mb-3">Admin log for this account</h3><div className="space-y-2">{(overview.audit_logs || []).length === 0 && <div className="text-sm text-muted-foreground">No admin log yet.</div>}{(overview.audit_logs || []).map(l => <div key={l.id} className="rounded-lg border border-border/60 p-3 text-sm"><b>{l.action}</b><div className="text-muted-foreground">By {l.admin_name || l.admin_email || "Admin"} · {l.created_at}</div></div>)}</div></CardContent></Card>
      </div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [support, setSupport] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [driverDocuments, setDriverDocuments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [dispatchBoard, setDispatchBoard] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [vehicleForm, setVehicleForm] = useState({ driver_id: "", vehicle_type: "SUV", year: "2024", make: "", model: "", color: "Black", plate: "", seats: "", luggage_capacity: "", photo_url: "", active: true });
  const [userDraft, setUserDraft] = useState(null);
  const [rideDraft, setRideDraft] = useState(null);
  const [rideLookup, setRideLookup] = useState("");
  const [rideLookupResult, setRideLookupResult] = useState(null);

  const loadAll = useCallback(async () => {
    const [s, u, r, b, sm, v, c, docs, logs, board, disp, adj] = await Promise.all([
      api.get("/admin/stats"), api.get("/admin/users"), api.get("/ride-requests"), api.get("/bookings"), api.get("/admin/support"), api.get("/admin/vehicles"), api.get("/admin/conversations"), api.get("/admin/driver-documents"), api.get("/admin/audit-logs"), api.get("/admin/dispatch-board"), api.get("/admin/disputes"), api.get("/admin/adjustment-requests"),
    ]);
    setStats(s.data); setUsers(u.data); setRides(r.data); setBookings(b.data); setSupport(sm.data); setVehicles(v.data); setConversations(c.data); setDriverDocuments(docs.data || []); setAuditLogs(logs.data || []); setDispatchBoard(board.data || null); setDisputes(disp.data || []); setAdjustments(adj.data || []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const drivers = useMemo(() => users.filter((u) => u.role === "driver"), [users]);
  const approvedDrivers = useMemo(() => drivers.filter((u) => u.admin_approved), [drivers]);
  const makeOptions = useMemo(() => getMakeOptions(), []);
  const modelOptions = useMemo(() => getModelsForMake(vehicleForm.make), [vehicleForm.make]);
  const selectedCatalogVehicle = useMemo(() => getVehicleCatalogMatch(vehicleForm.make, vehicleForm.model), [vehicleForm.make, vehicleForm.model]);

  const applyVehicleCatalogMatch = (nextMake, nextModel) => {
    const match = getVehicleCatalogMatch(nextMake, nextModel);
    const inferredType = inferVehicleTypeFromCatalog(match);
    return {
      vehicle_type: inferredType || vehicleForm.vehicle_type,
      seats: match?.suvEligible ? (vehicleForm.seats || "6") : (vehicleForm.seats || "3"),
      year: !vehicleForm.year || Number(vehicleForm.year) < VEHICLE_MIN_YEAR_US ? String(VEHICLE_MIN_YEAR_US) : vehicleForm.year,
    };
  };

  const approveDriver = async (id) => { await api.post(`/admin/drivers/${id}/approve`); toast.success("Driver approved"); loadAll(); };
  const rejectDriver = async (id) => { await api.post(`/admin/drivers/${id}/reject`); toast.success("Driver rejected"); loadAll(); };
  const markPaid = async (id) => { if (!window.confirm("Confirm this booking as paid? Admin can approve even if the submitted card details appear incorrect.")) return; await api.post(`/bookings/${id}/mark-paid`); toast.success("Payment confirmed"); loadAll(); };
  const cancelBooking = async (id) => { if (!window.confirm("Cancel this booking? Platform commission may still apply after confirmation.")) return; await api.post(`/admin/bookings/${id}/cancel`); toast.success("Booking cancelled"); loadAll(); };
  const cancelRide = async (id) => { if (!window.confirm("Cancel this ride request?")) return; await api.post(`/admin/ride-requests/${id}/cancel`); toast.success("Ride cancelled"); loadAll(); };
  const resolveSupport = async (id) => { await api.post(`/admin/support/${id}/resolve`); toast.success("Marked resolved"); loadAll(); };
  const reviewDocument = async (doc, status) => {
    const admin_note = window.prompt(`Optional admin note for ${status}`, doc.admin_note || "") || "";
    await api.post(`/admin/driver-documents/${doc.id}/status`, { status, admin_note });
    toast.success(`Document marked ${status}`);
    loadAll();
  };
  const searchRideNumber = async (e) => {
    e.preventDefault();
    if (!rideLookup.trim()) return;
    try {
      const { data } = await api.get(`/admin/ride-lookup/${encodeURIComponent(rideLookup.trim())}`);
      setRideLookupResult(data);
      toast.success("Ride found");
    } catch (err) {
      setRideLookupResult(null);
      toast.error(err.response?.data?.detail || "Ride not found");
    }
  };

  const saveUser = async () => {
    if (!userDraft?.id) return;
    await api.patch(`/admin/users/${userDraft.id}`, {
      name: userDraft.name,
      phone: userDraft.phone,
      age: toNum(userDraft.age),
      license_status: userDraft.license_status,
      insurance_status: userDraft.insurance_status,
      documents_last_reviewed_at: userDraft.documents_last_reviewed_at || null,
      admin_notes: userDraft.admin_notes || "",
      admin_approved: userDraft.role === "driver" ? Boolean(userDraft.admin_approved) : undefined,
      account_active: userDraft.account_active !== false,
    });
    toast.success("Account updated"); setUserDraft(null); loadAll();
  };

  const saveRide = async () => {
    if (!rideDraft?.id) return;
    await api.patch(`/admin/ride-requests/${rideDraft.id}`, {
      pickup_address: rideDraft.pickup_address,
      dropoff_address: rideDraft.dropoff_address,
      date: rideDraft.date,
      time: rideDraft.time,
      passengers: toNum(rideDraft.passengers),
      luggage: toNum(rideDraft.luggage),
      vehicle_type: rideDraft.vehicle_type,
      notes: rideDraft.notes || "",
      estimated_miles: toNum(rideDraft.estimated_miles),
      estimated_minutes: toNum(rideDraft.estimated_minutes),
      pricing_mode: rideDraft.pricing_mode || "per_mile",
      round_trip: Boolean(rideDraft.round_trip),
      return_date: rideDraft.return_date || null,
      return_time: rideDraft.return_time || null,
      status: rideDraft.status,
      payment_status: rideDraft.payment_status,
    });
    toast.success("Ride request updated"); setRideDraft(null); loadAll();
  };

  const createVehicle = async (e) => {
    e.preventDefault();
    const year = toNum(vehicleForm.year);
    if (year && year < VEHICLE_MIN_YEAR_US) {
      toast.error(`Vehicle year must be ${VEHICLE_MIN_YEAR_US} or newer.`);
      return;
    }
    await api.post("/admin/vehicles", { ...vehicleForm, year, seats: toNum(vehicleForm.seats), luggage_capacity: toNum(vehicleForm.luggage_capacity) });
    toast.success("Vehicle added"); setVehicleForm({ driver_id: "", vehicle_type: "SUV", year: "2024", make: "", model: "", color: "Black", plate: "", seats: "", luggage_capacity: "", photo_url: "", active: true }); loadAll();
  };

  const updateVehicle = async (vehicle) => {
    const plate = window.prompt("Plate", vehicle.plate || "");
    if (plate === null) return;
    const photo_url = window.prompt("Vehicle photo URL", vehicle.photo_url || "");
    if (photo_url === null) return;
    const active = window.confirm("Keep this vehicle active?");
    await api.patch(`/admin/vehicles/${vehicle.id}`, { plate, photo_url, active });
    toast.success("Vehicle updated"); loadAll();
  };

  const assignDriver = async (booking) => {
    const driver_id = window.prompt("Enter approved driver ID to assign", booking.driver_id || "");
    if (!driver_id) return;
    const driverVehicles = vehicles.filter((v) => v.driver_id === driver_id && v.active);
    const vehicle_id = driverVehicles.length === 1 ? driverVehicles[0].id : window.prompt("Optional vehicle ID. Leave blank to use driver's first active vehicle.", "") || undefined;
    await api.post(`/admin/bookings/${booking.id}/assign-driver`, { driver_id, vehicle_id });
    toast.success("Driver assignment updated"); loadAll();
  };


  const overrideBooking = async (booking) => {
    const status = window.prompt("New status (leave blank to keep)", booking.status || "");
    const customer_total_with_tax = window.prompt("Customer total (leave blank to keep)", booking.customer_total_with_tax ?? "");
    const driver_payout = window.prompt("Driver payout (leave blank to keep)", booking.driver_payout ?? "");
    const platform_commission = window.prompt("Platform commission (leave blank to keep)", booking.platform_commission ?? "");
    const admin_note = window.prompt("Admin note", "") || "";
    await api.patch(`/admin/bookings/${booking.id}/override`, {
      status: status || undefined,
      customer_total_with_tax: customer_total_with_tax === "" ? undefined : Number(customer_total_with_tax),
      driver_payout: driver_payout === "" ? undefined : Number(driver_payout),
      platform_commission: platform_commission === "" ? undefined : Number(platform_commission),
      admin_note,
    });
    toast.success("Booking override saved"); loadAll();
  };

  const addFeeAdjustment = async (booking) => {
    const adjustment_type = window.prompt("Type: waiting_fee, extra_stop, cleaning_fee, smoking_fee, damage_fee, discount, refund, manual", "manual") || "manual";
    const amount = window.prompt("Amount. Use negative number for discount/refund", "0");
    if (amount === null) return;
    const note = window.prompt("Note", "") || "";
    await api.post(`/admin/bookings/${booking.id}/fee-adjustment`, { adjustment_type, amount: Number(amount), note });
    toast.success("Fee adjustment added"); loadAll();
  };

  const markNoShow = async (booking, type) => {
    const reason = window.prompt("Reason / note", "") || "";
    const fee_amount = Number(window.prompt("Fee amount (optional)", "0") || 0);
    await api.post(`/bookings/${booking.id}/no-show`, { no_show_type: type, reason, fee_amount });
    toast.success("No-show / late report saved"); loadAll();
  };

  const updateDispute = async (d, status) => {
    const resolution_note = window.prompt("Resolution note", d.resolution_note || "") || "";
    const credit_amount = Number(window.prompt("Customer credit amount", d.credit_amount || "0") || 0);
    const driver_penalty_amount = Number(window.prompt("Driver penalty amount", d.driver_penalty_amount || "0") || 0);
    await api.post(`/admin/disputes/${d.id}/status`, { status, resolution_note, credit_amount, driver_penalty_amount });
    toast.success("Dispute updated"); loadAll();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
      <div className="mb-10"><div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Admin</div><h1 className="font-serif text-4xl mt-2 tracking-tighter">Atalay Limo operations center</h1><p className="text-muted-foreground mt-2 max-w-2xl">Admin has full operational control over rides, drivers, vehicles, payments, support, and conversations.</p></div>
      {stats && <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-10"><Stat label="Users" value={stats.users} icon={Users} /><Stat label="Requests" value={stats.ride_requests} icon={Car} /><Stat label="Offers" value={stats.offers} icon={Receipt} /><Stat label="Completed" value={stats.completed} icon={CheckCircle2} /><Stat label="Open support" value={stats.support_open} icon={LifeBuoy} /><Stat label="Pending drivers" value={stats.drivers_pending} icon={ShieldCheck} /></div>}

      <Tabs defaultValue="drivers">
        <TabsList className="bg-secondary border border-border/60 flex-wrap h-auto"><TabsTrigger value="dispatch">Dispatch board</TabsTrigger><TabsTrigger value="lookup">Ride lookup</TabsTrigger><TabsTrigger value="drivers">Drivers</TabsTrigger><TabsTrigger value="accounts">Accounts</TabsTrigger><TabsTrigger value="vehicles">Vehicles</TabsTrigger><TabsTrigger value="bookings">Payments & bookings</TabsTrigger><TabsTrigger value="rides">Ride requests</TabsTrigger><TabsTrigger value="communications">Communications</TabsTrigger><TabsTrigger value="support">Support</TabsTrigger><TabsTrigger value="disputes">Disputes</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="audit">Audit log</TabsTrigger></TabsList>



        <TabsContent value="dispatch" className="mt-6">
          <div className="grid xl:grid-cols-3 gap-4">
            {Object.entries(dispatchBoard || {}).map(([status, rows]) => (
              <Card key={status} className="bg-card border-border/70 min-h-[220px]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3"><h2 className="font-serif text-xl capitalize">{status.replaceAll("_", " ")}</h2><span className="text-xs text-muted-foreground">{rows.length}</span></div>
                  <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
                    {rows.length === 0 && <div className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-4">No rides here.</div>}
                    {rows.map((b) => (
                      <div key={b.id} className="rounded-xl border border-border/60 p-3 text-sm bg-secondary/20">
                        <div className="flex items-center justify-between gap-2"><b>{b.ride_number || b.id?.slice?.(0, 8)}</b><StatusBadge status={b.status || status} /></div>
                        <div className="mt-2 text-muted-foreground line-clamp-2">{b.pickup_address} → {b.dropoff_address}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{b.date} {b.time} · {b.customer_name || "Client"} · {b.driver_name || "No driver"}</div>
                        <div className="mt-2 text-xs">Total ${Number(b.customer_total_with_tax || b.price || 0).toFixed(2)} · Payout ${Number(b.driver_payout || 0).toFixed(2)}</div>
                        {b.receipt_lines && <div className="mt-2 rounded-lg bg-black/20 p-2 text-xs space-y-1">{b.receipt_lines.map((line, i) => <div key={i} className="flex justify-between"><span>{line.label}</span><span>${Number(line.amount || 0).toFixed(2)}</span></div>)}</div>}
                        <div className="mt-3 flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => overrideBooking(b)}>Override</Button>
                          <Button size="sm" variant="outline" onClick={() => addFeeAdjustment(b)}>Fee</Button>
                          <Button size="sm" variant="outline" onClick={() => markNoShow(b, "customer_no_show")}>Customer no-show</Button>
                          <Button size="sm" variant="outline" onClick={() => markNoShow(b, "driver_no_show")}>Driver no-show</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="lookup" className="mt-6">
          <Card className="bg-card border-border/70">
            <CardContent className="p-6">
              <h2 className="font-serif text-2xl">Find a ride by ride number</h2>
              <p className="text-sm text-muted-foreground mt-1">After admin confirms payment, Atalay Limo assigns a ride number. Enter it here to view and edit the full ride details.</p>
              <form onSubmit={searchRideNumber} className="mt-5 flex gap-3 flex-wrap">
                <input className={inputClass + " max-w-sm"} value={rideLookup} onChange={(e) => setRideLookup(e.target.value.toUpperCase())} placeholder="SR-26-ABC123 or request ID" />
                <Button type="submit">Search</Button>
              </form>
              {rideLookupResult && (
                <div className="mt-6 grid lg:grid-cols-2 gap-4">
                  <Card className="bg-secondary/30 border-border/70"><CardContent className="p-5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Ride</div>
                    <div className="font-serif text-2xl mt-1">{rideLookupResult.ride?.ride_number || rideLookupResult.ride?.id?.slice(0,8)}</div>
                    <div className="mt-3 text-sm">{rideLookupResult.ride?.pickup_address} → {rideLookupResult.ride?.dropoff_address}</div>
                    <div className="text-sm text-muted-foreground mt-1">{rideLookupResult.ride?.date} {rideLookupResult.ride?.time} · {rideLookupResult.ride?.vehicle_type} · {rideLookupResult.ride?.passengers} pax</div>
                    <div className="mt-3"><StatusBadge status={rideLookupResult.ride?.status} /></div>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setRideDraft({ ...rideLookupResult.ride, passengers: rideLookupResult.ride?.passengers || "", luggage: rideLookupResult.ride?.luggage || "", estimated_miles: rideLookupResult.ride?.estimated_miles || "", estimated_minutes: rideLookupResult.ride?.estimated_minutes || "" })}>Edit ride</Button>
                      <Link to={`/ride/${rideLookupResult.ride?.id}`}><Button size="sm">Open ride</Button></Link>
                    </div>
                  </CardContent></Card>
                  <Card className="bg-secondary/30 border-border/70"><CardContent className="p-5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Booking / customer</div>
                    <div className="mt-2 text-sm">Customer: {rideLookupResult.ride?.guest_customer ? rideLookupResult.ride?.guest_name : rideLookupResult.booking?.customer_name || rideLookupResult.ride?.customer_name}</div>
                    {rideLookupResult.ride?.guest_customer && <div className="text-xs text-muted-foreground mt-1">Guest: {rideLookupResult.ride?.guest_email} · {rideLookupResult.ride?.guest_phone}</div>}
                    {rideLookupResult.booking ? <>
                      <div className="mt-3 text-sm">Driver: {rideLookupResult.booking.driver_name || "—"}</div>
                      <div className="text-sm text-muted-foreground">Total: ${Number(rideLookupResult.booking.customer_total_with_tax ?? rideLookupResult.booking.price ?? 0).toFixed(2)} · Payment: {rideLookupResult.booking.payment_status}</div>
                      <div className="mt-3"><StatusBadge status={rideLookupResult.booking.status} /></div>
                      <div className="mt-4 flex gap-2 flex-wrap">
                        {rideLookupResult.booking.status === "payment_pending" && <Button size="sm" onClick={() => markPaid(rideLookupResult.booking.id)}>Confirm paid</Button>}
                        <Button size="sm" variant="outline" onClick={() => assignDriver(rideLookupResult.booking)}>Assign driver</Button>
                        <Link to={`/messages/${rideLookupResult.booking.id}`}><Button size="sm" variant="outline">Chat</Button></Link>
                      </div>
                    </> : <div className="mt-3 text-sm text-muted-foreground">No booking yet. Offers: {rideLookupResult.offers?.length || 0}</div>}
                  </CardContent></Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drivers" className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <Card className="bg-card border-border/70 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Driver</th><th className="text-left p-3">Contact</th><th className="text-left p-3">Documents</th><th className="text-left p-3">Last active</th><th className="text-left p-3">Approval</th><th className="text-left p-3">Action</th></tr></thead><tbody>{drivers.map((d) => <tr key={d.id} className="border-t border-border/60"><td className="p-3"><button className="text-left hover:underline" onClick={() => setUserDraft({ ...d, age: d.age || "" })}>{d.name}</button><div className="text-xs text-muted-foreground">ID: {d.id.slice(0,8)} · Age {d.age || "—"}</div></td><td className="p-3 text-muted-foreground">{d.email}<br />{d.phone || "—"}</td><td className="p-3 text-xs">License: {d.license_status || "not_uploaded"}<br />Insurance: {d.insurance_status || "not_uploaded"}</td><td className="p-3 text-muted-foreground">{d.last_active_at ? new Date(d.last_active_at).toLocaleString() : "—"}</td><td className="p-3"><StatusBadge status={d.admin_approved ? "approved" : "driver_pending"} /></td><td className="p-3"><div className="flex gap-2 flex-wrap"><Button size="sm" onClick={() => approveDriver(d.id)}>Approve</Button><Button size="sm" variant="outline" onClick={() => rejectDriver(d.id)}>Reject</Button></div></td></tr>)}</tbody></table></Card>
          <Card className="bg-card border-border/70"><CardContent className="p-5"><h2 className="font-serif text-2xl mb-3">Driver profile editor</h2>{!userDraft ? <p className="text-muted-foreground text-sm">Select a driver to review name, age, documents, insurance, activity, and internal notes.</p> : <div className="space-y-3"><Field label="Name"><input className={inputClass} value={userDraft.name || ""} onChange={(e) => setUserDraft({ ...userDraft, name: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Age"><input className={inputClass} value={userDraft.age || ""} onChange={(e) => setUserDraft({ ...userDraft, age: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Phone"><input className={inputClass} value={userDraft.phone || ""} onChange={(e) => setUserDraft({ ...userDraft, phone: e.target.value })} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="License"><select className={inputClass} value={userDraft.license_status || "not_uploaded"} onChange={(e) => setUserDraft({ ...userDraft, license_status: e.target.value })}>{["not_uploaded","pending","approved","rejected","expired"].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Insurance"><select className={inputClass} value={userDraft.insurance_status || "not_uploaded"} onChange={(e) => setUserDraft({ ...userDraft, insurance_status: e.target.value })}>{["not_uploaded","pending","approved","rejected","expired"].map(x => <option key={x}>{x}</option>)}</select></Field></div><Field label="Documents reviewed date"><input className={inputClass} type="date" value={userDraft.documents_last_reviewed_at || ""} onChange={(e) => setUserDraft({ ...userDraft, documents_last_reviewed_at: e.target.value })} /></Field><Field label="Admin notes"><textarea className={inputClass} rows={4} value={userDraft.admin_notes || ""} onChange={(e) => setUserDraft({ ...userDraft, admin_notes: e.target.value })} /></Field><div className="flex gap-4 text-sm"><label><input type="checkbox" checked={Boolean(userDraft.admin_approved)} onChange={(e) => setUserDraft({ ...userDraft, admin_approved: e.target.checked })} /> Approved</label><label><input type="checkbox" checked={userDraft.account_active !== false} onChange={(e) => setUserDraft({ ...userDraft, account_active: e.target.checked })} /> Active</label></div><div className="flex gap-2"><Button onClick={saveUser}>Save account</Button><Button variant="outline" onClick={() => setUserDraft(null)}>Close</Button></div></div>}</CardContent></Card>
        </TabsContent>


        <TabsContent value="accounts" className="mt-6"><AdminAccountManagement users={users} onRefresh={loadAll} /></TabsContent>

        <TabsContent value="vehicles" className="mt-6 grid lg:grid-cols-[0.85fr_1.15fr] gap-6"><Card className="bg-card border-border/70"><CardContent className="p-5"><h2 className="font-serif text-2xl mb-4">Add vehicle</h2><form onSubmit={createVehicle} className="space-y-3"><Field label="Approved driver"><select required className={inputClass} value={vehicleForm.driver_id} onChange={(e) => setVehicleForm({ ...vehicleForm, driver_id: e.target.value })}><option value="">Select driver</option>{approvedDrivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.email}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Type"><select className={inputClass} value={vehicleForm.vehicle_type} onChange={(e) => { const type = e.target.value; setVehicleForm({ ...vehicleForm, vehicle_type: type, make: type === "Van" ? "Other" : vehicleForm.make, model: type === "Van" ? "" : vehicleForm.model, seats: type === "Van" ? (vehicleForm.seats || "9") : vehicleForm.seats }); }}>{VEHICLES.map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Year"><input className={inputClass} type="number" min={VEHICLE_MIN_YEAR_US} value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value.replace(/\D/g, "") })} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Make"><input required className={inputClass} list="vehicle-make-options" placeholder="Start typing, e.g. Cad... or choose Other" value={vehicleForm.make} onChange={(e) => { const make = e.target.value; const models = getModelsForMake(make); const nextModel = models.includes(vehicleForm.model) ? vehicleForm.model : ""; setVehicleForm({ ...vehicleForm, make, model: nextModel }); }} /><datalist id="vehicle-make-options">{makeOptions.map((make) => <option key={make} value={make} />)}</datalist></Field><Field label="Model"><input required className={inputClass} list="vehicle-model-options" placeholder={vehicleForm.make ? "Start typing model" : "Select make first"} value={vehicleForm.model} onChange={(e) => { const model = e.target.value; setVehicleForm({ ...vehicleForm, model, ...applyVehicleCatalogMatch(vehicleForm.make, model) }); }} /><datalist id="vehicle-model-options">{modelOptions.map((model) => <option key={model} value={model} />)}</datalist></Field></div>{selectedCatalogVehicle && <div className="rounded-lg border border-[hsl(42_60%_65%)]/25 bg-[hsl(42_60%_65%)]/8 p-3 text-xs text-muted-foreground"><div className="font-medium text-[hsl(60_56%_91%)]">Catalog match: {selectedCatalogVehicle.make} {selectedCatalogVehicle.model}</div><div>Minimum year adjusted to {VEHICLE_MIN_YEAR_US} · SUV eligible: {selectedCatalogVehicle.suvEligible ? "Yes" : "No"} · Suggested type: {selectedCatalogVehicle.suvEligible ? "SUV" : "Luxury"}</div></div>}{vehicleForm.vehicle_type === "Van" && <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">Van vehicles are entered manually. Use <span className="text-[hsl(60_56%_91%)]">Other</span> for make if the exact vehicle is not in the catalog.</div>}<div className="grid grid-cols-2 gap-3"><Field label="Color"><input className={inputClass} value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} /></Field><Field label="Plate"><input className={inputClass} value={vehicleForm.plate} onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value.toUpperCase() })} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Seats"><input className={inputClass} value={vehicleForm.seats} onChange={(e) => setVehicleForm({ ...vehicleForm, seats: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Luggage"><input className={inputClass} value={vehicleForm.luggage_capacity} onChange={(e) => setVehicleForm({ ...vehicleForm, luggage_capacity: e.target.value.replace(/\D/g, "") })} /></Field></div><Field label="Vehicle photo URL"><input className={inputClass} placeholder="/assets/luxury-suv-preview.png or uploaded image URL" value={vehicleForm.photo_url} onChange={(e) => setVehicleForm({ ...vehicleForm, photo_url: e.target.value })} /></Field><Button type="submit">Add vehicle</Button></form></CardContent></Card><Card className="bg-card border-border/70 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Driver</th><th className="text-left p-3">Vehicle</th><th className="text-left p-3">Type</th><th className="text-left p-3">Plate</th><th className="text-left p-3">Active</th><th className="text-left p-3"></th></tr></thead><tbody>{vehicles.map(v => <tr key={v.id} className="border-t border-border/60"><td className="p-3">{v.driver_name}</td><td className="p-3"><div className="flex items-center gap-3"><img src={v.photo_url || (v.vehicle_type === "Van" ? "/assets/executive-van-preview.png" : v.vehicle_type === "Sedan" || v.vehicle_type === "Luxury" ? "/assets/premium-sedan-interior.png" : "/assets/luxury-suv-preview.png")} alt="Vehicle" className="h-10 w-16 rounded-md object-cover border border-border/60 bg-black/30" /><span>{v.year || ""} {v.make} {v.model} {v.color ? `· ${v.color}` : ""}</span></div></td><td className="p-3">{v.vehicle_type}</td><td className="p-3 text-muted-foreground">{v.plate || "—"}</td><td className="p-3">{v.active ? "Yes" : "No"}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => updateVehicle(v)}>Quick edit</Button></td></tr>)}</tbody></table></Card></TabsContent>

        <TabsContent value="bookings" className="mt-6"><Card className="bg-card border-border/70 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Ride #</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Driver</th><th className="text-left p-3">Total</th><th className="text-left p-3">Status</th><th className="text-left p-3">Payment</th><th className="text-left p-3">Actions</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id} className="border-t border-border/60"><td className="p-3 font-medium">{b.ride_number || "—"}</td><td className="p-3">{b.customer_name}</td><td className="p-3">{b.driver_name}<div className="text-xs text-muted-foreground">{b.driver_id?.slice?.(0,8)}</div></td><td className="p-3">${(b.customer_total_with_tax ?? b.price).toFixed(2)}</td><td className="p-3"><StatusBadge status={b.status} /></td><td className="p-3">{b.payment_status}{b.payment_card_last5 && <div className="text-xs text-muted-foreground">Card *****{b.payment_card_last5}</div>}</td><td className="p-3 flex gap-2 flex-wrap">{["payment_pending","pending"].includes(b.status) && <Button size="sm" onClick={() => markPaid(b.id)}>Confirm paid</Button>}<Button size="sm" variant="outline" onClick={() => assignDriver(b)}>Assign driver</Button><Button size="sm" variant="outline" onClick={() => cancelBooking(b.id)}>Cancel</Button><Link className="text-[hsl(60_56%_91%)] hover:underline" to={`/messages/${b.id}`}>Chat</Link><Link className="text-[hsl(60_56%_91%)] hover:underline" to={`/ride/${b.ride_request_id}`}>Ride</Link></td></tr>)}</tbody></table></Card></TabsContent>

        <TabsContent value="rides" className="mt-6 grid lg:grid-cols-[1.2fr_0.8fr] gap-6"><Card className="bg-card border-border/70 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Route</th><th className="text-left p-3">When</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Vehicle</th><th className="text-left p-3">Status</th><th className="text-left p-3">Actions</th></tr></thead><tbody>{rides.map(r => <tr key={r.id} className="border-t border-border/60"><td className="p-3 truncate max-w-xs">{r.pickup_address} → {r.dropoff_address}</td><td className="p-3 text-muted-foreground">{r.date} {r.time}</td><td className="p-3">{r.customer_name}</td><td className="p-3">{r.vehicle_type}</td><td className="p-3"><StatusBadge status={r.status} /></td><td className="p-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setRideDraft({ ...r, passengers: r.passengers || "", luggage: r.luggage || "", estimated_miles: r.estimated_miles || "", estimated_minutes: r.estimated_minutes || "" })}>Edit</Button><Button size="sm" variant="outline" onClick={() => cancelRide(r.id)}>Cancel</Button><Link to={`/ride/${r.id}`} className="text-[hsl(60_56%_91%)] hover:underline">View</Link></td></tr>)}</tbody></table></Card><Card className="bg-card border-border/70"><CardContent className="p-5"><h2 className="font-serif text-2xl mb-3">Ride request editor</h2>{!rideDraft ? <p className="text-muted-foreground text-sm">Select a ride to edit route, date/time, passengers, vehicle, status, and payment status.</p> : <div className="space-y-3"><Field label="Pickup"><input className={inputClass} value={rideDraft.pickup_address || ""} onChange={(e) => setRideDraft({ ...rideDraft, pickup_address: e.target.value })} /></Field><Field label="Drop-off"><input className={inputClass} value={rideDraft.dropoff_address || ""} onChange={(e) => setRideDraft({ ...rideDraft, dropoff_address: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Date"><input className={inputClass} type="date" value={rideDraft.date || ""} onChange={(e) => setRideDraft({ ...rideDraft, date: e.target.value })} /></Field><Field label="Time"><input className={inputClass} type="time" value={rideDraft.time || ""} onChange={(e) => setRideDraft({ ...rideDraft, time: e.target.value })} /></Field></div><div className="grid grid-cols-3 gap-3"><Field label="Passengers"><input className={inputClass} value={rideDraft.passengers || ""} onChange={(e) => setRideDraft({ ...rideDraft, passengers: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Luggage"><input className={inputClass} value={rideDraft.luggage || ""} onChange={(e) => setRideDraft({ ...rideDraft, luggage: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Vehicle"><select className={inputClass} value={rideDraft.vehicle_type || "SUV"} onChange={(e) => setRideDraft({ ...rideDraft, vehicle_type: e.target.value })}>{VEHICLES.map(x => <option key={x}>{x}</option>)}</select></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Miles"><input className={inputClass} value={rideDraft.estimated_miles || ""} onChange={(e) => setRideDraft({ ...rideDraft, estimated_miles: e.target.value })} /></Field><Field label="Minutes"><input className={inputClass} value={rideDraft.estimated_minutes || ""} onChange={(e) => setRideDraft({ ...rideDraft, estimated_minutes: e.target.value.replace(/\D/g, "") })} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Status"><input className={inputClass} value={rideDraft.status || ""} onChange={(e) => setRideDraft({ ...rideDraft, status: e.target.value })} /></Field><Field label="Payment"><input className={inputClass} value={rideDraft.payment_status || ""} onChange={(e) => setRideDraft({ ...rideDraft, payment_status: e.target.value })} /></Field></div><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(rideDraft.round_trip)} onChange={(e) => setRideDraft({ ...rideDraft, round_trip: e.target.checked })} /> Round trip</label><div className="grid grid-cols-2 gap-3"><Field label="Return date"><input className={inputClass} type="date" value={rideDraft.return_date || ""} onChange={(e) => setRideDraft({ ...rideDraft, return_date: e.target.value })} /></Field><Field label="Return time"><input className={inputClass} type="time" value={rideDraft.return_time || ""} onChange={(e) => setRideDraft({ ...rideDraft, return_time: e.target.value })} /></Field></div><Field label="Notes"><textarea className={inputClass} rows={3} value={rideDraft.notes || ""} onChange={(e) => setRideDraft({ ...rideDraft, notes: e.target.value })} /></Field><div className="flex gap-2"><Button onClick={saveRide}>Save ride</Button><Button variant="outline" onClick={() => setRideDraft(null)}>Close</Button></div></div>}</CardContent></Card></TabsContent>

        <TabsContent value="communications" className="mt-6"><div className="mb-4 text-sm text-muted-foreground">Admin can monitor booking chats and join when needed. Admin messages are marked as Atalay Limo Admin in the chat.</div><div className="space-y-3">{conversations.map(c => <Card key={c.id} className="bg-card border-border/70"><CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap"><div><div className="font-medium">{c.customer_name} ↔ {c.driver_name}</div><div className="text-sm text-muted-foreground">{c.vehicle_type} · {c.status} · {c.message_count || 0} messages</div>{c.last_message && <div className="text-xs text-muted-foreground mt-1">Last: {c.last_message.sender_role} · {c.last_message.message}</div>}</div><Link to={`/messages/${c.id}`}><Button className="gap-2"><MessageCircle className="w-4 h-4" /> Open chat</Button></Link></CardContent></Card>)}</div></TabsContent>

        <TabsContent value="support" className="mt-6"><div className="space-y-3">{support.length === 0 ? <div className="border border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">No support conversations yet.</div> : support.map(m => <Card key={m.id} className="bg-card border-border/70"><CardContent className="p-5"><div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="font-medium">{m.user_name} <span className="text-xs text-muted-foreground uppercase">{m.user_role}</span></div><div className="text-xs text-muted-foreground">{m.user_email} · {m.user_phone || "—"}</div><div className="mt-3 font-serif text-lg">{m.subject}</div><div className="text-xs text-[hsl(42_60%_70%)] mt-1">{m.booking_id ? `Booking #${m.booking_id.slice(0,8)}` : m.ride_request_id ? `Ride request #${m.ride_request_id.slice(0,8)}` : "General support"}</div><p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{m.last_message || "No messages yet."}</p><Link to="/support" className="inline-flex mt-3 text-sm text-[hsl(60_56%_91%)] hover:underline">Open support inbox</Link></div>{m.status !== "resolved" && <Button onClick={() => resolveSupport(m.id)} size="sm" variant="outline">Mark resolved</Button>}</div></CardContent></Card>)}</div></TabsContent>



        <TabsContent value="disputes" className="mt-6">
          <div className="grid lg:grid-cols-[1fr_0.9fr] gap-6">
            <Card className="bg-card border-border/70"><CardContent className="p-5"><h2 className="font-serif text-2xl mb-4">Disputes / complaints</h2><div className="space-y-3">{disputes.length === 0 && <div className="text-sm text-muted-foreground">No disputes yet.</div>}{disputes.map(d => <div key={d.id} className="rounded-xl border border-border/60 p-4 text-sm"><div className="flex items-center justify-between"><b>{d.category}</b><StatusBadge status={d.status} /></div><div className="text-xs text-muted-foreground mt-1">By {d.created_by_name} · {d.created_by_role} · Booking {d.booking_id?.slice?.(0,8) || "—"}</div><p className="mt-2 text-muted-foreground whitespace-pre-wrap">{d.message}</p><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => updateDispute(d, "investigating")}>Investigating</Button><Button size="sm" variant="outline" onClick={() => updateDispute(d, "resolved")}>Resolve</Button><Button size="sm" variant="outline" onClick={() => updateDispute(d, "rejected")}>Reject</Button></div></div>)}</div></CardContent></Card>
            <Card className="bg-card border-border/70"><CardContent className="p-5"><h2 className="font-serif text-2xl mb-4">Adjustment requests</h2><div className="space-y-3">{adjustments.length === 0 && <div className="text-sm text-muted-foreground">No extra stop or route-change requests.</div>}{adjustments.map(a => <div key={a.id} className="rounded-xl border border-border/60 p-4 text-sm"><div className="flex items-center justify-between"><b>${Number(a.requested_amount || 0).toFixed(2)}</b><StatusBadge status={a.status} /></div><p className="mt-2 text-muted-foreground">{a.description}</p><div className="text-xs text-muted-foreground mt-1">Booking {a.booking_id?.slice?.(0,8)} · Driver {a.driver_id?.slice?.(0,8)}</div></div>)}</div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card className="bg-card border-border/70 overflow-x-auto">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4"><FileText className="w-5 h-5 text-[hsl(60_56%_91%)]" /><h2 className="font-serif text-2xl">Driver document review</h2></div>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Driver</th><th className="text-left p-3">Document</th><th className="text-left p-3">File</th><th className="text-left p-3">Expires</th><th className="text-left p-3">Status</th><th className="text-left p-3">Actions</th></tr></thead>
                <tbody>{driverDocuments.length === 0 ? <tr><td colSpan="6" className="p-8 text-center text-muted-foreground">No driver documents submitted yet.</td></tr> : driverDocuments.map((d) => (
                  <tr key={d.id} className="border-t border-border/60"><td className="p-3"><div>{d.driver_name}</div><div className="text-xs text-muted-foreground">{d.driver_email}</div></td><td className="p-3"><div className="font-medium">{d.document_name}</div><div className="text-xs text-muted-foreground">{d.document_type}</div></td><td className="p-3 text-muted-foreground">{d.file_name || "—"}</td><td className="p-3 text-muted-foreground">{d.expiration_date || "—"}</td><td className="p-3"><StatusBadge status={d.status} /></td><td className="p-3 flex gap-2 flex-wrap"><Button size="sm" onClick={() => reviewDocument(d, "approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewDocument(d, "rejected")}>Reject</Button><Button size="sm" variant="outline" onClick={() => reviewDocument(d, "expired")}>Expired</Button></td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <Card className="bg-card border-border/70 overflow-x-auto">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-[hsl(60_56%_91%)]" /><h2 className="font-serif text-2xl">Admin audit log</h2></div>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Time</th><th className="text-left p-3">Admin</th><th className="text-left p-3">Action</th><th className="text-left p-3">Target</th><th className="text-left p-3">Details</th></tr></thead>
                <tbody>{auditLogs.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-muted-foreground">No admin actions logged yet.</td></tr> : auditLogs.map((l) => (
                  <tr key={l.id} className="border-t border-border/60"><td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td><td className="p-3"><div>{l.admin_name}</div><div className="text-xs text-muted-foreground">{l.admin_email}</div></td><td className="p-3 font-medium">{l.action}</td><td className="p-3 text-muted-foreground">{l.target_type} {l.target_id?.slice?.(0, 10)}</td><td className="p-3 text-xs text-muted-foreground max-w-sm truncate">{JSON.stringify(l.details || {})}</td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
