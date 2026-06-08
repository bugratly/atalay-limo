import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { ArrowLeft, Banknote, CalendarDays, FileText, MapPin, ReceiptText, Wallet } from "lucide-react";

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

function WaybillCard({ ride }) {
  return (
    <Card className="bg-card border-border/70 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-border/70 bg-secondary/30 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Waybill</div>
            <div className="mt-1 font-serif text-2xl text-[hsl(60_56%_91%)]">{ride.ride_number || "Pending"}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>{ride.date || "—"} {ride.time || ""}</span>
              <StatusBadge status={ride.status} />
            </div>
          </div>
          <div className="rounded-2xl border border-[hsl(42_60%_65%)]/25 bg-[hsl(42_60%_65%)]/10 px-5 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.18em] text-[hsl(42_60%_70%)]">Driver payout</div>
            <div className="mt-1 font-serif text-3xl">{money(ride.driver_payout)}</div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4 text-[hsl(42_60%_65%)]" /> Route</div>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Pickup: </span><span>{ride.pickup_address || "—"}</span></div>
                <div><span className="text-muted-foreground">Drop-off: </span><span>{ride.dropoff_address || "—"}</span></div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Passenger" value={ride.customer_name || "Passenger"} />
              <Info label="Vehicle" value={ride.vehicle_details || ride.vehicle_type || "—"} />
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium"><ReceiptText className="h-4 w-4 text-[hsl(42_60%_65%)]" /> Earnings breakdown</div>
            <Line label="Gross fare" value={money(ride.gross_fare)} />
            <Line label="Platform commission" value={`-${money(ride.platform_commission)}`} muted />
            <Line label="Customer tax" value={money(ride.tax_amount)} muted />
            <div className="my-3 border-t border-border/70" />
            <Line label="You keep" value={money(ride.driver_payout)} strong />
            <div className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Tax is charged to the customer. Driver payout is calculated after platform commission.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function Line({ label, value, muted, strong }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 text-sm ${muted ? "text-muted-foreground" : ""} ${strong ? "font-semibold text-[hsl(60_56%_91%)]" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function DriverEarnings() {
  const [data, setData] = useState({ summary: {}, rides: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get("/driver/earnings")
      .then(({ data }) => { if (active) setData(data || { summary: {}, rides: [] }); })
      .catch((err) => { if (active) setError(formatApiError(err.response?.data?.detail) || "Unable to load earnings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rides = data.rides || [];
  const completed = useMemo(() => rides.filter((r) => r.status === "completed"), [rides]);
  const pending = useMemo(() => rides.filter((r) => r.status === "confirmed"), [rides]);
  const lastRide = completed[0] || rides[0];
  const summary = data.summary || {};

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/driver" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to driver dashboard</Link>
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Driver earnings</div>
          <h1 className="mt-2 font-serif text-4xl tracking-tighter">Earnings & waybills</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Track completed rides, pending payouts, commission breakdowns, and ride waybill details.</p>
        </div>
        <Button asChild variant="outline" className="rounded-xl border-white/15 bg-transparent text-[hsl(60_56%_91%)] hover:bg-white/5">
          <Link to="/support">Ask support</Link>
        </Button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-200">{error}</div>}
      {loading ? <div className="text-muted-foreground">Loading earnings…</div> : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <SummaryCard icon={Wallet} label="Available balance" value={money(summary.available_balance)} sub="Completed rides" />
            <SummaryCard icon={Banknote} label="Pending balance" value={money(summary.pending_balance)} sub="Confirmed, not completed" />
            <SummaryCard icon={FileText} label="Last ride payout" value={money(summary.last_ride_payout)} sub={summary.last_ride_number || "—"} />
            <SummaryCard icon={ReceiptText} label="Total earned" value={money(summary.total_earned)} sub={`${summary.completed_count || 0} completed rides`} />
          </div>

          {lastRide && (
            <Card className="mb-6 border-[hsl(42_60%_65%)]/30 bg-[hsl(42_60%_65%)]/10">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[hsl(42_60%_70%)]">Latest ride</div>
                  <div className="mt-1 font-serif text-2xl">{lastRide.ride_number}</div>
                  <div className="mt-1 max-w-2xl truncate text-sm text-muted-foreground">{lastRide.pickup_address} → {lastRide.dropoff_address}</div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">You keep</div>
                  <div className="font-serif text-3xl">{money(lastRide.driver_payout)}</div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_0.38fr]">
            <div className="space-y-5">
              {rides.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">No earnings yet. Completed rides will appear here.</div>
              ) : rides.map((ride) => <WaybillCard key={ride.id} ride={ride} />)}
            </div>
            <div className="space-y-5">
              <Card className="bg-card border-border/70">
                <CardContent className="p-5">
                  <h2 className="font-serif text-2xl">Payout status</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <Line label="Completed rides" value={completed.length} />
                    <Line label="Confirmed rides" value={pending.length} />
                    <Line label="Total rides" value={rides.length} />
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">This MVP ledger shows driver payout after Atalay Limo commission. Actual bank transfers can be connected later.</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border/70">
                <CardContent className="p-5">
                  <h2 className="font-serif text-2xl">Notes</h2>
                  <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <li>• Completed rides move into available balance.</li>
                    <li>• Confirmed rides stay pending until marked complete.</li>
                    <li>• Cancelled rides do not increase balance unless admin overrides later.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub }) {
  return (
    <Card className="bg-card border-border/70">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <Icon className="h-5 w-5 text-[hsl(42_60%_65%)]" />
        </div>
        <div className="mt-3 font-serif text-3xl">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
