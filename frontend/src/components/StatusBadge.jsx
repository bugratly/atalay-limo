import React from "react";

const STATUS_STYLES = {
  open: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  offer_received: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  accepted: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  payment_pending: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  confirmed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  completed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  cancelled: "bg-red-500/10 text-red-300 border-red-500/30",
  pending: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  accepted_offer: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/10 text-red-300 border-red-500/30",
  approved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  driver_pending: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  to_pickup: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  arrived: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  in_progress: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
  no_show: "bg-red-600/10 text-red-300 border-red-600/30",
  driver_not_online: "bg-orange-600/10 text-orange-300 border-orange-600/30",
  investigating: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  resolved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

const LABELS = {
  open: "Open",
  offer_received: "Offer Received",
  accepted: "Accepted",
  payment_pending: "Payment Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
  accepted_offer: "Accepted",
  rejected: "Rejected",
  approved: "Approved",
  driver_pending: "Pending Approval",
  to_pickup: "To Pickup",
  arrived: "Arrived",
  in_progress: "In Progress",
  no_show: "No-show",
  driver_not_online: "Driver Not Online",
  investigating: "Investigating",
  resolved: "Resolved",
};

export default function StatusBadge({ status, testId }) {
  const style = STATUS_STYLES[status] || "bg-muted text-muted-foreground border-border";
  const label = LABELS[status] || status;
  return (
    <span
      data-testid={testId || `status-${status}`}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider border ${style}`}
    >
      {label}
    </span>
  );
}
