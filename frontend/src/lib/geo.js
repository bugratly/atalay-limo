/**
 * Geo + pricing helpers (frontend).
 *
 * IMPORTANT (MAP/ROUTING API HOOK-IN POINT):
 *   Right now we use a Haversine great-circle distance and an average speed
 *   constant for the duration estimate. These are good enough for an MVP.
 *   When you connect a real routing API (OpenRouteService, Mapbox, Google
 *   Directions, etc.), replace `estimateMilesAndMinutes()` with a call that
 *   returns the API's distance + duration. Keep the same return shape so the
 *   UI keeps working unchanged.
 */

const MILES_PER_KM = 0.621371;
const AVG_SPEED_MPH = 30; // city-ish average; replace with routing API value

export function haversineMiles(a, b) {
  if (!a || !b) return null;
  const toRad = (x) => (x * Math.PI) / 180;
  const R_KM = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  return +(km * MILES_PER_KM).toFixed(1);
}

export function estimateMilesAndMinutes(pickup, dropoff) {
  // TODO: when connecting OpenRouteService / Mapbox / Google Directions,
  //       call the routing API here and return { miles, minutes } from it.
  const miles = haversineMiles(pickup, dropoff);
  if (miles == null) return { miles: null, minutes: null };
  const minutes = Math.max(5, Math.round((miles / AVG_SPEED_MPH) * 60));
  return { miles, minutes };
}

// --- Pricing (Atalay Limo) ---------------------------------------------------------
// Base $90 includes first 10 miles. After that, $3 per extra mile.
// Hourly: $75/hr. Long trips (>60 min) default to whichever is higher.
// All prices already include the 20% platform commission.
export const PRICING = {
  BASE_PRICE: 90,
  BASE_MILES_INCLUDED: 10,
  EXTRA_MILE_RATE: 3,
  HOURLY_RATE: 75,
  COMMISSION_PCT: 0.2,
  TAX_RATE: 0.0625,
  LONG_TRIP_MINUTES: 60,
};

export function roundCustomerEstimate(value) {
  if (value == null) return null;
  return Math.floor(Number(value) / 10) * 10;
}

function baseSuvRecommendedPrice({ miles, minutes, mode = "per_mile" }) {
  const hourly = minutes == null ? null : Math.max(1, Math.ceil(minutes / 60)) * PRICING.HOURLY_RATE;
  const perMile = miles == null ? null : PRICING.BASE_PRICE + Math.max(0, miles - PRICING.BASE_MILES_INCLUDED) * PRICING.EXTRA_MILE_RATE;
  if (mode === "hourly") return hourly;
  if (minutes != null && minutes >= 45 && hourly != null) {
    return Math.max(perMile || 0, hourly);
  }
  return perMile;
}

export function recommendedPrice({ miles, minutes, mode = "per_mile", vehicleType = "SUV" }) {
  const suv = baseSuvRecommendedPrice({ miles, minutes, mode });
  if (suv == null) return null;

  const longRide = minutes != null && minutes >= 45;
  let vehiclePrice = suv;

  switch (vehicleType) {
    case "Sedan":
      vehiclePrice = longRide ? suv * 0.95 : Math.max(1, suv - 10);
      break;
    case "Luxury":
      vehiclePrice = Math.max(suv + 20, suv * 1.15);
      break;
    case "Van":
      vehiclePrice = Math.max(suv + 25, suv * 1.15);
      break;
    case "SUV":
    default:
      vehiclePrice = suv;
  }

  return roundCustomerEstimate(vehiclePrice);
}

export function commissionBreakdown(price) {
  if (!price || price <= 0) return { commission: 0, payout: 0 };
  const commission = +(price * PRICING.COMMISSION_PCT).toFixed(2);
  const payout = +(price - commission).toFixed(2);
  return { commission, payout };
}

export function taxBreakdown(price) {
  if (!price || price <= 0) return { tax: 0, total: 0 };
  const tax = +(price * PRICING.TAX_RATE).toFixed(2);
  const total = +(price + tax).toFixed(2);
  return { tax, total };
}

export const PRICING_TEXT =
  "Driver guidance only. Sedan is generally lower than SUV, Luxury is premium, and Van includes a higher vehicle-capacity premium. Customers only see a total price with tax included.";

// --- Service area (MVP) ------------------------------------------------------
// Atalay Limo is Boston-based and currently accepts trips that start in Massachusetts
// or end in Massachusetts. This frontend check is for UX only; backend also
// enforces it before saving a ride request.
export const SERVICE_AREA_TEXT =
  "Atalay Limo is Boston-based. For now, each trip must either start in Massachusetts or end in Massachusetts.";

const MA_BOUNDS = { latMin: 41.15, latMax: 42.95, lngMin: -73.60, lngMax: -69.85 };

export function isMassachusettsLocation(address, coords) {
  if (address && /(\bMA\b|Massachusetts)/i.test(address)) return true;
  if (coords?.lat != null && coords?.lng != null) {
    return (
      coords.lat >= MA_BOUNDS.latMin &&
      coords.lat <= MA_BOUNDS.latMax &&
      coords.lng >= MA_BOUNDS.lngMin &&
      coords.lng <= MA_BOUNDS.lngMax
    );
  }
  return false;
}

export function isSupportedMassachusettsTrip(pickupAddress, pickupCoords, dropoffAddress, dropoffCoords) {
  return isMassachusettsLocation(pickupAddress, pickupCoords) || isMassachusettsLocation(dropoffAddress, dropoffCoords);
}
