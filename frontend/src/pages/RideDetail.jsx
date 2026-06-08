import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import MapPreview from "@/components/MapPreview";
import { toast } from "sonner";
import { Calendar, Clock, Users, Briefcase, Check, CreditCard, X, Star, Phone, ShieldCheck } from "lucide-react";
import { commissionBreakdown, recommendedPrice, roundCustomerEstimate } from "@/lib/geo";

const VEHICLES = ["Sedan", "SUV", "Luxury", "Van"];

function vehicleImageFor(type, url) {
  if (url) return url;
  if (type === "Van") return "/assets/executive-van-preview.png";
  if (type === "Sedan" || type === "Luxury") return "/assets/premium-sedan-interior.png";
  return "/assets/luxury-suv-preview.png";
}


function customerDisplayTotal(offer) {
  const raw = offer?.customer_total_with_tax ?? (offer?.price ? offer.price * 1.0625 : 0);
  return roundCustomerEstimate(raw) ?? 0;
}

function offerDealLabel(offer, recommendedPrice) {
  if (!recommendedPrice || !offer?.price) return null;
  const ratio = Number(offer.price) / Number(recommendedPrice);
  if (ratio <= 1) return { label: "Great deal", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
  if (ratio <= 1.25) return { label: "Good deal", className: "border-[hsl(60_56%_91%)]/40 bg-[hsl(60_56%_91%)]/10 text-[hsl(60_56%_91%)]" };
  return { label: "Fair deal", className: "border-orange-500/40 bg-orange-500/10 text-orange-200" };
}

function Stars({ value, count, size = "sm" }) {
  if (value == null) return <span className="text-xs text-muted-foreground">No ratings yet</span>;
  const s = size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${s} ${i <= Math.round(value) ? "fill-amber-300 text-amber-300" : "text-muted-foreground/40"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{value.toFixed(1)}{count ? ` · ${count}` : ""}</span>
    </span>
  );
}

function DriverTermsBody() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
      <p>By submitting an offer, you confirm that your quote is accurate, professional, and available for this ride request.</p>
      <p>Drivers and customers may not arrange off-platform transportation, payment, pricing, or direct booking for rides initiated through Atalay Limo.</p>
      <p>Do not share personal contact details, phone numbers, emails, payment links, or direct payment instructions before Atalay Limo confirms the booking.</p>
      <p>Submitted offers may be reviewed by Atalay Limo. If a confirmed ride is cancelled after approval, platform commission and applicable charges may still apply.</p>
      <p>Drivers are responsible for maintaining valid documents, approved vehicles, professional conduct, and timely service.</p>
      <p>Atalay Limo may review messages, offers, bookings, and account activity for safety, compliance, support, and quality control.</p>
    </div>
  );
}

