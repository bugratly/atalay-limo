import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Bell } from "lucide-react";

const POLL_MS = 30000;

export default function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/notifications");
      setItems(data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  }, [user]);

  /* eslint-disable */
  useEffect(() => {
    if (!user) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [user, load]);
  /* eslint-enable */

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    try {
      await api.post("/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark all read:", err);
    }
  };

  const clickItem = async (n) => {
    if (!n.read) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch (err) {
        console.error("Failed to mark read:", err);
      }
    }
    setOpen(false);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        data-testid="notifications-bell-btn"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            data-testid="notifications-unread-count"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-300 text-[10px] font-bold text-[hsl(223_39%_7%)] flex items-center justify-center"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          data-testid="notifications-panel"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-lg border border-border bg-popover shadow-lg z-50 max-h-[80vh] overflow-y-auto"
        >
          <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
            <div className="font-medium">Notifications</div>
            {unread > 0 && (
              <button data-testid="mark-all-read-btn" onClick={markAll} className="text-xs text-[hsl(60_56%_91%)] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            <div className="divide-y divide-border/60">
              {items.map((n) => (
                <Link
                  key={n.id}
                  to={n.link || "#"}
                  onClick={() => clickItem(n)}
                  data-testid={`notification-${n.id}`}
                  className={`block px-4 py-3 hover:bg-accent ${n.read ? "" : "bg-[hsl(60_56%_91%)]/5"}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1.5">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
