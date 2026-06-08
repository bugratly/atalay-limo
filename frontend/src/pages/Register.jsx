import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { User, Car, Check } from "lucide-react";

function RoleCard({ value, title, desc, Icon, active, onSelect }) {
  return (
    <button
      type="button"
      data-testid={`register-role-${value}`}
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`text-left p-5 rounded-lg border-2 transition-all duration-200 relative overflow-hidden ${
        active
          ? "border-[hsl(60_56%_91%)] bg-[hsl(60_56%_91%)]/10 shadow-[0_0_0_3px_hsl(60_56%_91%/0.15)]"
          : "border-border/70 bg-card hover:border-[hsl(60_56%_91%)]/40"
      }`}
    >
      {active && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] flex items-center justify-center">
          <Check className="w-4 h-4" strokeWidth={3} />
        </div>
      )}
      <div className={`w-11 h-11 rounded-md flex items-center justify-center ${active ? "bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)]" : "bg-secondary text-[hsl(60_56%_91%)]"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className={`mt-4 font-serif text-xl ${active ? "text-[hsl(60_56%_91%)]" : ""}`}>{title}</div>
      <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{desc}</div>
    </button>
  );
}

export default function Register({ defaultRole = "customer", lockedRole = false }) {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: defaultRole, promo_code: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      const user = await register(form);
      toast.success(user.role === "driver" ? `Welcome, ${user.name}. Verify your email & phone. Admin approval is required before you can submit offers.` : `Welcome, ${user.name}. Verify your email & phone to continue.`);
      navigate("/verify");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const selectRole = (v) => { if (!lockedRole) setForm({ ...form, role: v }); };

  return (
    <div className="max-w-xl mx-auto px-6 lg:px-10 py-16">
      <Card className="bg-card border-border/70">
        <CardContent className="p-8">
          <h1 className="font-serif text-3xl tracking-tight">{lockedRole && form.role === "driver" ? "Apply to drive with Atalay Limo" : lockedRole ? "Create your customer account" : "Create your Atalay Limo account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">{form.role === "driver" ? "Driver accounts are reviewed by admin before receiving requests." : "Verified. Private. Premium."}</p>

          <form onSubmit={submit} className="mt-8 space-y-6">
            {!lockedRole ? (
              <div className="space-y-3">
                <Label className="text-sm">I am a…</Label>
                <div className="grid grid-cols-2 gap-3">
                  <RoleCard value="customer" title="Customer" desc="I want to book private rides." Icon={User} active={form.role === "customer"} onSelect={selectRole} />
                  <RoleCard value="driver" title="Driver" desc="I want to drive. Admin approval is required before receiving ride requests." Icon={Car} active={form.role === "driver"} onSelect={selectRole} />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-4 text-sm text-muted-foreground">
                {form.role === "driver"
                  ? "Driver registration is separate from customer booking. Submit your driver account request here; admin approval is required before you can submit offers."
                  : "Customer registration is separate from driver onboarding. Create this account to request rides and manage offers."}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input data-testid="register-name-input" id="name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input data-testid="register-email-input" id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input data-testid="register-phone-input" id="phone" type="tel" required placeholder="+1 555 000 1234" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <p className="text-xs text-muted-foreground">You&apos;ll receive a verification code.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input data-testid="register-password-input" id="password" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {form.role === "customer" && (
              <div className="space-y-2">
                <Label htmlFor="promo_code">Promo / referral code (optional)</Label>
                <Input data-testid="register-promo-code-input" id="promo_code" value={form.promo_code} onChange={(e) => setForm({ ...form, promo_code: e.target.value.toUpperCase().trim() })} placeholder="ATALAY-ABC123" />
              </div>
            )}

            <Button data-testid="register-submit-btn" disabled={busy} type="submit" className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
              {busy ? "Creating…" : form.role === "driver" ? "Submit driver application" : "Create customer account"}
            </Button>

            <div className="space-y-2 text-sm text-muted-foreground text-center">
              <div>
                Already have an account? <Link to="/login" data-testid="register-login-link" className="text-[hsl(60_56%_91%)] hover:underline">Sign in</Link>
              </div>
              {form.role === "customer" && (
                <div className="text-xs">
                  Want to drive for us? <Link to="/driver/apply" data-testid="register-driver-apply-link" className="text-[hsl(60_56%_91%)] hover:underline">Apply as a chauffeur</Link>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
