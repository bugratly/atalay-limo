import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, LifeBuoy, Send, ShieldCheck } from "lucide-react";

function threadLabel(t) {
  if (t.booking_id) return `Booking #${t.booking_id.slice(0, 8)}`;
  if (t.ride_request_id) return `Ride request #${t.ride_request_id.slice(0, 8)}`;
  return "General support";
}

export default function Support() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [rideRequests, setRideRequests] = useState([]);
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [payload, setPayload] = useState(null);
  const [form, setForm] = useState({ subject: "", message: "", related: "none" });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  const loadRelated = useCallback(async () => {
    if (!user) return;
    try {
      const calls = [api.get("/bookings")];
      if (user.role === "customer" || user.role === "admin") calls.push(api.get("/ride-requests"));
      const results = await Promise.allSettled(calls);
      if (results[0].status === "fulfilled") setBookings(results[0].value.data || []);
      if (results[1]?.status === "fulfilled") setRideRequests(results[1].value.data || []);
    } catch (err) {
      console.error("Failed to load support related trips:", err);
    }
  }, [user]);

  const loadThreads = useCallback(async () => {
    try {
      const { data } = await api.get("/support/threads");
      setThreads(data || []);
      if (!activeId && data?.length) setActiveId(data[0].id);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load support conversations");
    }
  }, [activeId]);

  const loadMessages = useCallback(async (id) => {
    if (!id) { setPayload(null); return; }
    try {
      const { data } = await api.get(`/support/threads/${id}/messages`);
      setPayload(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load messages");
    }
  }, []);

  useEffect(() => { loadRelated(); loadThreads(); }, [loadRelated, loadThreads]);
  useEffect(() => { loadMessages(activeId); }, [activeId, loadMessages]);

  const createThread = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setBusy(true);
    try {
      const body = { subject: form.subject.trim(), message: form.message.trim() };
      if (form.related.startsWith("booking:")) body.booking_id = form.related.replace("booking:", "");
      if (form.related.startsWith("ride:")) body.ride_request_id = form.related.replace("ride:", "");
      const { data } = await api.post("/support", body);
      setForm({ subject: "", message: "", related: "none" });
      await loadThreads();
      setActiveId(data.id);
      toast.success("Support conversation opened.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not open support conversation");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim() || !activeId) return;
    setBusy(true);
    try {
      await api.post(`/support/threads/${activeId}/messages`, { message: reply.trim() });
      setReply("");
      await loadThreads();
      await loadMessages(activeId);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Message not sent");
    } finally {
      setBusy(false);
    }
  };

  const messages = payload?.messages || [];

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center"><LifeBuoy className="w-5 h-5 text-[hsl(60_56%_91%)]" /></div>
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Support</div>
          <h1 className="font-serif text-3xl tracking-tight">Atalay Limo support chat</h1>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-3 max-w-3xl">
        Customers and chauffeurs can contact Atalay Limo support anytime, even without an active or approved ride. Ride-specific support conversations are private between that user and admin only.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="space-y-5">
          <Card className="bg-card border-border/70">
            <CardContent className="p-6">
              <h2 className="font-serif text-2xl">New support conversation</h2>
              <p className="text-sm text-muted-foreground mt-1">Open a general support chat or connect it to one of your rides.</p>
              <form onSubmit={createThread} className="space-y-4 mt-5">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input required minLength={2} maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Payment question, lost item, driver approval…" />
                </div>
                <div className="space-y-2">
                  <Label>Related ride (optional)</Label>
                  <Select value={form.related} onValueChange={(v) => setForm({ ...form, related: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">General support</SelectItem>
                      {rideRequests.map((r) => <SelectItem key={r.id} value={`ride:${r.id}`}>Ride #{r.id.slice(0, 8)} · {r.status}</SelectItem>)}
                      {bookings.map((b) => <SelectItem key={b.id} value={`booking:${b.id}`}>Booking #{b.id.slice(0, 8)} · {b.status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea required minLength={2} maxLength={2000} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                  {busy ? "Opening…" : "Open support chat"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/70">
            <CardContent className="p-4">
              <div className="font-serif text-xl mb-3">Conversations</div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {threads.length === 0 ? <div className="text-sm text-muted-foreground p-5 text-center border border-dashed border-border rounded-xl">No support conversations yet.</div> : threads.map((t) => (
                  <button key={t.id} onClick={() => setActiveId(t.id)} className={`w-full text-left rounded-2xl border p-4 transition-colors ${activeId === t.id ? "border-[hsl(60_56%_91%)]/70 bg-[hsl(60_56%_91%)]/8" : "border-border/70 bg-secondary/25 hover:bg-secondary/40"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium truncate">{t.subject}</div>
                      <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-1 ${t.status === "resolved" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>{t.status}</span>
                    </div>
                    {user?.role === "admin" && <div className="text-xs text-muted-foreground mt-1 truncate">{t.user_name} · {t.user_role}</div>}
                    <div className="text-xs text-[hsl(42_60%_70%)] mt-1">{threadLabel(t)}</div>
                    <div className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.last_message}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-amber-300/30 bg-amber-300/5 mb-5">
            <CardContent className="p-4 flex gap-3 text-sm text-muted-foreground leading-relaxed">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-300 mt-0.5" />
              <p>Support chats are private between the account holder and Atalay Limo admin. Driver-customer ride chat unlocks only after admin confirms the trip. Admin can always access and intervene in confirmed trip chats.</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/70">
            <CardContent className="p-5">
              {!activeThread ? (
                <div className="py-24 text-center text-muted-foreground">Select or open a support conversation.</div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 flex-wrap border-b border-border/70 pb-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Private support thread</div>
                      <h2 className="font-serif text-3xl mt-1">{activeThread.subject}</h2>
                      <div className="text-sm text-muted-foreground mt-1">{threadLabel(activeThread)}</div>
                      {user?.role === "admin" && <div className="inline-flex mt-3 px-3 py-1 rounded-full bg-blue-400/15 border border-blue-300/30 text-blue-100 text-xs uppercase tracking-wider"><ShieldCheck className="w-3 h-3 mr-1" /> Admin support mode</div>}
                    </div>
                    <Button onClick={() => loadMessages(activeId)} variant="outline">Refresh</Button>
                  </div>

                  <div className="mt-5 space-y-4 max-h-[520px] overflow-y-auto pr-1">
                    {messages.length === 0 ? <div className="text-center text-muted-foreground py-16">No messages yet.</div> : messages.map((m) => {
                      const mine = m.sender_id === user?.id;
                      const adminMessage = m.sender_role === "admin";
                      return (
                        <div key={m.id} className={`flex ${mine || adminMessage ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[82%] rounded-2xl px-4 py-3 border ${adminMessage ? "bg-blue-500/15 border-blue-300/40 shadow-[0_0_0_1px_rgba(147,197,253,0.18)]" : mine ? "bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] border-transparent" : "bg-secondary/50 border-border/70"}`}>
                            <div className="text-[10px] uppercase tracking-wider opacity-80 mb-1">{adminMessage ? "Atalay Limo Admin" : mine ? "You" : m.sender_role}</div>
                            <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                            <div className="text-[10px] opacity-60 mt-2">{new Date(m.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={sendReply} className="mt-5 space-y-3">
                    <Textarea rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={user?.role === "admin" ? "Reply as Atalay Limo Admin…" : "Write to Atalay Limo support…"} />
                    <Button disabled={busy || !reply.trim()} type="submit" className="gap-2 bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                      <Send className="w-4 h-4" /> {busy ? "Sending…" : "Send message"}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
