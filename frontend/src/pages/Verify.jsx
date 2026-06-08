import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Phone, Check } from "lucide-react";

function Channel({ channel, label, Icon, verified, onVerified }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/verify/send", { channel });
      setSent(true);
      if (data.dev_code) setDevCode(data.dev_code);
      toast.success(`Code sent to your ${label.toLowerCase()}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("/auth/verify/confirm", { channel, code });
      toast.success(`${label} verified`);
      onVerified();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`p-5 rounded-lg border ${verified ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/70"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-md flex items-center justify-center ${verified ? "bg-emerald-500/15 text-emerald-300" : "bg-secondary text-[hsl(60_56%_91%)]"}`}>
          {verified ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <div className="font-medium">{label} verification</div>
          <div className="text-xs text-muted-foreground">{verified ? "Verified" : "Required to use the platform"}</div>
        </div>
      </div>
      {!verified && (
        <div className="mt-4 space-y-3">
          {!sent ? (
            <Button data-testid={`verify-send-${channel}`} onClick={send} disabled={busy} variant="outline" className="w-full border-[hsl(60_56%_91%)]/30">
              {busy ? "Sending…" : `Send code to my ${label.toLowerCase()}`}
            </Button>
          ) : (
            <>
              {devCode && (
                <div className="text-xs px-3 py-2 rounded bg-secondary text-muted-foreground">
                  <span className="uppercase tracking-wider">Dev preview</span>: <span className="text-[hsl(60_56%_91%)] font-mono">{devCode}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Enter 6-digit code</Label>
                <Input data-testid={`verify-code-${channel}`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="000000" />
              </div>
              <div className="flex gap-2">
                <Button data-testid={`verify-confirm-${channel}`} onClick={confirm} disabled={busy || code.length < 4} className="flex-1 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                  Verify
                </Button>
                <Button onClick={send} disabled={busy} variant="ghost" size="sm">Resend</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Verify() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [me, setMe] = useState(user);

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/me")
      .then(({ data }) => { if (!cancelled) setMe(data); })
      .catch((err) => console.error("Verify: failed to fetch /auth/me:", err));
    return () => { cancelled = true; };
  }, []);

  const onVerified = async () => {
    const { data } = await api.get("/auth/me");
    setMe(data);
    if (refresh) refresh(data);
    if (data.email_verified && data.phone_verified) {
      toast.success("Account fully verified");
      setTimeout(() => navigate(data.role === "driver" ? "/driver" : "/customer"), 600);
    }
  };

  if (!me) return <div className="max-w-md mx-auto px-6 py-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-xl mx-auto px-6 lg:px-10 py-16">
      <Card className="bg-card border-border/70">
        <CardContent className="p-8">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Account verification</div>
          <h1 className="font-serif text-3xl tracking-tight mt-2">Verify your account</h1>
          <p className="text-sm text-muted-foreground mt-2">For security and to prevent duplicate or fraudulent accounts, please verify both your email and phone number.</p>

          <div className="mt-8 space-y-4">
            <Channel channel="email" label="Email" Icon={Mail} verified={me.email_verified} onVerified={onVerified} />
            <Channel channel="phone" label="Phone" Icon={Phone} verified={me.phone_verified} onVerified={onVerified} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
