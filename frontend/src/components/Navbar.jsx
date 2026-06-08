import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, UserRound, LifeBuoy } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate("/"); };

  const roleHome = (role) => {
    if (role === "admin") return "/admin";
    if (role === "driver") return "/driver";
    return "/customer";
  };
  const dashHref = user ? roleHome(user.role) : "/login";

  return (
    <nav className="border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/" data-testid="nav-home-link" className="flex items-center gap-2.5 group">
          <span className="w-2 h-2 rounded-full bg-[hsl(60_56%_91%)] group-hover:scale-125 transition-transform" />
          <span className="font-serif text-xl tracking-tight">Atalay Limo</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to={dashHref} data-testid="nav-dashboard-link" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 hidden sm:block">
                Dashboard
              </Link>
              <Link to="/support" data-testid="nav-support-link" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 inline-flex items-center gap-1.5">
                <LifeBuoy className="w-3.5 h-3.5" /> Support
              </Link>
              <NotificationsBell />
              <Link to="/profile" data-testid="nav-profile-link" className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/80 text-xs hover:bg-white/5 transition-colors">
                {user.profile_photo_url ? (
                  <img src={user.profile_photo_url} alt={user.name} className="h-6 w-6 rounded-full object-cover border border-white/10" />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300"><UserRound className="w-3.5 h-3.5" /></span>
                )}
                <span data-testid="nav-user-name" className="max-w-28 truncate">{user.name}</span>
                <span className="text-muted-foreground">·</span>
                <span data-testid="nav-user-role" className="uppercase tracking-wider text-[hsl(60_56%_91%)]/70">{user.role}</span>
              </Link>
              <Button data-testid="nav-logout-btn" variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login-link" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
                Sign In
              </Link>
              <Button data-testid="nav-register-btn" asChild className="bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
                <Link to="/register/customer">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
