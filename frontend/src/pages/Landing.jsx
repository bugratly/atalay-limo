import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Clock4,
  MapPin,
  LockKeyhole,
  Star,
  Tag,
  BriefcaseBusiness,
  Plane,
  Car,
  Users,
} from "lucide-react";

const HERO = "/assets/hero-escalade-chauffeur.png";
const SEDAN = "/assets/premium-sedan-interior.png";
const SUV = "/assets/luxury-suv-preview.png";
const VAN = "/assets/executive-van-preview.png";

const vehicleCards = [
  {
    title: "Premium Sedan",
    eyebrow: "Executive rear-cabin comfort",
    image: SEDAN,
    icon: BriefcaseBusiness,
    bullets: ["Private executive cabin", "Quiet business-class ride", "Ideal for airport and corporate travel"],
    featured: true,
  },
  {
    title: "Luxury SUV",
    eyebrow: "Flagship space and presence",
    image: SUV,
    icon: Car,
    bullets: ["Premium full-size SUV", "Extra luggage capacity", "Comfort for families and VIP arrivals"],
  },
  {
    title: "Executive Van",
    eyebrow: "Group travel made refined",
    image: VAN,
    icon: Users,
    bullets: ["Room for groups and bags", "Great for events and airport runs", "Coordinated private service"],
  },
];

