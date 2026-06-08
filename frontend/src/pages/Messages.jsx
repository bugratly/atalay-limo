import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [payload, setPayload] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bookings/${id}/messages`);
      setPayload(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/bookings/${id}/messages`, { message: text.trim() });
      setText("");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Message not sent");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto px-6 py-12 text-muted-foreground">Loading messages…</div>;
  if (!payload) return <div className="max-w-4xl mx-auto px-6 py-12 text-muted-foreground">Messages unavailable.</div>;

  const booking = payload.booking;
  const messages = payload.messages || [];

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-12">
      <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground mb-6">← Back</button>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Booking messages</div>
          <h1 className="font-serif text-4xl mt-2 tracking-tighter">Ride chat</h1>
          <p className="text-muted-foreground mt-2">Booking #{booking.id.slice(0, 8)} · {booking.vehicle_type}</p>
          {user?.role === "admin" && <div className="inline-flex mt-3 px-3 py-1 rounded-full bg-blue-400/15 border border-blue-300/30 text-blue-100 text-xs uppercase tracking-wider">Admin monitoring mode</div>}
        </div>
        <Button onClick={load} variant="outline">Refresh</Button>
      </div>

      <Card className="mt-6 border-amber-300/30 bg-amber-300/5">
        <CardContent className="p-4 flex gap-3 text-sm text-muted-foreground leading-relaxed">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-300 mt-0.5" />
          <p>{payload.policy}</p>
        </CardContent>
      </Card>

      <Card className="mt-6 bg-card border-border/70">
        <CardContent className="p-5 space-y-4 max-h-[480px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">No messages yet.</div>
          ) : messages.map((m) => {
            const mine = m.sender_id === user?.id;
            const adminMessage = m.sender_role === "admin";
            return (
              <div key={m.id} className={`flex ${mine || adminMessage ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 border ${adminMessage ? "bg-blue-500/15 border-blue-300/40 shadow-[0_0_0_1px_rgba(147,197,253,0.18)]" : mine ? "bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] border-transparent" : "bg-secondary/50 border-border/70"}`}>
                  <div className="text-[10px] uppercase tracking-wider opacity-80 mb-1">{adminMessage ? "Atalay Limo Admin" : mine ? "You" : m.sender_role}</div>
                  <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                  <div className="text-[10px] opacity-60 mt-2">{new Date(m.created_at).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <form onSubmit={send} className="mt-4 space-y-3">
        <Textarea
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user?.role === "admin" ? "Write as Atalay Limo Admin. Keep the conversation on-platform." : "Write a message inside Atalay Limo only. Do not share phone numbers, emails, or outside-payment offers."}
        />
        <Button disabled={busy || !text.trim()} type="submit" className="gap-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
          <Send className="w-4 h-4" /> {busy ? "Sending…" : "Send message"}
        </Button>
      </form>
    </div>
  );
}
