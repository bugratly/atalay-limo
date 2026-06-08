import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";

const DEMO = [
  { email: "customer@atalaylimo.com", password: "customer123", label: "Customer" },
  { email: "driver@atalaylimo.com", password: "driver123", label: "Driver" },
  { email: "admin@atalaylimo.com", password: "admin123", label: "Admin" },
];
// NOTE: These are intentionally public DEMO credentials for one-click login on the MVP.
// They are not secrets — anyone visiting /login can use them to try each role. Real users
// register their own accounts via /register/customer.

function roleHome(role) {
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return "/customer";
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e, override) => {
    if (e) e.preventDefault();
    const creds = override || form;
    setBusy(true);
    try {
      const user = await login(creds.email, creds.password);
      await new Promise((resolve) => setTimeout(resolve, 900));
      toast.success(`Welcome back, ${user.name}`);
      const verified = user.role === "admin" || (user.email_verified && user.phone_verified);
      navigate(verified ? roleHome(user.role) : "/verify");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16 grid lg:grid-cols-2 gap-12 items-start">
      <div className="hidden lg:block">
        <h1 className="font-serif text-5xl tracking-tighter">Welcome back.</h1>
        <p className="mt-4 text-muted-foreground max-w-md leading-relaxed">
          Sign in to manage rides, offers and bookings on the Atalay Limo private marketplace.
        </p>
        <div className="mt-12 cream-line" />
        <div className="mt-8 space-y-3">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Demo accounts</div>
          {DEMO.map((d) => (
            <button
              key={d.email}
              data-testid={`demo-login-${d.label.toLowerCase()}`}
              onClick={() => submit(null, d)}
              disabled={busy}
              className="block w-full text-left px-4 py-3 rounded-md border border-border/70 hover:border-[hsl(60_56%_91%)]/40 transition-colors disabled:opacity-60"
            >
              <div className="text-sm font-medium">{d.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{d.email} · {d.password}</div>
            </button>
          ))}
        </div>
      </div>

      <Card className="bg-card border-border/70">
        <CardContent className="p-8">
          <h2 className="font-serif text-3xl tracking-tight">Sign in</h2>
          <p className="text-sm text-muted-foreground mt-1">Use your email and password.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input data-testid="login-email-input" id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input data-testid="login-password-input" id="password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <Button data-testid="login-submit-btn" disabled={busy} type="submit" className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              New here? <Link to="/register/customer" data-testid="login-register-link" className="text-[hsl(60_56%_91%)] hover:underline">Create customer account</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
