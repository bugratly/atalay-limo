import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, UserPlus, LogIn, UserRound } from "lucide-react";

export default function GetOffersStart() {
  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-16">
      <div className="max-w-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Get private offers</div>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl tracking-tight">Start your ride request.</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Sign in for the full Atalay Limo experience, create a customer account, or continue as a guest for a quick request.
        </p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <Card className="bg-card border-border/70">
          <CardContent className="p-6 flex flex-col min-h-[260px]">
            <div className="w-11 h-11 rounded-md bg-secondary text-[hsl(60_56%_91%)] flex items-center justify-center">
              <LogIn className="w-5 h-5" />
            </div>
            <h2 className="mt-5 font-serif text-2xl">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Already have an account? Sign in to save trip history, manage offers, and access messages.
            </p>
            <Button asChild className="mt-auto w-full bg-[hsl(60_56%_91%)] text-[hsl(223_39%_7%)] hover:bg-[hsl(60_56%_85%)]">
              <Link to="/login">Sign in <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/70">
          <CardContent className="p-6 flex flex-col min-h-[260px]">
            <div className="w-11 h-11 rounded-md bg-secondary text-[hsl(60_56%_91%)] flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 className="mt-5 font-serif text-2xl">Create customer account</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Don&apos;t have an account? Create one to request rides, receive private offers, and pay securely.
            </p>
            <Button asChild variant="outline" className="mt-auto w-full border-[hsl(60_56%_91%)]/30 text-[hsl(60_56%_91%)] hover:bg-[hsl(60_56%_91%)]/10">
              <Link to="/register/customer">Create one</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/70">
          <CardContent className="p-6 flex flex-col min-h-[260px]">
            <div className="w-11 h-11 rounded-md bg-secondary text-[hsl(60_56%_91%)] flex items-center justify-center">
              <UserRound className="w-5 h-5" />
            </div>
            <h2 className="mt-5 font-serif text-2xl">Continue as a guest</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Submit a quick request without creating an account. You can create one later if you want.
            </p>
            <Button asChild variant="ghost" className="mt-auto w-full">
              <Link to="/request">Continue as a guest</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
