import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CreditCard, Lock, ShieldCheck, CheckCircle2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { roundCustomerEstimate } from "@/lib/geo";

function cleanDigits(value, max = 16) {
  return String(value || "").replace(/\D/g, "").slice(0, max);
}

function groupCardDigits(digits) {
  const d = cleanDigits(digits, 16);
  const groups = d.length === 15 ? [4, 6, 5] : [4, 4, 4, 4];
  const out = [];
  let index = 0;
  for (const size of groups) {
    const chunk = d.slice(index, index + size);
    if (chunk) out.push(chunk);
    index += size;
  }
  return out;
}

function maskCardNumber(digits) {
  const d = cleanDigits(digits, 16);
  if (!d) return "";
  const visibleFrom = Math.max(0, d.length - 5);
  let index = 0;
  return groupCardDigits(d).map((group) => {
    const masked = group.split("").map((char) => {
      const output = index >= visibleFrom ? char : "*";
      index += 1;
      return output;
    }).join("");
    return masked;
  }).join(" ");
}

function prettyCardNumber(digits) {
  const d = cleanDigits(digits, 16);
  if (!d) return "**** **** **** *****";
  return maskCardNumber(d);
}

function formatExpiry(value) {
  const d = cleanDigits(value, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function validateExpiry(value) {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value);
  if (!match) return false;
  const yy = Number(match[2]);
  return yy >= 26;
}

function cardBrandFromLength(length) {
  if (length === 15) return "Amex";
  if (length === 16) return "Visa/Mastercard";
  return "Card";
}

function expectedCvvLength(cardLength) {
  if (cardLength === 15) return 4;
  if (cardLength === 16) return 3;
  return null;
}

export default function Payment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [focused, setFocused] = useState("number");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: bookings } = await api.get("/bookings");
      const b = bookings.find((bk) => bk.id === id);
      if (!b) {
        toast.error("Booking not found");
        navigate("/customer");
        return;
      }
      setBooking(b);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load booking");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => {
    if (!booking) return 0;
    return roundCustomerEstimate(booking.customer_total_with_tax ?? booking.price) ?? 0;
  }, [booking]);

  const submitPayment = async (e) => {
    e.preventDefault();
    const digits = cleanDigits(cardNumber, 16);
    const holder = cardName.trim();
    const securityCode = cleanDigits(cvv, 4);
    if (![15, 16].includes(digits.length)) return toast.error("Card number must be 15 or 16 digits.");
    if (holder.replace(/\s+/g, "").length < 3) return toast.error("Cardholder name must be at least 3 characters.");
    if (!validateExpiry(expiry)) return toast.error("Expiration must be MM/YY and not earlier than 2026.");
    const requiredCvvLength = expectedCvvLength(digits.length);
    if (securityCode.length !== requiredCvvLength) {
      return toast.error(digits.length === 15 ? "Amex CVV must be exactly 4 digits." : "Visa/Mastercard CVV must be exactly 3 digits.");
    }
    setSubmitting(true);
    try {
      await api.post(`/payments/${id}/submit`, {
        card_number: digits,
        card_last5: digits.slice(-5),
        card_brand: cardBrandFromLength(digits.length),
        cardholder_name: holder,
        expiry,
        cvv: securityCode,
      });
      setSubmitted(true);
      toast.success("Payment submitted for admin confirmation");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Payment could not be submitted");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !booking) {
    return <div className="max-w-2xl mx-auto px-6 py-12 text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading booking…</div>;
  }

  if (submitted || booking.payment_status === "submitted") {
    return (
      <div className="max-w-2xl mx-auto px-6 lg:px-10 py-12">
        <Card className="bg-card border-border/70">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-serif text-4xl tracking-tighter">Thank you</h1>
              <p className="text-muted-foreground mt-2">Your payment was submitted successfully.</p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-4 text-sm text-muted-foreground">
              System approval usually takes about <strong className="text-foreground">1–2 hours</strong>. Atalay Limo Admin will confirm the payment and then release the customer-driver contact details.
            </div>
            <Button onClick={() => navigate(`/ride/${booking.ride_request_id}`)} className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">Back to ride</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-12">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Secure payment</div>
      <h1 className="font-serif text-4xl mt-2 tracking-tighter">Complete your payment</h1>
      <p className="text-muted-foreground mt-2">Payment is reviewed by Atalay Limo Admin before your chauffeur is officially matched.</p>

      <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-6 mt-8">
        <Card className="bg-card border-border/70">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Booking</div>
              <div className="mt-2 flex items-center gap-3">
                <span className="font-mono text-sm">#{booking.id.slice(0, 8)}</span>
                <StatusBadge status={booking.status} testId="payment-booking-status" />
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-4 bg-secondary/30">
              <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Chauffeur details locked
              </div>
              <div className="mt-1.5 text-sm">Driver details will be released after admin payment confirmation.</div>
              {booking.vehicle_details && <div className="text-xs text-muted-foreground mt-0.5">Vehicle: {booking.vehicle_details}</div>}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-baseline">
                <span className="font-medium">Total due</span>
                <span data-testid="payment-total" className="font-serif text-3xl">${total.toFixed(0)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Tax included. Tolls are included and paid by the driver.</div>
            </div>

            <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 inline-block mr-1 text-[hsl(60_56%_91%)]" />
              This is a demo payment UI. Do not enter a real card until Stripe or another certified payment processor is connected.
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/70 overflow-hidden">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="relative rounded-2xl border border-border/60 bg-gradient-to-br from-zinc-900 to-zinc-700 p-5 min-h-[190px] shadow-2xl">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white,transparent_30%)]" />
              <div className="relative z-10 flex flex-col h-full justify-between min-h-[150px]">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.25em] text-zinc-300">Atalay Limo secure card</div>
                  <CreditCard className="w-7 h-7 text-zinc-200" />
                </div>
                <div className={`font-mono text-2xl sm:text-3xl tracking-wider ${focused === "number" ? "text-white" : "text-zinc-200"}`}>{prettyCardNumber(cardNumber)}</div>
                <div className="flex justify-between text-xs uppercase tracking-wider text-zinc-300">
                  <span>{cardName || "CARDHOLDER"}</span>
                  <span>{expiry || "MM/YY"}</span>
                </div>
              </div>
            </div>

            <form onSubmit={submitPayment} className="space-y-4">
              <label className="block text-sm">
                <span className="text-muted-foreground">Card number</span>
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-[hsl(60_56%_91%)]"
                  value={maskCardNumber(cardNumber)}
                  onFocus={() => setFocused("number")}
                  onKeyDown={(e) => {
                    if (/^\d$/.test(e.key)) {
                      e.preventDefault();
                      setCardNumber((prev) => cleanDigits(prev + e.key, 16));
                    } else if (e.key === "Backspace") {
                      e.preventDefault();
                      setCardNumber((prev) => cleanDigits(prev, 16).slice(0, -1));
                    } else if (e.key === "Delete") {
                      e.preventDefault();
                      setCardNumber("");
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    setCardNumber(cleanDigits(e.clipboardData.getData("text"), 16));
                  }}
                  onChange={() => {}}
                  inputMode="numeric"
                  placeholder="**** **** **** 12345"
                />
                <span className="text-xs text-muted-foreground">15 digits use Amex format; 16 digits use Visa/Mastercard format. Only the last 5 digits stay visible.</span>
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Name on card</span>
                <input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none" value={cardName} onFocus={() => setFocused("name")} onChange={(e) => setCardName(e.target.value.toUpperCase())} placeholder="FULL NAME" minLength={3} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm"><span className="text-muted-foreground">Expiration</span><input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none" value={expiry} onFocus={() => setFocused("expiry")} onChange={(e) => setExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" inputMode="numeric" /></label>
                <label className="block text-sm"><span className="text-muted-foreground">CVV</span><input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none" value={cvv} onFocus={() => setFocused("cvv")} onChange={(e) => setCvv(cleanDigits(e.target.value, 4))} placeholder={cardNumber.length === 15 ? "••••" : "•••"} inputMode="numeric" /><span className="mt-1 block text-xs text-muted-foreground">Amex requires exactly 4 digits; Visa/Mastercard requires exactly 3 digits.</span></label>
              </div>
              <Button disabled={submitting || booking.status !== "payment_pending"} className="w-full gap-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit payment for approval
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/ride/${booking.ride_request_id}`)} className="w-full">Back to ride</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