const trustItems = [
  { icon: ShieldCheck, title: "Vetted chauffeurs", body: "Approved drivers, admin-reviewed vehicles, and service standards built around trust." },
  { icon: Tag, title: "Private offers", body: "Send your trip request and compare offers without public pricing clutter." },
  { icon: MapPin, title: "Boston-based", body: "Built for Boston, Logan Airport, and Massachusetts private transportation." },
  { icon: LockKeyhole, title: "Clean total", body: "Customers see a professional final total with tax included before payment." },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(223_39%_7%)] text-[hsl(60_56%_91%)]">
      <div className="grain-overlay absolute inset-0 z-10" />

      <section className="relative min-h-[780px] overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img src={HERO} alt="Atalay Limo private chauffeur SUV" className="h-full w-full object-cover opacity-72" />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(223_39%_7%)] via-[hsl(223_39%_7%)]/80 to-[hsl(223_39%_7%)]/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_28%,transparent_0%,hsl(223_39%_7%/.18)_34%,hsl(223_39%_7%/.86)_82%)]" />
          <div className="absolute inset-0 gradient-fade-bottom" />
        </div>

        <div className="relative z-20 mx-auto max-w-7xl px-5 pt-20 pb-16 sm:px-6 lg:px-10 lg:pt-28">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="min-w-0 lg:col-span-8 fade-up">
              <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-[hsl(42_60%_65%)]/30 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[hsl(60_56%_91%)]/85 backdrop-blur">
                <Sparkles className="h-3 w-3 shrink-0 text-[hsl(42_60%_65%)]" />
                <span className="truncate">Boston-based private chauffeur marketplace</span>
              </div>

              <h1 className="max-w-4xl break-words font-serif text-4xl leading-[1.02] tracking-tight text-[hsl(60_56%_91%)] drop-shadow-2xl sm:text-5xl lg:text-7xl">
                Premium private rides across Massachusetts
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-[hsl(60_20%_78%)] sm:text-lg">
                Atalay Limo connects riders with vetted chauffeurs and premium vehicles for airport transfers, hourly service, business travel, and private events.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-xl bg-[hsl(42_60%_65%)] px-6 text-[hsl(223_39%_7%)] hover:bg-[hsl(42_70%_72%)]">
                  <Link to="/get-offers">Get private offers <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-xl border-white/15 bg-black/20 px-6 text-[hsl(60_56%_91%)] hover:bg-white/10">
                  <Link to="/driver/apply">Drive for us</Link>
                </Button>
              </div>

              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                  <ShieldCheck className="h-5 w-5 text-[hsl(42_60%_65%)]" />
                  <div className="mt-3 text-sm font-medium">Vetted chauffeurs</div>
                  <div className="mt-1 text-xs leading-relaxed text-[hsl(60_20%_70%)]">Reviewed before accepting trips</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                  <Tag className="h-5 w-5 text-[hsl(42_60%_65%)]" />
                  <div className="mt-3 text-sm font-medium">Offer-based</div>
                  <div className="mt-1 text-xs leading-relaxed text-[hsl(60_20%_70%)]">Choose the best private offer</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                  <Clock4 className="h-5 w-5 text-[hsl(42_60%_65%)]" />
                  <div className="mt-3 text-sm font-medium">Local support</div>
                  <div className="mt-1 text-xs leading-relaxed text-[hsl(60_20%_70%)]">Boston-focused assistance</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-5 pb-16 sm:px-6 lg:px-10 lg:-mt-20">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[hsl(42_60%_70%)]">Vehicle classes</div>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl">Choose the right experience</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[hsl(60_20%_70%)]">Premium options for solo travelers, executives, families, and groups.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {vehicleCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className={`group min-w-0 overflow-hidden rounded-3xl border bg-[hsl(222_30%_10%)]/92 shadow-2xl shadow-black/30 backdrop-blur ${card.featured ? "border-[hsl(42_60%_65%)]/70" : "border-white/10"}`}>
                <div className="aspect-[16/10] overflow-hidden bg-black/30">
                  <img src={card.image} alt={card.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(42_60%_65%)]/30 bg-[hsl(42_60%_65%)]/10">
                      <Icon className="h-5 w-5 text-[hsl(42_60%_65%)]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-serif text-2xl">{card.title}</h3>
                      <p className="mt-1 text-sm text-[hsl(42_60%_70%)]">{card.eyebrow}</p>
                    </div>
                  </div>
                  <ul className="mt-5 space-y-2 text-sm text-[hsl(60_20%_75%)]">
                    {card.bullets.map((b) => <li key={b} className="flex gap-2 leading-relaxed"><span className="text-[hsl(42_60%_65%)]">•</span><span>{b}</span></li>)}
                  </ul>
                  <Button asChild variant="outline" className="mt-6 rounded-xl border-white/15 bg-transparent text-[hsl(60_56%_91%)] hover:bg-white/5">
                    <Link to="/request">Request offers <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-white/10 bg-black/20">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">
          {trustItems.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex min-w-0 gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(42_60%_65%)]/30 bg-[hsl(42_60%_65%)]/10">
                <Icon className="h-5 w-5 text-[hsl(42_60%_65%)]" />
              </div>
              <div className="min-w-0">
                <div className="font-medium">{title}</div>
                <p className="mt-1 text-sm leading-relaxed text-[hsl(60_20%_70%)]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[hsl(42_60%_70%)]"><Star className="h-4 w-4 fill-current" /> Local trust</div>
            <h2 className="mt-4 font-serif text-4xl">Built for Boston riders</h2>
            <p className="mt-4 leading-relaxed text-[hsl(60_20%_70%)]">A private transportation experience designed around Massachusetts trips, premium presentation, and controlled communication.</p>
          </div>
          <div className="grid gap-4 lg:col-span-8 md:grid-cols-3">
            {[
              { title: "Airport transfers", body: "Logan, private terminals, hotels, and business addresses." },
              { title: "Hourly service", body: "Keep a chauffeur available for meetings, events, and flexible stops." },
              { title: "Admin-managed safety", body: "Driver approvals, vehicle records, booking oversight, and support visibility." },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-white/10 bg-[hsl(222_30%_10%)]/75 p-6">
                <Plane className="h-5 w-5 text-[hsl(42_60%_65%)]" />
                <h3 className="mt-4 font-serif text-2xl">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[hsl(60_20%_70%)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 text-sm text-[hsl(60_20%_68%)] sm:flex-row sm:justify-between sm:px-6 lg:px-10">
          <div>© {new Date().getFullYear()} Atalay Limo. Boston-based private transportation marketplace.</div>
          <div className="flex flex-wrap gap-5"><span>Privacy</span><Link to="/cancel-refund-policy" className="hover:text-[hsl(60_56%_91%)]">Cancellation & refunds</Link><Link to="/support" className="hover:text-[hsl(60_56%_91%)]">Contact</Link></div>
        </div>
      </footer>
    </div>
  );
}
