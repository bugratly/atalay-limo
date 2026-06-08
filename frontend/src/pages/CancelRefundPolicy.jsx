import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function CancelRefundPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-14">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Policy</div>
      <h1 className="font-serif text-4xl mt-2 tracking-tight">Cancellation & refund policy</h1>
      <p className="text-muted-foreground mt-4 leading-relaxed">This draft policy is a placeholder for Atalay Limo operations. It can be updated before launch with final legal wording.</p>

      <Card className="mt-8 bg-card border-border/70">
        <CardContent className="p-7 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section><h2 className="font-serif text-2xl text-foreground mb-2">Customer cancellations</h2><p>Customers may request cancellation from their dashboard or by contacting support. If a trip has already been approved or confirmed by admin, platform commission and applicable operational charges may still apply.</p></section>
          <section><h2 className="font-serif text-2xl text-foreground mb-2">Driver cancellations</h2><p>Drivers are expected to honor confirmed trips. If a driver cancels after confirmation, Atalay Limo may review the account, reassign the trip, and apply platform rules or restrictions.</p></section>
          <section><h2 className="font-serif text-2xl text-foreground mb-2">Refund review</h2><p>Refunds are reviewed case by case. Payment submission does not guarantee immediate confirmation; system/admin approval may take approximately 1–2 hours.</p></section>
          <section><h2 className="font-serif text-2xl text-foreground mb-2">No off-platform arrangements</h2><p>Customers and drivers may not arrange direct payment or transportation outside Atalay Limo for trips initiated on the platform. Violations may result in cancellation, account review, or loss of platform access.</p></section>
          <section><h2 className="font-serif text-2xl text-foreground mb-2">Disputes</h2><p>Atalay Limo may review ride details, admin actions, payment status, and chat history to resolve operational issues and disputes.</p></section>
        </CardContent>
      </Card>
    </div>
  );
}
