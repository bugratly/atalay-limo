import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock, Users, Briefcase, Star } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function RideCard({ ride, action }) {
  return (
    <Link
      to={`/ride/${ride.id}`}
      data-testid={`ride-card-${ride.id}`}
      className="block group bg-card border border-border/70 hover:border-[hsl(60_56%_91%)]/40 rounded-lg p-6 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="w-4 h-4" /> {ride.date}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-4 h-4" /> {ride.time}
          </div>
        </div>
        <StatusBadge status={ride.status} testId={`ride-status-${ride.id}`} />
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-start gap-3">
          <div className="mt-1.5 flex flex-col items-center">
            <span className="w-2 h-2 rounded-full bg-[hsl(60_56%_91%)]" />
            <span className="w-px h-6 bg-border my-1" />
            <span className="w-2 h-2 rounded-sm border border-[hsl(60_56%_91%)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate" data-testid={`ride-pickup-${ride.id}`}>{ride.pickup_address}</div>
            <div className="text-sm truncate mt-3" data-testid={`ride-dropoff-${ride.id}`}>{ride.dropoff_address}</div>
          </div>
        </div>
      </div>

      {ride.customer_public_label && (
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${ride.customer_rating_color === "green" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : ride.customer_rating_color === "yellow" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200" : "border-border bg-secondary/30 text-muted-foreground"}`}>
          <Star className="h-3.5 w-3.5 fill-current" />
          <span>{ride.customer_public_label}</span>
          {ride.customer_rating ? <span>{Number(ride.customer_rating).toFixed(2)}</span> : null}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {ride.passengers}</span>
          <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> {ride.luggage}</span>
          <span className="uppercase tracking-wider text-[hsl(60_56%_91%)]/80">{ride.vehicle_type}</span>
        </div>
        <div className="flex items-center gap-1 group-hover:text-[hsl(60_56%_91%)] transition-colors">
          {action || "View"} <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}
