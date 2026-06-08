import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { LifeBuoy, MessageCircle, ShieldCheck } from "lucide-react";

function shortRoute(item) {
  const pickup = item?.pickup_address || item?.ride?.pickup_address || "Pickup";
  const dropoff = item?.dropoff_address || item?.ride?.dropoff_address || "Drop-off";
  return `${pickup} → ${dropoff}`;
}

function canOpenRideChat(booking) {
  return booking?.payment_status === "paid" && ["confirmed", "completed"].includes(booking?.status);
}

export default function DashboardChatPanel({ compact = false }) {
  const [supportThreads, setSupportThreads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [supportResult, bookingsResult] = await Promise.all([
        api.get("/support/threads").catch((err) => ({ data: [], error: err })),
        api.get("/bookings").catch((err) => ({ data: [], error: err })),
      ]);
      if (supportResult.error) throw supportResult.error;
      setSupportThreads(supportResult.data || []);
      setBookings(bookingsResult.data || []);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || "Unable to load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rideChats = useMemo(() => bookings.filter(canOpenRideChat), [bookings]);
  const lockedRideChats = useMemo(() => bookings.filter((b) => !canOpenRideChat(b)), [bookings]);

  return (
    <Card className="bg-card border-border/70">
      <CardContent className={compact ? "p-5" : "p-6"}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Messages</div>
            <h2 className="font-serif text-2xl mt-1">Chat center</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Contact Atalay Limo support anytime. Customer-driver chat unlocks only after admin confirms the trip.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
            <Link to="/support"><LifeBuoy className="w-4 h-4 mr-2" /> Support</Link>
          </Button>
        </div>

        {error && <div className="mb-4 text-sm text-orange-300">{error}</div>}
        {loading ? <div className="text-sm text-muted-foreground">Loading chats…</div> : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-medium"><LifeBuoy className="w-4 h-4 text-[hsl(42_60%_65%)]" /> Support conversations</div>
              {supportThreads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No support chats yet. You can open a general support chat even without an active ride.
                </div>
              ) : (
                <div className="space-y-3">
                  {supportThreads.slice(0, 4).map((t) => (
                    <Link key={t.id} to="/support" className="block rounded-2xl border border-border/70 bg-secondary/25 p-4 hover:bg-secondary/45 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{t.subject}</div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">{t.booking_id ? `Booking ${t.booking_id.slice(0,8)}` : t.ride_request_id ? `Ride ${t.ride_request_id.slice(0,8)}` : "General support"}</div>
                        </div>
                        <StatusBadge status={t.status || "open"} />
                      </div>
                      {t.last_message && <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{t.last_message}</div>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-medium"><MessageCircle className="w-4 h-4 text-[hsl(42_60%_65%)]" /> Ride chats</div>
              {rideChats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No unlocked ride chats yet. They appear here after admin confirms payment and the trip is matched.
                </div>
              ) : (
                <div className="space-y-3">
                  {rideChats.slice(0, 4).map((b) => (
                    <Link key={b.id} to={`/messages/${b.id}`} className="block rounded-2xl border border-border/70 bg-secondary/25 p-4 hover:bg-secondary/45 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{b.ride_number ? `Ride #${b.ride_number}` : "Confirmed ride"}</div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">{shortRoute(b)}</div>
                        </div>
                        <MessageCircle className="w-4 h-4 text-[hsl(42_60%_65%)] shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {lockedRideChats.length > 0 && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck className="inline w-3 h-3 mr-1 text-[hsl(42_60%_65%)]" />
                  {lockedRideChats.length} ride chat{lockedRideChats.length > 1 ? "s are" : " is"} waiting for admin confirmation.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
