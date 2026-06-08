# Atalay Limo — Private Transportation Marketplace (MVP)

## Original Problem Statement
Web MVP for a private transportation marketplace. Three roles: Customer, Driver, Admin. Premium black-car aesthetic. No mobile app, live tracking, chat, or advanced pricing algorithm. Iteration-by-iteration evolution toward a launch-ready MVP.

## User Personas
- **Customer**: Books private rides, sees anonymized offers, accepts one, pays (placeholder), rates chauffeur.
- **Driver**: Browses open requests, sees other drivers' anonymized competing offers, submits price with vehicle details + 20%/80% breakdown, gets customer phone after acceptance.
- **Admin**: Operations oversight — users, rides, offers, bookings, support tickets.

## Core Requirements (Static)
- JWT email/password auth + role-based ProtectedRoute.
- Email & phone verification required for non-admin users.
- Vehicle types: Sedan, SUV, Luxury, Van.
- Status lifecycle: open → offer_received → accepted → payment_pending → confirmed → completed; cancelled.
- 20% platform commission baked into customer price; driver payout = 80%.
- Pricing: $90 base / first 10 mi included / +$3 per extra mile; or $75/hr in hourly mode.
- Driver identity hidden from customer until booking accepted.
- Placeholder payment (no real Stripe yet).

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) + bcrypt + PyJWT — `/app/backend/server.py`.
- **Frontend**: React 19 + react-router-dom + shadcn UI + Tailwind + Leaflet (OSM) + Nominatim.
- **Auth**: JWT in response + httpOnly cookie; Bearer via localStorage.

## What's Been Implemented
**Iteration 1 (Feb 2026)** — Core MVP: landing/login/register, ride/offer/booking lifecycle, placeholder payment, admin ops.

**Iteration 2 (Feb 2026)** — Atalay Limo rebrand, security & verification (email+phone OTP), 20% commission display, driver anonymization, ratings, Contact Support.

**Iteration 3 (Feb 2026)** — Code-review fixes: console.error in catches, useCallback for stable refs, helper-extracted ternaries, RideDetail simplified.

**Iteration 4 (Feb 2026)** — Map + pricing + notifications + payment placeholder
- Address autocomplete via OpenStreetMap **Nominatim** (free, no API key, 350ms debounce).
- **Leaflet + OSM** interactive map preview with pickup/dropoff/me pins.
- Browser **Geolocation API** + reverse-geocode for "Use my current location" button.
- **Haversine** distance + duration estimate (30mph average); hooks ready for OpenRouteService/Mapbox/Google Directions.
- Recommended pricing: `$90 + max(0, miles-10)*$3` per-mile, or `$75/hr` hourly. Live computed on `/customer/new` and shown to drivers on the offer dialog.
- In-app **notifications**: `notify_user` server helper, `/api/notifications`, `NotificationsBell` polling every 30s with unread badge.
- New **Payment placeholder page** at `/payment/:bookingId` with booking summary, fee/tax placeholders, mark-paid CTA, and clearly commented Stripe hook-in points.
- 41/41 backend tests pass; all critical frontend flows green.

## Prioritized Backlog
**P1 (next iteration)**
- Real **Stripe Checkout** to replace placeholder (Connect for automatic 20% split).
- **Twilio SMS + SendGrid email** for verification & notification delivery.
- `GET /api/bookings/{id}` endpoint (Payment.jsx currently filters full list).
- Real driving route via **OpenRouteService** (free tier, has API key) drawing a Polyline on MapPreview.

**P2**
- Pagination on admin tables; CSV export.
- Forgot-password flow.
- Driver vehicle photo + license upload (needs object storage).
- Refer-a-friend / promo codes.

**P3**
- Driver earnings dashboard.
- Refunds & cancellation policy logic.
- Multi-stop / round-trip support.
- Push notifications (Web Push API).

## Next Tasks
1. Stripe Checkout + webhook (replace `/api/bookings/{id}/mark-paid`).
2. OpenRouteService real route + driving distance.
3. SendGrid + Twilio for verification & notification delivery.
4. `GET /api/bookings/{id}` + use in Payment.jsx.