export default function RideDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offerForm, setOfferForm] = useState({ price: "", vehicle_id: "", eta_minutes: "", notes: "" });
  const [vehicles, setVehicles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerTermsAccepted, setOfferTermsAccepted] = useState(false);
  const [driverTermsOpen, setDriverTermsOpen] = useState(false);
  const [booking, setBooking] = useState(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [startCode, setStartCode] = useState("");
  const [tripBusy, setTripBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/ride-requests/${id}`);
      setRide(data);
      if (user?.role === "driver" && user?.admin_approved) {
        try {
          const { data: v } = await api.get("/vehicles/mine");
          const activeVehicles = (v || []).filter((item) => item.active);
          setVehicles(activeVehicles);
          setOfferForm((f) => ({ ...f, vehicle_id: f.vehicle_id || activeVehicles?.[0]?.id || "" }));
        } catch (vehicleErr) {
          console.error("Failed to load driver vehicles:", vehicleErr);
        }
      }
      try {
        const { data: bookings } = await api.get("/bookings");
        const b = bookings.find((bk) => bk.ride_request_id === id);
        setBooking(b || null);
      } catch (err) {
        console.error("Failed to load bookings:", err);
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load ride");
    } finally {
      setLoading(false);
    }
  }, [id, user?.role, user?.admin_approved]);

  // eslint-disable-next-line
  useEffect(() => { load(); }, [load]);

  const price = parseFloat(offerForm.price || "0");
  const { commission, payout } = commissionBreakdown(price);

  const submitOffer = async (e) => {
    e.preventDefault();
    if (!offerTermsAccepted) {
      toast.error("Please accept the Terms & Conditions before submitting your offer.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/ride-requests/${id}/offers`, {
        price: parseFloat(offerForm.price),
        vehicle_id: offerForm.vehicle_id,
        eta_minutes: offerForm.eta_minutes ? parseInt(offerForm.eta_minutes) : null,
      });
      toast.success("Offer submitted");
      setOfferOpen(false);
      setOfferForm({ price: "", vehicle_id: vehicles?.[0]?.id || "", eta_minutes: "", notes: "" });
      setOfferTermsAccepted(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to submit offer");
    } finally {
      setSubmitting(false);
    }
  };

  const acceptOffer = async (offerId) => {
    try {
      const { data } = await api.post(`/offers/${offerId}/accept`);
      toast.success("Offer selected. Admin payment confirmation is required before contact details are released.");
      // Send the customer to the placeholder Payment page to complete checkout.
      if (data?.booking?.id) {
        navigate(`/payment/${data.booking.id}`);
      } else {
        load();
      }
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const markPaid = async () => {
    if (!booking) return;
    try { await api.post(`/bookings/${booking.id}/mark-paid`); toast.success("Admin confirmed payment. Customer and driver are now matched."); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const cancelRide = async () => {
    try { await api.post(`/ride-requests/${id}/cancel`); toast.success("Ride cancelled"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const completeRide = async () => {
    if (!booking) return;
    const note = window.prompt("How did the ride go? Optional note before completing:", "") || "";
    setTripBusy(true);
    try { await api.post(`/bookings/${booking.id}/complete`, { note }); toast.success("Ride marked complete. Rating screen is now available."); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setTripBusy(false); }
  };

  const tripAction = async (path, success, body = {}) => {
    if (!booking) return;
    setTripBusy(true);
    try { await api.post(`/bookings/${booking.id}/${path}`, body); toast.success(success); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setTripBusy(false); }
  };

  const cancelBookingByDriver = async () => {
    if (!booking) return;
    const reason = window.prompt("Why are you cancelling this ride? This will count toward your cancellation rate.", "") || "";
    if (!window.confirm("Cancel this ride? This will be recorded in your cancellation rate.")) return;
    await tripAction("cancel", "Ride cancelled", { reason });
  };


  const reportNoShow = async (type) => {
    if (!booking) return;
    const reason = window.prompt("Add a note for admin", "") || "";
    const fee_amount = Number(window.prompt("Fee amount if any", "0") || 0);
    try { await api.post(`/bookings/${booking.id}/no-show`, { no_show_type: type, reason, fee_amount }); toast.success("Report sent to admin"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const requestExtraStop = async () => {
    if (!booking) return;
    const description = window.prompt("Describe the extra stop / route change", "") || "";
    if (!description.trim()) return;
    const requested_amount = Number(window.prompt("Requested adjustment amount", "0") || 0);
    try { await api.post(`/bookings/${booking.id}/extra-stop-request`, { description, requested_amount }); toast.success("Adjustment request sent to admin"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const openDispute = async () => {
    if (!booking) return;
    const category = window.prompt("Category: late_driver, late_customer, no_show, overcharge, cleaning_damage, wrong_address, service_quality, other", "other") || "other";
    const message = window.prompt("Explain the issue", "") || "";
    if (!message.trim()) return;
    try { await api.post(`/disputes`, { booking_id: booking.id, ride_request_id: ride.id, category, message }); toast.success("Support/dispute sent to admin"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const submitRating = async () => {
    if (!booking) return;
    try {
      await api.post(`/bookings/${booking.id}/rate`, { rating, comment: ratingComment });
      toast.success(user?.role === "driver" ? "Thanks for rating the passenger" : "Thanks for rating your chauffeur");
      setRateOpen(false);
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (loading || !ride) return <div className="max-w-4xl mx-auto px-6 py-12 text-muted-foreground">Loading…</div>;

  const isCustomerOwner = user?.role === "customer" && ride.customer_id === user.id;
  const isDriver = user?.role === "driver";
  const isAdmin = user?.role === "admin";
  const myOffer = isDriver ? ride.offers.find((o) => o.driver_id === user.id) : null;
  const canSubmitOffer = isDriver && user?.admin_approved && !myOffer && ["open", "offer_received"].includes(ride.status);
  const isMatched = booking && ["confirmed", "to_pickup", "arrived", "in_progress", "completed"].includes(booking.status) && booking.payment_status === "paid";
  const canAcceptOffer = isCustomerOwner && ["open", "offer_received"].includes(ride.status);
  const selectedVehicle = vehicles.find((v) => v.id === offerForm.vehicle_id);
  const selectedVehicleType = selectedVehicle?.vehicle_type || ride.vehicle_type || "SUV";
  const selectedVehiclePhoto = vehicleImageFor(selectedVehicleType, selectedVehicle?.photo_url);
  const driverGuidancePrice = recommendedPrice({
    miles: ride.estimated_miles,
    minutes: ride.estimated_minutes,
    mode: ride.pricing_mode || "per_mile",
    vehicleType: selectedVehicleType,
  });
    const pickupPoint = ride.pickup_lat != null && ride.pickup_lng != null ? { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) } : null;
  const dropoffPoint = ride.dropoff_lat != null && ride.dropoff_lng != null ? { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) } : null;

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-12">
      <button data-testid="back-btn" onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground mb-6">← Back</button>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border-border/70">
            <CardContent className="p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{ride.ride_number ? `Ride ${ride.ride_number}` : `Request #${ride.id.slice(0, 8)}`}</div>
                  <h1 className="font-serif text-3xl mt-2 tracking-tight">{ride.vehicle_type} · {ride.passengers} passenger{ride.passengers > 1 ? "s" : ""}</h1>
                </div>
                <StatusBadge status={ride.status} testId="ride-detail-status" />
              </div>

              <div className="mt-8 flex items-start gap-4">
                <div className="mt-1.5 flex flex-col items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-[hsl(60_56%_91%)]" />
                  <span className="w-px flex-1 min-h-[40px] bg-border my-1" />
                  <span className="w-2.5 h-2.5 rounded-sm border border-[hsl(60_56%_91%)]" />
                </div>
                <div className="flex-1 space-y-5">
                  <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Pickup</div><div className="mt-1" data-testid="detail-pickup">{ride.pickup_address}</div></div>
                  <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Drop-off</div><div className="mt-1" data-testid="detail-dropoff">{ride.dropoff_address}</div></div>
                </div>
              </div>

              {(pickupPoint || dropoffPoint) && (
                <div className="mt-7 rounded-xl border border-border/70 bg-secondary/20 p-3">
                  <div className="flex items-center justify-between mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <span>Route map</span>
                    <span>A → B</span>
                  </div>
                  <MapPreview pickup={pickupPoint} dropoff={dropoffPoint} height={300} />
                  <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground mt-3">
                    <div><span className="text-[hsl(60_56%_91%)] font-medium">A</span> {ride.pickup_address}</div>
                    <div><span className="text-red-300 font-medium">B</span> {ride.dropoff_address}</div>
                  </div>
                </div>
              )}

              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</div><div className="mt-1">{ride.date}</div></div>
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Time</div><div className="mt-1">{ride.time}</div></div>
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Passengers</div><div className="mt-1">{ride.passengers}</div></div>
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="w-3 h-3" /> Luggage</div><div className="mt-1">{ride.luggage}</div></div>
              </div>

              {ride.notes && (<div className="mt-6 pt-6 border-t border-border/60"><div className="text-xs uppercase tracking-wider text-muted-foreground">Notes</div><p className="mt-2 text-sm text-muted-foreground">{ride.notes}</p></div>)}
            </CardContent>
          </Card>

          {/* Offers */}
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-serif text-2xl tracking-tight">Offers ({ride.offers.length})</h2>
              {isDriver && !user?.admin_approved && (
                <div className="text-sm text-orange-300">Your driver account is pending admin approval. You cannot submit offers yet.</div>
              )}
              {canSubmitOffer && (
                <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="open-submit-offer-btn" className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Submit offer</Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="font-serif text-2xl">Your private quote</DialogTitle></DialogHeader>

                    <div className="rounded-lg border border-border/70 bg-secondary/30 p-3 space-y-3" data-testid="driver-offer-route-map">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Route preview</div>
                          <div className="text-sm mt-1">Pickup to drop-off</div>
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">A → B</div>
                      </div>
                      {(pickupPoint || dropoffPoint) ? (
                        <MapPreview pickup={pickupPoint} dropoff={dropoffPoint} height={220} />
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                          Map preview will appear when pickup and drop-off coordinates are available.
                        </div>
                      )}
                      <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div><span className="text-[hsl(60_56%_91%)]">A</span> {ride.pickup_address}</div>
                        <div><span className="text-red-300">B</span> {ride.dropoff_address}</div>
                      </div>
                    </div>

                    {(ride.estimated_miles != null || ride.estimated_minutes != null || ride.recommended_price != null) && (
                      <div className="grid grid-cols-3 gap-2 mt-1" data-testid="driver-route-summary">
                        <div className="rounded-md border border-border/60 p-2.5 bg-secondary/40">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Miles</div>
                          <div className="font-serif text-base mt-0.5">{ride.estimated_miles != null ? `${ride.estimated_miles}` : "—"}</div>
                        </div>
                        <div className="rounded-md border border-border/60 p-2.5 bg-secondary/40">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</div>
                          <div className="font-serif text-base mt-0.5">{ride.estimated_minutes != null ? `${ride.estimated_minutes}m` : "—"}</div>
                        </div>
                        <div className="rounded-md border border-[hsl(60_56%_91%)]/30 p-2.5 bg-[hsl(60_56%_91%)]/5">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New driver guidance</div>
                          <div data-testid="driver-recommended-price" className="font-serif text-base mt-0.5 text-[hsl(60_56%_91%)]">
                            {driverGuidancePrice != null ? `$${driverGuidancePrice}` : "—"}
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">This guidance is only shown to drivers to help newer chauffeurs quote competitively. It changes based on the vehicle you select. Customers never see Atalay Limo's internal pricing formula.</p>

                    <form onSubmit={submitOffer} className="space-y-4 mt-2">
                      <div className="space-y-2">
                        <Label>Your offer amount (USD)</Label>
                        <Input data-testid="offer-price-input" type="number" min="1" step="0.01" required value={offerForm.price} onChange={(e) => setOfferForm({ ...offerForm, price: e.target.value })} />
                      </div>

                      <div className="rounded-md border border-border/70 p-4 space-y-2 bg-secondary/40" data-testid="offer-commission-breakdown">
                        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Your offer amount</span><span className="font-medium">${price.toFixed(2)}</span></div>
                        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Platform commission (20%)</span><span className="text-red-300" data-testid="offer-commission">-${commission.toFixed(2)}</span></div>
                        <div className="cream-line" />
                        <div className="flex items-center justify-between"><span className="font-medium">Estimated driver payout</span><span className="font-serif text-xl text-emerald-300" data-testid="offer-payout">${payout.toFixed(2)}</span></div>
                        <p className="text-[11px] text-muted-foreground">Customer checkout amount is handled separately. It does not affect your payout.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Vehicle added by admin</Label>
                          <Select value={offerForm.vehicle_id} onValueChange={(v) => setOfferForm({ ...offerForm, vehicle_id: v })}>
                            <SelectTrigger data-testid="offer-vehicle-select"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                            <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year || ""} {v.make} {v.model} · {v.vehicle_type}</SelectItem>)}</SelectContent>
                          </Select>
                          {vehicles.length === 0 && <p className="text-xs text-orange-300">Admin must approve a vehicle on your account before you can submit offers.</p>}
                          {selectedVehicle && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-black/25">
                              <img src={selectedVehiclePhoto} alt={`${selectedVehicle.make || "Vehicle"} ${selectedVehicle.model || ""}`} className="h-32 w-full object-cover" />
                              <div className="p-3 text-xs text-muted-foreground">
                                <div className="font-medium text-[hsl(60_56%_91%)]">{selectedVehicle.year || ""} {selectedVehicle.make} {selectedVehicle.model}</div>
                                <div>{selectedVehicle.color || ""} {selectedVehicle.plate ? `· Plate ${selectedVehicle.plate}` : ""}</div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>ETA (min, optional)</Label>
                          <Input data-testid="offer-eta-input" type="number" min="1" max="1440" value={offerForm.eta_minutes} onChange={(e) => setOfferForm({ ...offerForm, eta_minutes: e.target.value })} />
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-secondary/30 p-3">
                        <label className="flex items-start gap-3 text-sm cursor-pointer">
                          <input
                            data-testid="driver-offer-terms-checkbox"
                            type="checkbox"
                            checked={offerTermsAccepted}
                            onChange={(e) => setOfferTermsAccepted(e.target.checked)}
                            className="mt-1 h-4 w-4 accent-[hsl(60_56%_91%)]"
                          />
                          <span className="text-muted-foreground">
                            I accept the {" "}
                            <button type="button" onClick={() => setDriverTermsOpen(true)} className="text-[hsl(60_56%_91%)] underline underline-offset-4">
                              Terms & Conditions
                            </button>
                            .
                          </span>
                        </label>
                      </div>

                      <Button data-testid="submit-offer-btn" disabled={submitting || price < 1 || !offerForm.vehicle_id || !offerTermsAccepted} type="submit" className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)] disabled:opacity-50 disabled:cursor-not-allowed">
                        {submitting ? "Submitting…" : "Submit offer"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              {myOffer && <div className="text-sm text-muted-foreground">Your offer: <span className="text-[hsl(60_56%_91%)]">${myOffer.price}</span> · <StatusBadge status={myOffer.status === "accepted" ? "accepted_offer" : myOffer.status} /></div>}
            </div>

            {ride.offers.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg p-10 text-center text-muted-foreground">
                {isDriver ? "No offers yet — be the first." : "Awaiting offers from chauffeurs."}
              </div>
            ) : (
              <div className="space-y-3" data-testid="offers-list">
                {ride.offers.map((o) => {
                  const showAnon = !isAdmin && !(isDriver && o.driver_id === user.id);
                  const deal = !isDriver ? offerDealLabel(o, recommendedPrice({ miles: ride.estimated_miles, minutes: ride.estimated_minutes, mode: ride.pricing_mode || "per_mile", vehicleType: o.vehicle_type || ride.vehicle_type || "SUV" })) : null;
                  const customerTotal = customerDisplayTotal(o);
                  return (
                    <Card key={o.id} className={`bg-card border ${o.status === "accepted" ? "border-emerald-500/40" : "border-border/70"}`}>
                      <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
                        {!isDriver && (
                          <img
                            src={vehicleImageFor(o.vehicle_type || ride.vehicle_type, o.vehicle_photo_url)}
                            alt={o.vehicle_details || o.vehicle_type || "Vehicle"}
                            className="h-24 w-36 rounded-xl border border-border/70 object-cover bg-black/30 flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <div className="font-serif text-2xl tracking-tight" data-testid={`offer-price-${o.id}`}>${isDriver ? o.price.toFixed(2) : customerTotal.toFixed(0)}</div>
                            <div className="text-xs uppercase tracking-wider text-[hsl(60_56%_91%)]/80">{o.vehicle_type}</div>
                            {deal && <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${deal.className}`} data-testid={`offer-deal-${o.id}`}>{deal.label}</span>}
                          </div>
                          {!isDriver && <div className="text-xs text-muted-foreground mt-1">Tax included.</div>}
                          {!isDriver && (o.vehicle_details || o.vehicle_make || o.vehicle_model) && (
                            <div className="text-xs text-muted-foreground mt-1">{o.vehicle_details || `${o.vehicle_year || ""} ${o.vehicle_make || ""} ${o.vehicle_model || ""}`}</div>
                          )}
                          {o.vehicle_details && <div className="text-sm text-muted-foreground mt-1" data-testid={`offer-vehicle-details-${o.id}`}>{o.vehicle_details}</div>}
                          <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                            <Stars value={o.driver_rating} count={o.driver_rating_count} />
                            {o.completed_trips != null && <span data-testid={`offer-trips-${o.id}`}>{o.completed_trips} completed trip{o.completed_trips === 1 ? "" : "s"}</span>}
                            {o.eta_minutes && <span>ETA {o.eta_minutes} min</span>}
                            {!showAnon && o.driver_name && <span className="text-[hsl(60_56%_91%)]/80">· {o.driver_name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <StatusBadge status={o.status === "accepted" ? "accepted_offer" : o.status} />
                          {canAcceptOffer && (
                            <Button data-testid={`accept-offer-${o.id}`} onClick={() => acceptOffer(o.id)} size="sm" className="gap-1.5 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                              <Check className="w-4 h-4" /> Accept
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card className="bg-card border-border/70">
            <CardContent className="p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Booking</div>
              {booking?.ride_number && <div className="mt-1 text-sm text-[hsl(60_56%_91%)]">Ride {booking.ride_number}</div>}
              {booking ? (
                <>
                  <div className="font-serif text-3xl mt-2" data-testid="booking-price">${isDriver ? booking.price.toFixed(2) : (roundCustomerEstimate(booking.customer_total_with_tax ?? booking.price) ?? 0).toFixed(0)}</div>
                  {!isDriver && <div className="mt-1 text-xs text-muted-foreground">Tax included.</div>}
                  <div className="mt-3"><StatusBadge status={booking.status} testId="booking-status" /></div>
                  <div className="mt-2 text-xs text-muted-foreground">Payment: <span className="uppercase tracking-wider">{booking.payment_status}</span></div>

                  {/* Driver info revealed to customer after acceptance */}
                  {isCustomerOwner && isMatched && (
                    <div className="mt-5 pt-5 border-t border-border/60">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Your chauffeur</div>
                      <div className="mt-1.5 text-sm" data-testid="booking-driver-name">{booking.driver_name}</div>
                      {booking.vehicle_details && <div className="text-xs text-muted-foreground mt-0.5">{booking.vehicle_details}</div>}
                      {booking.vehicle_photo_url && <img src={booking.vehicle_photo_url} alt={booking.vehicle_details || "Assigned vehicle"} className="mt-3 h-28 w-full rounded-xl border border-border/70 object-cover bg-black/30" />}
                      {booking.driver_phone && (
                        <a href={`tel:${booking.driver_phone}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-[hsl(60_56%_91%)] hover:underline" data-testid="booking-driver-phone">
                          <Phone className="w-3.5 h-3.5" /> {booking.driver_phone}
                        </a>
                      )}
                    </div>
                  )}
                  {/* Customer info revealed to driver after acceptance */}
                  {isDriver && booking.driver_id === user.id && isMatched && (
                    <div className="mt-5 pt-5 border-t border-border/60">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Your passenger</div>
                      <div className="mt-1.5 text-sm" data-testid="booking-customer-name">{booking.customer_name}</div>
                      {booking.customer_phone && (
                        <a href={`tel:${booking.customer_phone}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-[hsl(60_56%_91%)] hover:underline" data-testid="booking-customer-phone">
                          <Phone className="w-3.5 h-3.5" /> {booking.customer_phone}
                        </a>
                      )}
                      <div className="mt-3 text-xs text-muted-foreground">Payout after 20% commission: <span className="text-emerald-300">${(booking.driver_payout || (booking.price * 0.8)).toFixed(2)}</span></div>
                    </div>
                  )}

                  {isCustomerOwner && booking.start_code && ["confirmed", "to_pickup", "arrived"].includes(booking.status) && (
                    <div className="mt-5 rounded-2xl border border-[hsl(42_60%_65%)]/35 bg-[hsl(42_60%_65%)]/10 p-4 text-center">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">4-digit ride start code</div>
                      <div className="mt-2 font-serif text-4xl tracking-[0.3em] text-[hsl(60_56%_91%)]">{booking.start_code}</div>
                      <p className="mt-2 text-xs text-muted-foreground">Give this code to the chauffeur only when you are inside and ready to start.</p>
                    </div>
                  )}

                  {isDriver && booking.driver_id === user.id && ["confirmed", "to_pickup", "arrived", "in_progress"].includes(booking.status) && (
                    <div className="mt-5 rounded-2xl border border-border/70 bg-secondary/25 p-4">
                      <div className="font-serif text-xl">Trip controls</div>
                      <p className="mt-1 text-xs text-muted-foreground">You must be online 1 hour before pickup. “To pickup point” is locked until the last 60 minutes. Passenger has the 4-digit start code.</p>
                      {booking.status === "confirmed" && <Button disabled={tripBusy} onClick={() => tripAction("on-my-way", "Marked as going to pickup")} className="mt-3 w-full">To pickup point</Button>}
                      {["confirmed", "to_pickup"].includes(booking.status) && <Button disabled={tripBusy} variant="outline" onClick={() => tripAction("arrived", "Marked arrived")} className="mt-2 w-full">I arrived</Button>}
                      {["confirmed", "to_pickup", "arrived"].includes(booking.status) && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Input placeholder="Customer 4-digit code" value={startCode} onChange={(e)=>setStartCode(e.target.value.replace(/\D/g, "").slice(0,4))} /><Button disabled={tripBusy || startCode.length !== 4} onClick={() => tripAction("start", "Ride started", { start_code: startCode })}>Start ride</Button></div>}
                      {booking.status === "in_progress" && <Button disabled={tripBusy} onClick={completeRide} className="mt-3 w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Complete ride</Button>}
                      <Button disabled={tripBusy} variant="outline" onClick={cancelBookingByDriver} className="mt-2 w-full border-red-500/40 text-red-300 hover:bg-red-500/10">Cancel ride</Button>
                      <div className="mt-2 grid grid-cols-2 gap-2"><Button disabled={tripBusy} variant="outline" onClick={requestExtraStop}>Extra stop fee</Button><Button disabled={tripBusy} variant="outline" onClick={() => reportNoShow("customer_no_show")}>Customer no-show</Button></div>
                      {Number(booking.waiting_fee || 0) > 0 && <p className="mt-2 text-xs text-orange-200">Waiting fee added: ${Number(booking.waiting_fee || 0).toFixed(2)}</p>}
                    </div>
                  )}

                  {booking.receipt_lines && (isCustomerOwner || isAdmin) && (
                    <div className="mt-5 rounded-2xl border border-border/70 bg-secondary/25 p-4 text-sm">
                      <div className="font-serif text-xl mb-3">Receipt / invoice</div>
                      <div className="space-y-2">{booking.receipt_lines.map((line, i) => <div key={i} className="flex justify-between gap-3"><span className="text-muted-foreground">{line.label}</span><span>${Number(line.amount || 0).toFixed(2)}</span></div>)}</div>
                    </div>
                  )}

                  {isMatched && (isCustomerOwner || (isDriver && booking.driver_id === user.id) || isAdmin) && (
                    <Button data-testid="open-booking-messages-btn" onClick={() => navigate(`/messages/${booking.id}`)} className="mt-4 w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                      Open booking messages
                    </Button>
                  )}
                  {(isCustomerOwner || (isDriver && booking.driver_id === user.id)) && (
                    <Button variant="outline" onClick={openDispute} className="mt-3 w-full">Open dispute / complaint</Button>
                  )}
                  {!isMatched && booking.status === "payment_pending" && (
                    <div className="mt-5 pt-5 border-t border-border/60 text-xs text-muted-foreground">Contact details are locked until an admin confirms the payment.</div>
                  )}
                  {isAdmin && booking.status === "payment_pending" && (
                    <Button data-testid="admin-mark-paid-btn" onClick={markPaid} className="mt-4 w-full gap-2 bg-emerald-500/90 text-white hover:bg-emerald-500">
                      <CreditCard className="w-4 h-4" /> Confirm payment / match ride
                    </Button>
                  )}
                  {isCustomerOwner && booking.status === "payment_pending" && (
                    <Button data-testid="go-to-payment-btn" onClick={() => navigate(`/payment/${booking.id}`)} className="mt-4 w-full gap-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                      <CreditCard className="w-4 h-4" /> View payment instructions
                    </Button>
                  )}
                  {false && (
                    <Button data-testid="complete-ride-btn" onClick={completeRide} className="mt-4 w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                      Mark ride complete
                    </Button>
                  )}
                  {((isCustomerOwner && !booking.customer_rating) || (isDriver && booking.driver_id === user.id && !booking.driver_rating)) && booking.status === "completed" && (
                    <Dialog open={rateOpen} onOpenChange={setRateOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="open-rate-btn" className="mt-4 w-full gap-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                          <Star className="w-4 h-4" /> Rate your chauffeur
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border">
                        <DialogHeader><DialogTitle className="font-serif text-2xl">{isDriver ? "Rate the passenger" : "Rate your chauffeur"}</DialogTitle></DialogHeader>
                        <div className="flex items-center gap-2 justify-center py-4">
                          {[1,2,3,4,5].map((i) => (
                            <button type="button" key={i} data-testid={`rate-star-${i}`} onClick={() => setRating(i)} className="p-1">
                              <Star className={`w-9 h-9 ${i <= rating ? "fill-amber-300 text-amber-300" : "text-muted-foreground/40"}`} />
                            </button>
                          ))}
                        </div>
                        <Textarea data-testid="rate-comment-input" rows={3} maxLength={500} placeholder="How did it go? Optional comment" value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} />
                        <Button data-testid="rate-submit-btn" onClick={submitRating} className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Submit rating</Button>
                      </DialogContent>
                    </Dialog>
                  )}
                  {(isCustomerOwner ? booking.customer_rating : booking.driver_rating) && (
                    <div className="mt-4 pt-4 border-t border-border/60">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Your rating</div>
                      <div className="mt-2"><Stars value={isCustomerOwner ? booking.customer_rating : booking.driver_rating} size="lg" /></div>
                      {(isCustomerOwner ? booking.customer_comment : booking.driver_comment) && <div className="text-xs text-muted-foreground mt-1">&ldquo;{isCustomerOwner ? booking.customer_comment : booking.driver_comment}&rdquo;</div>}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">No booking yet. {isCustomerOwner ? "Select an offer to begin admin payment confirmation." : "Awaiting customer to select an offer."}</div>
              )}
            </CardContent>
          </Card>

          {isCustomerOwner && ["open", "offer_received"].includes(ride.status) && (
            <Button data-testid="cancel-ride-btn" onClick={cancelRide} variant="outline" className="w-full gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10">
              <X className="w-4 h-4" /> Cancel request
            </Button>
          )}

          {isAdmin && (
            <Card className="bg-card border-border/70">
              <CardContent className="p-6 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Customer</div>
                <div data-testid="ride-customer-name">{ride.customer_name}</div>
                <div className="text-xs text-muted-foreground mt-1">Posted {new Date(ride.created_at).toLocaleString()}</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={driverTermsOpen} onOpenChange={setDriverTermsOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader><DialogTitle className="font-serif text-2xl">Terms & Conditions</DialogTitle></DialogHeader>
          <DriverTermsBody />
          <Button type="button" onClick={() => setDriverTermsOpen(false)} className="mt-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
