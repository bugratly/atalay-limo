from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import logging
import uuid
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator, constr

# ---------- Database ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="Atalay Limo API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
PHONE_RE = re.compile(r"^\+?[0-9\s\-]{7,20}$")

# ---------- Pricing ----------
BASE_PRICE = 90.0
BASE_MILES_INCLUDED = 10.0
EXTRA_MILE_RATE = 3.0
HOURLY_RATE = 75.0
LONG_TRIP_MINUTES = 45
COMMISSION_RATE = 0.20
TAX_RATE = 0.0625
VEHICLE_PASSENGER_LIMITS = {"Sedan": 3, "Luxury": 3, "SUV": 6, "Van": 9}
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
SEED_DEMO_USERS = os.environ.get("SEED_DEMO_USERS", "false").lower() == "true"
DEV_RETURN_VERIFICATION_CODE = os.environ.get("DEV_RETURN_VERIFICATION_CODE", "false").lower() == "true"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"


def round_customer_estimate(value: Optional[float]) -> Optional[float]:
    """Round public fare estimates to a simple customer-friendly number.

    Example: 606 -> 600. This keeps the estimate clean
    without exposing the exact pricing formula as a public promise.
    """
    if value is None:
        return None
    return float(int(float(value) // 10) * 10)

def _base_suv_recommended_price(miles: Optional[float], minutes: Optional[int], mode: str = "per_mile") -> Optional[float]:
    per_mile_price = None
    if miles is not None:
        extra_miles = max(0.0, float(miles) - BASE_MILES_INCLUDED)
        per_mile_price = BASE_PRICE + extra_miles * EXTRA_MILE_RATE
    hourly_price = None
    if minutes is not None:
        hours = max(1, (int(minutes) + 59) // 60)
        hourly_price = hours * HOURLY_RATE
    if mode == "hourly":
        return hourly_price
    if minutes is not None and minutes >= LONG_TRIP_MINUTES and hourly_price is not None:
        return max(per_mile_price or 0, hourly_price)
    return per_mile_price


def calculate_recommended_price(miles: Optional[float], minutes: Optional[int], mode: str = "per_mile", vehicle_type: str = "SUV") -> Optional[float]:
    """Server-authoritative recommended fare before tax, adjusted by vehicle class."""
    suv_price = _base_suv_recommended_price(miles, minutes, mode)
    if suv_price is None:
        return None
    long_ride = minutes is not None and int(minutes) >= LONG_TRIP_MINUTES
    vehicle_price = suv_price
    if vehicle_type == "Sedan":
        vehicle_price = suv_price * 0.95 if long_ride else max(1, suv_price - 10)
    elif vehicle_type == "Luxury":
        vehicle_price = max(suv_price + 20, suv_price * 1.15)
    elif vehicle_type == "Van":
        vehicle_price = max(suv_price + 25, suv_price * 1.15)
    else:
        vehicle_price = suv_price
    return round_customer_estimate(vehicle_price)

def calculate_offer_totals(price: float) -> dict:
    subtotal = round(float(price), 2)
    commission = round(subtotal * COMMISSION_RATE, 2)
    payout = round(subtotal - commission, 2)
    tax = round(subtotal * TAX_RATE, 2)
    total = round(subtotal + tax, 2)
    return {
        "platform_commission": commission,
        "driver_payout": payout,
        "tax_rate": TAX_RATE,
        "tax_amount": tax,
        "customer_total_with_tax": total,
    }


# ---------- Service Area ----------
MA_LAT_MIN = 41.15
MA_LAT_MAX = 42.95
MA_LNG_MIN = -73.60
MA_LNG_MAX = -69.85
MA_ADDRESS_RE = re.compile(r"(\bMA\b|Massachusetts)", re.IGNORECASE)

def is_massachusetts_location(address: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None) -> bool:
    """Return True when the location appears to be in Massachusetts.

    We accept either a clear MA/Massachusetts address string or coordinates
    inside a broad Massachusetts bounding box. This keeps the MVP safe even
    before a full geocoding/routing backend is connected.
    """
    if address and MA_ADDRESS_RE.search(address):
        return True
    if lat is not None and lng is not None:
        return MA_LAT_MIN <= float(lat) <= MA_LAT_MAX and MA_LNG_MIN <= float(lng) <= MA_LNG_MAX
    return False

def validate_massachusetts_trip(payload):
    starts_in_ma = is_massachusetts_location(payload.pickup_address, payload.pickup_lat, payload.pickup_lng)
    ends_in_ma = is_massachusetts_location(payload.dropoff_address, payload.dropoff_lat, payload.dropoff_lng)
    if not (starts_in_ma or ends_in_ma):
        raise HTTPException(
            status_code=400,
            detail="Atalay Limo currently accepts trips that either start in Massachusetts or end in Massachusetts.",
        )

def validate_passenger_capacity(vehicle_type: str, passengers: int):
    max_allowed = VEHICLE_PASSENGER_LIMITS.get(vehicle_type, 9)
    if passengers > max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{vehicle_type} supports up to {max_allowed} passengers.",
        )

# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def years_since(iso_value: Optional[str]) -> int:
    if not iso_value:
        return 0
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        today = datetime.now(timezone.utc)
        return max(0, today.year - dt.year - ((today.month, today.day) < (dt.month, dt.day)))
    except Exception:
        return 0



def parse_trip_datetime(date_value: Optional[str], time_value: Optional[str]) -> Optional[datetime]:
    """Parse stored ride date/time as UTC-ish datetime for MVP scheduling rules."""
    if not date_value or not time_value:
        return None
    try:
        dt = datetime.fromisoformat(f"{date_value}T{time_value}:00")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None

def minutes_until_pickup(booking: dict) -> Optional[float]:
    dt = parse_trip_datetime(booking.get("date"), booking.get("time")) or parse_trip_datetime(booking.get("pickup_date"), booking.get("pickup_time"))
    if not dt:
        return None
    return (dt - datetime.now(timezone.utc)).total_seconds() / 60

def wait_fee_for_booking(booking: dict, started_at_iso: Optional[str] = None) -> float:
    dt = parse_trip_datetime(booking.get("date"), booking.get("time")) or parse_trip_datetime(booking.get("pickup_date"), booking.get("pickup_time"))
    if not dt:
        return 0.0
    try:
        started = datetime.fromisoformat((started_at_iso or now_iso()).replace("Z", "+00:00"))
    except Exception:
        started = datetime.now(timezone.utc)
    free_until = dt + timedelta(minutes=15)
    extra_minutes = max(0, int((started - free_until).total_seconds() // 60))
    return float(extra_minutes)

async def auto_cancel_unavailable_driver_bookings(driver_id: str):
    """If confirmed trip is within 60 minutes and driver is not online, cancel and count against driver."""
    driver = await db.users.find_one({"id": driver_id})
    if not driver or driver.get("driver_online"):
        return
    bookings = await db.bookings.find({"driver_id": driver_id, "status": "confirmed", "payment_status": "paid"}).to_list(100)
    for b in bookings:
        mins = minutes_until_pickup(b)
        if mins is not None and 0 <= mins <= 60:
            cancelled_at = now_iso()
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "cancelled", "cancelled_at": cancelled_at, "cancelled_by_role": "system", "cancel_reason": "Driver was not online 1 hour before scheduled pickup", "driver_cancellation": True}})
            await db.ride_requests.update_one({"id": b["ride_request_id"]}, {"$set": {"status": "cancelled", "cancelled_at": cancelled_at, "cancelled_by_role": "system"}})
            await db.users.update_one({"id": driver_id}, {"$inc": {"driver_cancel_count": 1}})
            await notify_user(b["driver_id"], "auto_cancelled", "Ride auto-cancelled", "You were not online 1 hour before pickup. This cancellation counts in your cancellation rate.", "/driver")
            await notify_user(b["customer_id"], "ride_cancelled", "Ride cancelled", "Your scheduled ride was cancelled because the chauffeur was not online 1 hour before pickup. Support will help with next steps.", f"/ride/{b['ride_request_id']}")

def public_rating_color(value: Optional[float]) -> str:
    if value is None:
        return "neutral"
    return "green" if float(value) >= 4.5 else "yellow"

def make_ride_number() -> str:
    """Human-friendly ride number assigned when admin confirms payment."""
    year = datetime.now(timezone.utc).strftime("%y")
    code = secrets.token_hex(3).upper()
    return f"SR-{year}-{code}"

async def unique_ride_number() -> str:
    for _ in range(10):
        number = make_ride_number()
        exists = await db.ride_requests.find_one({"ride_number": number}) or await db.bookings.find_one({"ride_number": number})
        if not exists:
            return number
    return f"SR-{datetime.now(timezone.utc).strftime('%y')}-{str(uuid.uuid4())[:8].upper()}"

def sanitize(s: Optional[str], maxlen: int = 500) -> str:
    if not s:
        return ""
    s = str(s).strip()[:maxlen]
    # React already escapes for XSS, but strip control chars
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)
    return s

def normalize_phone(p: str) -> str:
    return re.sub(r"[\s\-]", "", p.strip())

def public_user(u: dict) -> dict:
    """Sanitized self-view (own data only)."""
    if not u:
        return u
    return {
        "id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"],
        "phone": u.get("phone", ""),
        "age": u.get("age"),
        "profile_photo_url": u.get("profile_photo_url", ""),
        "home_address": u.get("home_address", ""),
        "saved_home_address": u.get("saved_home_address", u.get("home_address", "")),
        "saved_home_lat": u.get("saved_home_lat"),
        "saved_home_lng": u.get("saved_home_lng"),
        "saved_work_address": u.get("saved_work_address", ""),
        "saved_work_lat": u.get("saved_work_lat"),
        "saved_work_lng": u.get("saved_work_lng"),
        "referral_code": u.get("referral_code", ""),
        "business_name": u.get("business_name", ""),
        "languages": u.get("languages", ["English"]),
        "member_years": years_since(u.get("created_at")),
        "email_verified": bool(u.get("email_verified", False)),
        "phone_verified": bool(u.get("phone_verified", False)),
        "admin_approved": bool(u.get("admin_approved", u.get("role") != "driver")),
        "approval_status": u.get("approval_status", "approved" if u.get("role") != "driver" else "pending"),
        "age": u.get("age"),
        "admin_notes": u.get("admin_notes", ""),
        "license_status": u.get("license_status", "not_uploaded"),
        "insurance_status": u.get("insurance_status", "not_uploaded"),
        "documents_last_reviewed_at": u.get("documents_last_reviewed_at"),
        "last_active_at": u.get("last_active_at"),
        "account_active": bool(u.get("account_active", True)),
        "created_at": u.get("created_at"),
    }

def strip_internal(doc: dict) -> dict:
    if not doc:
        return doc
    out = dict(doc)
    out.pop("_id", None)
    out.pop("password_hash", None)
    return out

async def log_admin_action(admin: dict, action: str, target_type: str = "", target_id: str = "", details: Optional[dict] = None):
    """Simple admin audit log for operational accountability."""
    if not admin or admin.get("role") != "admin":
        return
    await db.admin_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin.get("id"),
        "admin_name": admin.get("name", ""),
        "admin_email": admin.get("email", ""),
        "action": sanitize(action, 120),
        "target_type": sanitize(target_type, 60),
        "target_id": sanitize(target_id, 120),
        "details": details or {},
        "created_at": now_iso(),
    })

async def _rating_distribution(query: dict, field: str) -> dict:
    docs = await db.bookings.find({**query, field: {"$ne": None}}, {field: 1}).to_list(1000)
    dist = {str(i): 0 for i in range(1, 6)}
    total = 0
    value_sum = 0.0
    for d in docs:
        try:
            rating = int(d.get(field))
        except Exception:
            continue
        if 1 <= rating <= 5:
            dist[str(rating)] += 1
            total += 1
            value_sum += rating
    avg = round(value_sum / total, 2) if total else None
    return {"average": avg, "count": total, "distribution": dist, "color": public_rating_color(avg)}

async def driver_public_stats(driver_id: str) -> dict:
    """Aggregate chauffeur rating + completed trips for public display."""
    ratings = await _rating_distribution({"driver_id": driver_id}, "customer_rating")
    completed = await db.bookings.count_documents({"driver_id": driver_id, "status": "completed"})
    return {
        "rating": ratings["average"],
        "rating_count": ratings["count"],
        "rating_distribution": ratings["distribution"],
        "rating_color": ratings["color"],
        "completed_trips": completed,
    }

async def customer_public_stats(customer_id: str) -> dict:
    """Aggregate passenger/customer rating + completed trips for driver-facing display."""
    ratings = await _rating_distribution({"customer_id": customer_id}, "driver_rating")
    completed = await db.bookings.count_documents({"customer_id": customer_id, "status": "completed"})
    return {
        "rating": ratings["average"],
        "rating_count": ratings["count"],
        "rating_distribution": ratings["distribution"],
        "rating_color": ratings["color"],
        "completed_trips": completed,
    }

async def account_profile_stats(user_doc: dict) -> dict:
    if user_doc.get("role") == "driver":
        stats = await driver_public_stats(user_doc["id"])
    elif user_doc.get("role") == "customer":
        stats = await customer_public_stats(user_doc["id"])
    else:
        stats = {"rating": None, "rating_count": 0, "rating_distribution": {str(i): 0 for i in range(1, 6)}, "rating_color": "neutral", "completed_trips": 0}
    return {
        **stats,
        "member_years": years_since(user_doc.get("created_at")),
        "languages": user_doc.get("languages", ["English"]),
    }

async def build_driver_earnings(driver_id: str) -> dict:
    """Driver earnings ledger based on bookings.

    Payout is calculated from driver_payout saved on booking,
    falling back to price minus platform commission for older records.
    """
    bookings = await db.bookings.find({"driver_id": driver_id}).sort("created_at", -1).to_list(500)
    rows = []
    total_earned = 0.0
    pending_balance = 0.0
    available_balance = 0.0
    completed_count = 0
    confirmed_count = 0
    cancelled_count = 0

    for b in bookings:
        price = float(b.get("price", 0) or 0)
        commission = float(b.get("platform_commission", round(price * COMMISSION_RATE, 2)) or 0)
        payout = float(b.get("driver_payout", round(price - commission, 2)) or 0)
        status = b.get("status", "pending")
        payment_status = b.get("payment_status", "pending")
        if status == "completed":
            completed_count += 1
            total_earned += payout
            available_balance += payout
        elif status == "confirmed":
            confirmed_count += 1
            pending_balance += payout
        elif status == "cancelled":
            cancelled_count += 1

        rows.append({
            "id": b.get("id"),
            "ride_request_id": b.get("ride_request_id"),
            "ride_number": b.get("ride_number") or "Pending",
            "date": b.get("date") or b.get("created_at", "")[:10],
            "time": b.get("time") or "",
            "pickup_address": b.get("pickup_address", ""),
            "dropoff_address": b.get("dropoff_address", ""),
            "customer_name": b.get("customer_name", "Passenger"),
            "vehicle_type": b.get("vehicle_type", ""),
            "vehicle_details": b.get("vehicle_details", ""),
            "gross_fare": round(price, 2),
            "platform_commission": round(commission, 2),
            "driver_payout": round(payout, 2),
            "tax_amount": round(float(b.get("tax_amount", 0) or 0), 2),
            "customer_total_with_tax": round(float(b.get("customer_total_with_tax", price) or price), 2),
            "status": status,
            "payment_status": payment_status,
            "completed_at": b.get("completed_at") or (b.get("updated_at") if status == "completed" else ""),
            "created_at": b.get("created_at", ""),
        })

    last_completed = next((r for r in rows if r["status"] == "completed"), None)
    return {
        "summary": {
            "total_earned": round(total_earned, 2),
            "available_balance": round(available_balance, 2),
            "pending_balance": round(pending_balance, 2),
            "completed_count": completed_count,
            "confirmed_count": confirmed_count,
            "cancelled_count": cancelled_count,
            "ride_count": len(rows),
            "last_ride_payout": last_completed["driver_payout"] if last_completed else 0,
            "last_ride_number": last_completed["ride_number"] if last_completed else "—",
        },
        "rides": rows,
    }



def build_receipt_lines(booking: dict) -> list[dict]:
    price = float(booking.get("price", 0) or 0)
    waiting_fee = float(booking.get("waiting_fee", 0) or 0)
    adjustments = booking.get("fee_adjustments", []) or []
    subtotal_before_wait = max(0.0, price - waiting_fee - sum(float(x.get("amount", 0) or 0) for x in adjustments))
    lines = [{"label": "Ride fare", "amount": round(subtotal_before_wait, 2)}]
    if waiting_fee:
        lines.append({"label": "Waiting fee", "amount": round(waiting_fee, 2), "note": "First 15 minutes after scheduled pickup are free; after that $1/min."})
    for adj in adjustments:
        lines.append({"label": str(adj.get("type", "Adjustment")).replace("_", " ").title(), "amount": round(float(adj.get("amount", 0) or 0), 2), "note": adj.get("note", "")})
    if booking.get("tax_amount") is not None:
        lines.append({"label": "Tax", "amount": round(float(booking.get("tax_amount", 0) or 0), 2)})
    lines.append({"label": "Total", "amount": round(float(booking.get("customer_total_with_tax", price) or price), 2)})
    return lines

async def driver_performance(driver_id: str) -> dict:
    total = await db.bookings.count_documents({"driver_id": driver_id})
    completed = await db.bookings.count_documents({"driver_id": driver_id, "status": "completed"})
    cancelled = await db.bookings.count_documents({"driver_id": driver_id, "driver_cancellation": True})
    no_show = await db.bookings.count_documents({"driver_id": driver_id, "driver_no_show": True})
    late = await db.bookings.count_documents({"driver_id": driver_id, "late_driver": True})
    complaints = await db.disputes.count_documents({"driver_id": driver_id})
    return {
        "total_bookings": total,
        "completed_trips": completed,
        "acceptance_rate": round((completed / total) * 100, 1) if total else 100,
        "cancellation_rate": round((cancelled / total) * 100, 1) if total else 0,
        "no_show_count": no_show,
        "late_count": late,
        "complaint_count": complaints,
    }

async def customer_risk(customer_id: str) -> dict:
    total = await db.bookings.count_documents({"customer_id": customer_id})
    cancelled = await db.bookings.count_documents({"customer_id": customer_id, "cancelled_by_role": "customer"})
    no_show = await db.bookings.count_documents({"customer_id": customer_id, "customer_no_show": True})
    disputes = await db.disputes.count_documents({"customer_id": customer_id})
    return {
        "total_bookings": total,
        "cancellation_count": cancelled,
        "no_show_count": no_show,
        "dispute_count": disputes,
        "risk_level": "high" if no_show >= 2 or disputes >= 3 else ("medium" if no_show or disputes else "normal"),
    }

# ---------- Models ----------
class RegisterRequest(BaseModel):
    name: constr(strip_whitespace=True, min_length=2, max_length=80)
    email: EmailStr
    phone: constr(strip_whitespace=True, min_length=7, max_length=20)
    password: constr(min_length=6, max_length=128)
    role: Literal["customer", "driver"]
    promo_code: Optional[constr(strip_whitespace=True, max_length=40)] = ""

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        if not PHONE_RE.match(v):
            raise ValueError("Invalid phone number")
        return v

class LoginRequest(BaseModel):
    email: EmailStr
    password: constr(min_length=1, max_length=128)

class VerifyCodeRequest(BaseModel):
    channel: Literal["email", "phone"]
    code: constr(min_length=4, max_length=8)

class RideRequestCreate(BaseModel):
    pickup_address: constr(strip_whitespace=True, min_length=3, max_length=200)
    dropoff_address: constr(strip_whitespace=True, min_length=3, max_length=200)
    date: constr(strip_whitespace=True, min_length=10, max_length=10)
    time: constr(strip_whitespace=True, min_length=5, max_length=5)
    passengers: int = Field(ge=1, le=20)
    luggage: int = Field(ge=0, le=20)
    vehicle_type: Literal["Sedan", "SUV", "Luxury", "Van"]
    notes: Optional[constr(max_length=500)] = ""
    # Map / pricing fields (optional — frontend computes & sends when available)
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    estimated_miles: Optional[float] = Field(default=None, ge=0, le=10000)
    estimated_minutes: Optional[int] = Field(default=None, ge=0, le=10000)
    recommended_price: Optional[float] = Field(default=None, ge=0, le=100000)
    pricing_mode: Optional[Literal["per_mile", "hourly"]] = "per_mile"
    round_trip: bool = False
    return_date: Optional[constr(strip_whitespace=True, min_length=10, max_length=10)] = None
    return_time: Optional[constr(strip_whitespace=True, min_length=5, max_length=5)] = None


class GuestRideRequestCreate(RideRequestCreate):
    guest_name: constr(strip_whitespace=True, min_length=2, max_length=80)
    guest_email: EmailStr
    guest_phone: constr(strip_whitespace=True, min_length=7, max_length=20)

    @field_validator("guest_phone")
    @classmethod
    def _guest_phone(cls, v: str) -> str:
        if not PHONE_RE.match(v):
            raise ValueError("Invalid phone number")
        return v

class AdminRideRequestUpdate(BaseModel):
    pickup_address: Optional[constr(strip_whitespace=True, min_length=3, max_length=200)] = None
    dropoff_address: Optional[constr(strip_whitespace=True, min_length=3, max_length=200)] = None
    date: Optional[constr(strip_whitespace=True, min_length=10, max_length=10)] = None
    time: Optional[constr(strip_whitespace=True, min_length=5, max_length=5)] = None
    passengers: Optional[int] = Field(default=None, ge=1, le=20)
    luggage: Optional[int] = Field(default=None, ge=0, le=20)
    vehicle_type: Optional[Literal["Sedan", "SUV", "Luxury", "Van"]] = None
    notes: Optional[constr(max_length=500)] = None
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    estimated_miles: Optional[float] = Field(default=None, ge=0, le=10000)
    estimated_minutes: Optional[int] = Field(default=None, ge=0, le=10000)
    recommended_price: Optional[float] = Field(default=None, ge=0, le=100000)
    pricing_mode: Optional[Literal["per_mile", "hourly"]] = None
    round_trip: Optional[bool] = None
    return_date: Optional[constr(strip_whitespace=True, min_length=10, max_length=10)] = None
    return_time: Optional[constr(strip_whitespace=True, min_length=5, max_length=5)] = None
    status: Optional[str] = None
    payment_status: Optional[str] = None

class AdminAssignDriverRequest(BaseModel):
    driver_id: str
    vehicle_id: Optional[str] = None

class CustomerPaymentSubmit(BaseModel):
    card_number: constr(strip_whitespace=True, min_length=15, max_length=16)
    card_last5: constr(strip_whitespace=True, min_length=5, max_length=5)
    card_brand: Optional[constr(strip_whitespace=True, max_length=30)] = "Card"
    cardholder_name: constr(strip_whitespace=True, min_length=3, max_length=120)
    expiry: constr(strip_whitespace=True, pattern=r"^(0[1-9]|1[0-2])/\d{2}$")
    cvv: constr(strip_whitespace=True, min_length=3, max_length=4)

class OfferCreate(BaseModel):
    price: float = Field(gt=0, le=100000)
    vehicle_id: Optional[str] = None
    # vehicle_type/details are kept optional for backward compatibility, but admin-created vehicle_id is now required for new driver offers.
    vehicle_type: Optional[Literal["Sedan", "SUV", "Luxury", "Van"]] = None
    vehicle_details: Optional[constr(strip_whitespace=True, max_length=120)] = ""
    eta_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    notes: Optional[constr(max_length=500)] = ""

class VehicleCreate(BaseModel):
    driver_id: str
    vehicle_type: Literal["Sedan", "SUV", "Luxury", "Van"]
    year: Optional[int] = Field(default=None, ge=2018, le=2100)
    make: constr(strip_whitespace=True, min_length=1, max_length=60)
    model: constr(strip_whitespace=True, min_length=1, max_length=60)
    color: Optional[constr(strip_whitespace=True, max_length=40)] = ""
    plate: Optional[constr(strip_whitespace=True, max_length=20)] = ""
    plate_state: Optional[constr(strip_whitespace=True, min_length=2, max_length=30)] = ""
    livery_plate: bool = False
    seats: Optional[int] = Field(default=None, ge=1, le=20)
    luggage_capacity: Optional[int] = Field(default=None, ge=0, le=20)
    photo_url: Optional[constr(strip_whitespace=True, max_length=500)] = ""
    active: bool = True

class VehicleUpdate(BaseModel):
    vehicle_type: Optional[Literal["Sedan", "SUV", "Luxury", "Van"]] = None
    year: Optional[int] = Field(default=None, ge=2018, le=2100)
    make: Optional[constr(strip_whitespace=True, min_length=1, max_length=60)] = None
    model: Optional[constr(strip_whitespace=True, min_length=1, max_length=60)] = None
    color: Optional[constr(strip_whitespace=True, max_length=40)] = None
    plate: Optional[constr(strip_whitespace=True, max_length=20)] = None
    plate_state: Optional[constr(strip_whitespace=True, min_length=2, max_length=30)] = None
    livery_plate: Optional[bool] = None
    seats: Optional[int] = Field(default=None, ge=1, le=20)
    luggage_capacity: Optional[int] = Field(default=None, ge=0, le=20)
    photo_url: Optional[constr(strip_whitespace=True, max_length=500)] = None
    active: Optional[bool] = None

class DriverDocumentSubmit(BaseModel):
    document_type: Literal["driver_license", "insurance_liability_1m", "vehicle_inspection", "tnc_inspection", "car_registration", "profile_photo", "insurance", "vehicle_registration", "other"]
    document_name: constr(strip_whitespace=True, min_length=2, max_length=120)
    file_name: Optional[constr(strip_whitespace=True, max_length=180)] = ""
    file_note: Optional[constr(max_length=500)] = ""
    expiration_date: Optional[constr(strip_whitespace=True, min_length=10, max_length=10)] = None

class DriverDocumentStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "rejected", "expired"]
    admin_note: Optional[constr(max_length=500)] = ""


class ProfileUpdate(BaseModel):
    name: Optional[constr(strip_whitespace=True, min_length=2, max_length=80)] = None
    email: Optional[EmailStr] = None
    phone: Optional[constr(strip_whitespace=True, min_length=7, max_length=20)] = None
    age: Optional[int] = Field(default=None, ge=18, le=100)
    profile_photo_url: Optional[constr(strip_whitespace=True, max_length=500)] = ""
    home_address: Optional[constr(strip_whitespace=True, max_length=200)] = ""
    business_name: Optional[constr(strip_whitespace=True, max_length=120)] = ""
    saved_home_address: Optional[constr(strip_whitespace=True, max_length=220)] = ""
    saved_home_lat: Optional[float] = None
    saved_home_lng: Optional[float] = None
    saved_work_address: Optional[constr(strip_whitespace=True, max_length=220)] = ""
    saved_work_lat: Optional[float] = None
    saved_work_lng: Optional[float] = None

class CustomerPreferencesUpdate(BaseModel):
    saved_home_address: Optional[constr(strip_whitespace=True, max_length=220)] = ""
    saved_home_lat: Optional[float] = None
    saved_home_lng: Optional[float] = None
    saved_work_address: Optional[constr(strip_whitespace=True, max_length=220)] = ""
    saved_work_lat: Optional[float] = None
    saved_work_lng: Optional[float] = None

class CustomerPaymentMethodSubmit(BaseModel):
    card_brand: Optional[constr(strip_whitespace=True, max_length=30)] = "Card"
    card_last4: constr(strip_whitespace=True, min_length=4, max_length=4)
    label: Optional[constr(strip_whitespace=True, max_length=80)] = "Personal card"

class DriverVehicleSubmit(BaseModel):
    vehicle_type: Literal["Sedan", "SUV", "Luxury", "Van"]
    year: Optional[int] = Field(default=None, ge=2018, le=2100)
    make: constr(strip_whitespace=True, min_length=1, max_length=60)
    model: constr(strip_whitespace=True, min_length=1, max_length=60)
    color: Optional[constr(strip_whitespace=True, max_length=40)] = ""
    plate: Optional[constr(strip_whitespace=True, max_length=20)] = ""
    plate_state: Optional[constr(strip_whitespace=True, min_length=2, max_length=30)] = ""
    livery_plate: bool = False
    seats: Optional[int] = Field(default=None, ge=1, le=20)
    luggage_capacity: Optional[int] = Field(default=None, ge=0, le=20)
    photo_url: Optional[constr(strip_whitespace=True, max_length=500)] = ""


class DriverTaxInfoSubmit(BaseModel):
    tax_profile_type: Literal["individual", "business"] = "individual"
    legal_name: constr(strip_whitespace=True, min_length=2, max_length=120)
    ssn_last4: Optional[constr(strip_whitespace=True, min_length=4, max_length=4)] = ""
    ein: Optional[constr(strip_whitespace=True, min_length=9, max_length=12)] = ""
    address_line1: constr(strip_whitespace=True, min_length=2, max_length=160)
    address_line2: Optional[constr(strip_whitespace=True, max_length=120)] = ""
    city: constr(strip_whitespace=True, min_length=2, max_length=80)
    state: constr(strip_whitespace=True, min_length=2, max_length=30)
    zip_code: constr(strip_whitespace=True, min_length=5, max_length=12)

class PayoutMethodSubmit(BaseModel):
    method_type: Literal["bank", "debit_card"]
    account_holder_name: Optional[constr(strip_whitespace=True, min_length=2, max_length=120)] = ""
    routing_number: Optional[constr(strip_whitespace=True, min_length=9, max_length=9)] = ""
    account_number: Optional[constr(strip_whitespace=True, min_length=4, max_length=20)] = ""
    debit_card_last4: Optional[constr(strip_whitespace=True, min_length=4, max_length=4)] = ""
    debit_card_brand: Optional[constr(strip_whitespace=True, max_length=30)] = ""

class AdminTaxStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "rejected"]
    admin_note: Optional[constr(max_length=500)] = ""

class AdminCustomerPaymentMethodUpdate(BaseModel):
    card_brand: Optional[constr(strip_whitespace=True, max_length=30)] = None
    card_last4: Optional[constr(strip_whitespace=True, min_length=4, max_length=4)] = None
    label: Optional[constr(strip_whitespace=True, max_length=80)] = None
    status: Optional[Literal["active", "inactive", "needs_review"]] = None

class AdminPayoutMethodUpdate(BaseModel):
    label: Optional[constr(strip_whitespace=True, max_length=100)] = None
    status: Optional[Literal["active", "inactive", "needs_review"]] = None

class AdminPayoutRequestStatusUpdate(BaseModel):
    status: Literal["pending_admin_review", "approved", "rejected", "paid"]
    admin_note: Optional[constr(max_length=500)] = ""

class AdminUserUpdate(BaseModel):
    name: Optional[constr(strip_whitespace=True, min_length=2, max_length=80)] = None
    phone: Optional[constr(strip_whitespace=True, min_length=7, max_length=20)] = None
    age: Optional[int] = Field(default=None, ge=18, le=100)
    admin_notes: Optional[constr(max_length=1000)] = None
    license_status: Optional[Literal["not_uploaded", "pending", "approved", "rejected", "expired"]] = None
    insurance_status: Optional[Literal["not_uploaded", "pending", "approved", "rejected", "expired"]] = None
    documents_last_reviewed_at: Optional[str] = None
    admin_approved: Optional[bool] = None
    account_active: Optional[bool] = None

class RatingCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[constr(max_length=500)] = ""

class DriverAvailabilityUpdate(BaseModel):
    online: bool

class TripStartRequest(BaseModel):
    start_code: constr(strip_whitespace=True, min_length=4, max_length=4)

class TripCancelRequest(BaseModel):
    reason: Optional[constr(max_length=500)] = ""




class NoShowReport(BaseModel):
    no_show_type: Literal["customer_no_show", "driver_no_show", "late_customer", "late_driver"]
    reason: Optional[constr(max_length=500)] = ""
    fee_amount: Optional[float] = Field(default=0, ge=0, le=1000)

class ExtraStopRequest(BaseModel):
    description: constr(strip_whitespace=True, min_length=2, max_length=300)
    requested_amount: Optional[float] = Field(default=0, ge=0, le=5000)

class DisputeCreate(BaseModel):
    booking_id: Optional[str] = None
    ride_request_id: Optional[str] = None
    category: Literal["late_driver", "late_customer", "no_show", "overcharge", "cleaning_damage", "wrong_address", "service_quality", "other"] = "other"
    message: constr(strip_whitespace=True, min_length=2, max_length=1500)

class AdminDisputeUpdate(BaseModel):
    status: Literal["open", "investigating", "resolved", "rejected"] = "investigating"
    resolution_note: Optional[constr(max_length=1000)] = ""
    credit_amount: Optional[float] = Field(default=0, ge=0, le=5000)
    driver_penalty_amount: Optional[float] = Field(default=0, ge=0, le=5000)

class AdminFeeAdjustment(BaseModel):
    adjustment_type: Literal["waiting_fee", "extra_stop", "cleaning_fee", "smoking_fee", "damage_fee", "discount", "refund", "manual"] = "manual"
    amount: float = Field(ge=-5000, le=5000)
    note: Optional[constr(max_length=700)] = ""

class AdminBookingOverride(BaseModel):
    status: Optional[Literal["payment_pending", "confirmed", "to_pickup", "arrived", "in_progress", "completed", "cancelled", "no_show"]] = None
    payment_status: Optional[Literal["pending", "submitted", "paid", "refunded", "failed"]] = None
    payout_status: Optional[Literal["pending", "available", "paid", "held", "reversed"]] = None
    customer_total_with_tax: Optional[float] = Field(default=None, ge=0, le=100000)
    driver_payout: Optional[float] = Field(default=None, ge=0, le=100000)
    platform_commission: Optional[float] = Field(default=None, ge=0, le=100000)
    admin_note: Optional[constr(max_length=1000)] = ""

class SupportCreate(BaseModel):
    subject: constr(strip_whitespace=True, min_length=2, max_length=120)
    message: constr(strip_whitespace=True, min_length=2, max_length=2000)
    booking_id: Optional[str] = None
    ride_request_id: Optional[str] = None

class BookingMessageCreate(BaseModel):
    message: constr(strip_whitespace=True, min_length=1, max_length=1000)

PERSONAL_CONTACT_RE = re.compile(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d)", re.IGNORECASE)
OFF_PLATFORM_RE = re.compile(r"(cash|venmo|zelle|paypal|outside|off[-\s]?app|direct deal|whatsapp|telegram)", re.IGNORECASE)

def validate_message_policy(text: str):
    if PERSONAL_CONTACT_RE.search(text or ""):
        raise HTTPException(status_code=400, detail="For safety, do not share phone numbers, emails, or personal contact details in chat.")
    if OFF_PLATFORM_RE.search(text or ""):
        raise HTTPException(status_code=400, detail="Off-platform offers or payments are not allowed.")

# ---------- Auth dependencies ----------
async def _decode_token(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user_any(request: Request) -> dict:
    payload = await _decode_token(request)
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("account_active") is False:
        raise HTTPException(status_code=403, detail="Account disabled")
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_active_at": now_iso()}})
    user["last_active_at"] = now_iso()
    user.pop("_id", None)
    return user  # internal use only; callers must wrap with public_user/strip_internal

async def get_current_user(user: dict = Depends(get_current_user_any)) -> dict:
    """Verified user gate. Use on all real endpoints."""
    if user["role"] != "admin" and not (user.get("email_verified") and user.get("phone_verified")):
        raise HTTPException(status_code=403, detail="Verification required")
    return strip_internal(user)

def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker

async def require_approved_driver(user: dict = Depends(require_role("driver"))):
    if not user.get("admin_approved"):
        raise HTTPException(status_code=403, detail="Driver account is pending admin approval")
    return user

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=COOKIE_SECURE,
        samesite="none" if COOKIE_SECURE else "lax", max_age=7 * 24 * 3600, path="/",
    )

# ---------- Auth endpoints ----------
@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    phone = normalize_phone(payload.phone)
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(status_code=400, detail="Phone already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": sanitize(payload.name, 80),
        "email": email,
        "phone": phone,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "admin_approved": False if payload.role == "driver" else True,
        "approval_status": "pending" if payload.role == "driver" else "approved",
        "email_verified": False,
        "phone_verified": False,
        "promo_code_used": sanitize(payload.promo_code or "", 40) if payload.role == "customer" else "",
        "referral_code": f"ATALAY-{user_id[:6].upper()}" if payload.role == "customer" else "",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email, payload.role)
    set_auth_cookie(response, token)
    return {"user": public_user(doc), "token": token}

@api_router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    return {"user": public_user(user), "token": token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user_any)):
    return public_user(user)


@api_router.patch("/profile")
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user_any)):
    data = payload.model_dump(exclude_unset=True)
    updates = {}
    if "name" in data and data["name"] is not None:
        updates["name"] = sanitize(data["name"], 80)
    if "email" in data and data["email"] is not None:
        email = str(data["email"]).lower()
        if email != user.get("email"):
            existing = await db.users.find_one({"email": email, "id": {"$ne": user["id"]}})
            if existing:
                raise HTTPException(status_code=400, detail="Email already registered")
            updates["email"] = email
            updates["email_verified"] = False
    if "phone" in data and data["phone"] is not None:
        if not PHONE_RE.match(data["phone"]):
            raise HTTPException(status_code=400, detail="Invalid phone number")
        phone = normalize_phone(data["phone"])
        if phone != user.get("phone"):
            existing = await db.users.find_one({"phone": phone, "id": {"$ne": user["id"]}})
            if existing:
                raise HTTPException(status_code=400, detail="Phone already registered")
            updates["phone"] = phone
            updates["phone_verified"] = False
    for k in ("age",):
        if k in data:
            updates[k] = data[k]
    for k, maxlen in (("profile_photo_url", 500), ("home_address", 200), ("business_name", 120), ("saved_home_address", 220), ("saved_work_address", 220)):
        if k in data and data[k] is not None:
            updates[k] = sanitize(data[k], maxlen)
    for k in ("saved_home_lat", "saved_home_lng", "saved_work_lat", "saved_work_lng"):
        if k in data:
            updates[k] = data[k]
    if updates:
        updates["updated_at"] = now_iso()
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]})
    return public_user(fresh)

@api_router.get("/profile/stats")
async def my_profile_stats(user: dict = Depends(get_current_user_any)):
    return await account_profile_stats(user)

@api_router.patch("/customer/preferences")
async def update_customer_preferences(payload: CustomerPreferencesUpdate, user: dict = Depends(require_role("customer"))):
    data = payload.model_dump(exclude_unset=True)
    updates = {}
    for k, maxlen in (("saved_home_address", 220), ("saved_work_address", 220)):
        if k in data and data[k] is not None:
            updates[k] = sanitize(data[k], maxlen)
    for k in ("saved_home_lat", "saved_home_lng", "saved_work_lat", "saved_work_lng"):
        if k in data:
            updates[k] = data[k]
    updates["updated_at"] = now_iso()
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]})
    return public_user(fresh)

@api_router.get("/customer/payment-methods")
async def get_customer_payment_methods(user: dict = Depends(require_role("customer"))):
    items = await db.customer_payment_methods.find({"customer_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [strip_internal(i) for i in items]

@api_router.post("/customer/payment-methods")
async def add_customer_payment_method(payload: CustomerPaymentMethodSubmit, user: dict = Depends(require_role("customer"))):
    last4 = re.sub(r"\D", "", payload.card_last4 or "")
    if len(last4) != 4:
        raise HTTPException(status_code=400, detail="Card last 4 must be 4 digits")
    doc = {
        "id": str(uuid.uuid4()),
        "customer_id": user["id"],
        "label": sanitize(payload.label or "Personal card", 80),
        "card_brand": sanitize(payload.card_brand or "Card", 30),
        "card_last4": last4,
        "status": "active",
        "created_at": now_iso(),
    }
    await db.customer_payment_methods.insert_one(doc)
    return strip_internal(doc)

# ---------- Verification (simple OTP MVP) ----------
async def _issue_code(user_id: str, channel: str) -> str:
    code = f"{secrets.randbelow(10**6):06d}"
    await db.verification_codes.update_one(
        {"user_id": user_id, "channel": channel},
        {"$set": {
            "user_id": user_id, "channel": channel, "code": code,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
        }},
        upsert=True,
    )
    logger.info(f"[VERIFY] {channel} code for {user_id}: {code}")
    return code

@api_router.post("/auth/verify/send")
async def verify_send(body: dict, user: dict = Depends(get_current_user_any)):
    channel = body.get("channel")
    if channel not in ("email", "phone"):
        raise HTTPException(status_code=400, detail="Invalid channel")
    code = await _issue_code(user["id"], channel)
    # Development-only convenience. In production, wire SES/Twilio and never return OTP codes to the frontend.
    response = {"ok": True, "channel": channel}
    if DEV_RETURN_VERIFICATION_CODE and ENVIRONMENT != "production":
        response["dev_code"] = code
    return response

@api_router.post("/auth/verify/confirm")
async def verify_confirm(payload: VerifyCodeRequest, user: dict = Depends(get_current_user_any)):
    rec = await db.verification_codes.find_one({"user_id": user["id"], "channel": payload.channel})
    if not rec or rec["code"] != payload.code:
        raise HTTPException(status_code=400, detail="Invalid code")
    exp = rec["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")
    field = "email_verified" if payload.channel == "email" else "phone_verified"
    await db.users.update_one({"id": user["id"]}, {"$set": {field: True}})
    await db.verification_codes.delete_one({"user_id": user["id"], "channel": payload.channel})
    fresh = await db.users.find_one({"id": user["id"]})
    return public_user(fresh)

# ---------- Ride Requests ----------
def build_ride_request_doc(payload: RideRequestCreate, customer_id: str, customer_name: str, extra: Optional[dict] = None) -> dict:
    validate_massachusetts_trip(payload)
    validate_passenger_capacity(payload.vehicle_type, payload.passengers)
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "customer_id": customer_id,
        "customer_name": sanitize(customer_name, 80),
        "pickup_address": sanitize(payload.pickup_address, 200),
        "dropoff_address": sanitize(payload.dropoff_address, 200),
        "date": payload.date,
        "time": payload.time,
        "passengers": payload.passengers,
        "luggage": payload.luggage,
        "vehicle_type": payload.vehicle_type,
        "notes": sanitize(payload.notes or "", 500),
        "status": "open",
        "payment_status": "unpaid",
        "accepted_offer_id": None,
        "pickup_lat": payload.pickup_lat,
        "pickup_lng": payload.pickup_lng,
        "dropoff_lat": payload.dropoff_lat,
        "dropoff_lng": payload.dropoff_lng,
        "estimated_miles": payload.estimated_miles,
        "estimated_minutes": payload.estimated_minutes,
        "recommended_price": calculate_recommended_price(payload.estimated_miles, payload.estimated_minutes, payload.pricing_mode or "per_mile", payload.vehicle_type) if (payload.estimated_miles is not None or payload.estimated_minutes is not None) else payload.recommended_price,
        "pricing_mode": payload.pricing_mode or "per_mile",
        "round_trip": payload.round_trip,
        "return_date": payload.return_date if payload.round_trip else None,
        "return_time": payload.return_time if payload.round_trip else None,
        "created_at": now_iso(),
    }
    if extra:
        doc.update(extra)
    return doc

@api_router.post("/ride-requests")
async def create_ride_request(payload: RideRequestCreate, user: dict = Depends(require_role("customer"))):
    doc = build_ride_request_doc(payload, user["id"], user["name"])
    await db.ride_requests.insert_one(doc)
    return strip_internal(doc)

@api_router.post("/guest/ride-requests")
async def create_guest_ride_request(payload: GuestRideRequestCreate):
    doc = build_ride_request_doc(
        payload,
        f"guest:{str(uuid.uuid4())}",
        payload.guest_name,
        {
            "guest_customer": True,
            "guest_name": sanitize(payload.guest_name, 80),
            "guest_email": payload.guest_email.lower(),
            "guest_phone": normalize_phone(payload.guest_phone),
            "guest_contact_note": "Guest request created without an account. Admin can follow up or ask the guest to create an account before payment.",
        },
    )
    await db.ride_requests.insert_one(doc)
    return {
        "ok": True,
        "id": doc["id"],
        "status": doc["status"],
        "message": "Your request was posted. Atalay Limo will contact you when chauffeur offers are available.",
    }

@api_router.get("/ride-requests")
async def list_ride_requests(user: dict = Depends(get_current_user)):
    if user["role"] == "customer":
        cursor = db.ride_requests.find({"customer_id": user["id"]}).sort("created_at", -1)
    elif user["role"] == "driver":
        if not user.get("admin_approved"):
            raise HTTPException(status_code=403, detail="Driver account is pending admin approval")
        cursor = db.ride_requests.find({"status": {"$in": ["open", "offer_received"]}}).sort("created_at", -1)
    else:
        cursor = db.ride_requests.find({}).sort("created_at", -1)
    items = await cursor.to_list(500)
    cleaned = []
    for item in items:
        out = strip_internal(item)
        if user["role"] == "driver":
            stats = await customer_public_stats(item.get("customer_id", ""))
            out.pop("customer_name", None)
            out["customer_rating"] = stats["rating"]
            out["customer_rating_count"] = stats["rating_count"]
            out["customer_rating_color"] = stats["rating_color"]
            out["customer_public_label"] = f"Client with {stats['rating_count']} rating{'s' if stats['rating_count'] != 1 else ''}"
        cleaned.append(out)
    return cleaned

async def _public_offer_for_customer(o: dict) -> dict:
    """Strip identifying info before serving to customer pre-acceptance."""
    stats = await driver_public_stats(o["driver_id"])
    return {
        "id": o["id"],
        "ride_request_id": o["ride_request_id"],
        "price": o["price"],
        "tax_rate": o.get("tax_rate", TAX_RATE),
        "tax_amount": o.get("tax_amount", round(o["price"] * TAX_RATE, 2)),
        "customer_total_with_tax": o.get("customer_total_with_tax", round(o["price"] * (1 + TAX_RATE), 2)),
        "vehicle_type": o.get("vehicle_type") or "",
        "vehicle_details": o.get("vehicle_details") or "",
        "vehicle_photo_url": o.get("vehicle_photo_url") or "",
        "vehicle_make": o.get("vehicle_make") or "",
        "vehicle_model": o.get("vehicle_model") or "",
        "vehicle_year": o.get("vehicle_year"),
        "eta_minutes": o.get("eta_minutes"),
        # Do not expose driver-written notes to customers or other drivers.
        "status": o["status"],
        "driver_rating": stats["rating"],
        "driver_rating_count": stats["rating_count"],
        "completed_trips": stats["completed_trips"],
        "created_at": o["created_at"],
    }

@api_router.get("/ride-requests/{rid}")
async def get_ride_request(rid: str, user: dict = Depends(get_current_user)):
    rr = await db.ride_requests.find_one({"id": rid})
    if not rr:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] == "customer" and rr["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    rr = strip_internal(rr)
    if user["role"] == "driver":
        stats = await customer_public_stats(rr.get("customer_id", ""))
        rr.pop("customer_name", None)
        rr["customer_rating"] = stats["rating"]
        rr["customer_rating_count"] = stats["rating_count"]
        rr["customer_rating_color"] = stats["rating_color"]
        rr["customer_public_label"] = f"Client with {stats['rating_count']} rating{'s' if stats['rating_count'] != 1 else ''}"
    offers_raw = await db.offers.find({"ride_request_id": rid}).sort("created_at", -1).to_list(200)
    if user["role"] == "customer":
        rr["offers"] = [await _public_offer_for_customer(o) for o in offers_raw]
    elif user["role"] == "driver":
        # Driver sees only their own offer with details; others are anonymized
        result = []
        for o in offers_raw:
            if o["driver_id"] == user["id"]:
                result.append(strip_internal(o))
            else:
                result.append(await _public_offer_for_customer(o))
        rr["offers"] = result
    else:
        rr["offers"] = [strip_internal(o) for o in offers_raw]
    return rr

@api_router.post("/ride-requests/{rid}/cancel")
async def cancel_ride_request(rid: str, user: dict = Depends(get_current_user)):
    rr = await db.ride_requests.find_one({"id": rid})
    if not rr:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and rr["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    updates = {"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by_role": user["role"], "cancelled_by_user_id": user["id"]}
    if user["role"] == "admin":
        updates["admin_cancelled"] = True
    await db.ride_requests.update_one({"id": rid}, {"$set": updates})
    await log_admin_action(user, "ride_request_updated", "ride_request", rid, {"fields": list(updates.keys())})
    await db.bookings.update_many({"ride_request_id": rid, "status": {"$ne": "completed"}}, {"$set": {"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by_role": user["role"], "commission_retained": True if user["role"] == "admin" else False}})
    rr2 = await db.ride_requests.find_one({"id": rid})
    if rr2:
        await notify_user(rr2["customer_id"], "ride_cancelled", "Ride cancelled", "Your ride request has been cancelled.", f"/ride/{rid}")
    return {"ok": True}

# ---------- Offers ----------
@api_router.post("/ride-requests/{rid}/offers")
async def create_offer(rid: str, payload: OfferCreate, user: dict = Depends(require_approved_driver)):
    rr = await db.ride_requests.find_one({"id": rid})
    if not rr:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if rr["status"] not in ("open", "offer_received"):
        raise HTTPException(status_code=400, detail="Ride request not accepting offers")
    if await db.offers.find_one({"ride_request_id": rid, "driver_id": user["id"]}):
        raise HTTPException(status_code=400, detail="You already submitted an offer for this ride")
    if not payload.vehicle_id:
        raise HTTPException(status_code=400, detail="Admin must add a vehicle to your driver profile before you can submit offers")
    vehicle = await db.vehicles.find_one({"id": payload.vehicle_id, "driver_id": user["id"], "active": True})
    if not vehicle:
        raise HTTPException(status_code=400, detail="Vehicle not found or not available for this driver")
    vehicle_details = " ".join(str(x) for x in [vehicle.get("year") or "", vehicle.get("make") or "", vehicle.get("model") or "", vehicle.get("color") or ""] if str(x).strip()).strip()
    oid = str(uuid.uuid4())
    totals = calculate_offer_totals(payload.price)
    doc = {
        "id": oid,
        "ride_request_id": rid,
        "driver_id": user["id"],
        "driver_name": sanitize(user["name"], 80),
        "driver_phone": user.get("phone", ""),
        "price": float(payload.price),
        **totals,
        "vehicle_id": vehicle["id"],
        "vehicle_type": vehicle["vehicle_type"],
        "vehicle_details": sanitize(vehicle_details, 120),
        "vehicle_photo_url": sanitize(vehicle.get("photo_url") or "", 500),
        "vehicle_year": vehicle.get("year"),
        "vehicle_make": sanitize(vehicle.get("make") or "", 60),
        "vehicle_model": sanitize(vehicle.get("model") or "", 60),
        "vehicle_plate": sanitize(vehicle.get("plate") or "", 20),
        "eta_minutes": payload.eta_minutes,
        "notes": sanitize(payload.notes or "", 500),
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.offers.insert_one(doc)
    if rr["status"] == "open":
        await db.ride_requests.update_one({"id": rid}, {"$set": {"status": "offer_received"}})
    # Notify customer (in-app for registered users; admin can see guest requests). Email/SMS placeholder lives inside notify_user.
    if not rr.get("guest_customer"):
        await notify_user(
            rr["customer_id"],
            "offer_received",
            "New offer on your ride",
            f"You received a new offer for your {rr['vehicle_type']} ride on {rr['date']} at {rr['time']}.",
            f"/ride/{rid}",
        )
    return strip_internal(doc)

@api_router.get("/offers/mine")
async def my_offers(user: dict = Depends(require_approved_driver)):
    items = await db.offers.find({"driver_id": user["id"]}).sort("created_at", -1).to_list(500)
    result = []
    for o in items:
        ride = await db.ride_requests.find_one({"id": o["ride_request_id"]})
        o = strip_internal(o)
        o["ride"] = strip_internal(ride) if ride else None
        result.append(o)
    return result

@api_router.get("/driver/earnings")
async def driver_earnings(user: dict = Depends(require_approved_driver)):
    return await build_driver_earnings(user["id"])

@api_router.post("/offers/{oid}/accept")
async def accept_offer(oid: str, user: dict = Depends(require_role("customer"))):
    offer = await db.offers.find_one({"id": oid})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    rr = await db.ride_requests.find_one({"id": offer["ride_request_id"]})
    if not rr or rr["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if rr["status"] not in ("open", "offer_received"):
        raise HTTPException(status_code=400, detail="Ride is not pending")
    await db.offers.update_one({"id": oid}, {"$set": {"status": "accepted"}})
    await db.offers.update_many(
        {"ride_request_id": rr["id"], "id": {"$ne": oid}},
        {"$set": {"status": "rejected"}},
    )
    await db.ride_requests.update_one(
        {"id": rr["id"]},
        {"$set": {"status": "payment_pending", "payment_status": "pending", "accepted_offer_id": oid}},
    )
    customer = await db.users.find_one({"id": rr["customer_id"]})
    booking = {
        "id": str(uuid.uuid4()),
        "ride_request_id": rr["id"],
        "offer_id": oid,
        "customer_id": rr["customer_id"],
        "customer_name": rr["customer_name"],
        "customer_phone": customer.get("phone", "") if customer else "",
        "driver_id": offer["driver_id"],
        "driver_name": offer["driver_name"],
        "driver_phone": offer.get("driver_phone", ""),
        "vehicle_type": offer.get("vehicle_type") or rr["vehicle_type"],
        "vehicle_details": offer.get("vehicle_details") or "",
        "vehicle_photo_url": offer.get("vehicle_photo_url") or "",
        "vehicle_year": offer.get("vehicle_year"),
        "vehicle_make": offer.get("vehicle_make") or "",
        "vehicle_model": offer.get("vehicle_model") or "",
        "date": rr.get("date"),
        "time": rr.get("time"),
        "pickup_address": rr.get("pickup_address"),
        "dropoff_address": rr.get("dropoff_address"),
        "pickup_lat": rr.get("pickup_lat"),
        "pickup_lng": rr.get("pickup_lng"),
        "dropoff_lat": rr.get("dropoff_lat"),
        "dropoff_lng": rr.get("dropoff_lng"),
        "start_code": f"{secrets.randbelow(10000):04d}",
        "price": offer["price"],
        "platform_commission": offer.get("platform_commission", round(offer["price"] * COMMISSION_RATE, 2)),
        "driver_payout": offer.get("driver_payout", round(offer["price"] * (1 - COMMISSION_RATE), 2)),
        "tax_rate": offer.get("tax_rate", TAX_RATE),
        "tax_amount": offer.get("tax_amount", round(offer["price"] * TAX_RATE, 2)),
        "customer_total_with_tax": offer.get("customer_total_with_tax", round(offer["price"] * (1 + TAX_RATE), 2)),
        "status": "payment_pending",
        "payment_status": "pending",
        "customer_rating": None,
        "customer_comment": "",
        "created_at": now_iso(),
    }
    await db.bookings.insert_one(booking)
    # Notify the selected driver.
    await notify_user(
        offer["driver_id"],
        "offer_selected",
        "Your offer was selected",
        f"Customer selected your ${offer['price']:.2f} offer. Admin payment confirmation is required before contact details are released.",
        f"/ride/{rr['id']}",
    )
    booking_response = strip_internal(booking)
    # Customer selected an offer, but the ride is not matched until admin confirms payment.
    booking_response.pop("driver_phone", None)
    booking_response["driver_name"] = "Chauffeur pending admin confirmation"
    return {"ok": True, "booking": booking_response}

# ---------- Bookings ----------
@api_router.post("/payments/{bid}/submit")
async def submit_customer_payment(bid: str, payload: CustomerPaymentSubmit, user: dict = Depends(require_role("customer"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.get("status") not in ("payment_pending", "pending"):
        raise HTTPException(status_code=400, detail="Booking is not waiting for customer payment")
    digits = "".join(ch for ch in payload.card_number if ch.isdigit())
    if len(digits) not in (15, 16):
        raise HTTPException(status_code=400, detail="Card number must be 15 or 16 digits")
    if payload.card_last5 != digits[-5:]:
        raise HTTPException(status_code=400, detail="Card last digits do not match")
    yy = int(payload.expiry.split("/")[1])
    if yy < 26:
        raise HTTPException(status_code=400, detail="Card expiration must not be earlier than 2026")
    cvv_digits = "".join(ch for ch in payload.cvv if ch.isdigit())
    if len(digits) == 15 and len(cvv_digits) != 4:
        raise HTTPException(status_code=400, detail="Amex CVV must be exactly 4 digits")
    if len(digits) == 16 and len(cvv_digits) != 3:
        raise HTTPException(status_code=400, detail="Visa/Mastercard CVV must be exactly 3 digits")

    pay = {
        "id": str(uuid.uuid4()),
        "booking_id": bid,
        "customer_id": user["id"],
        "amount": booking.get("customer_total_with_tax", booking.get("price", 0)),
        "card_last5": payload.card_last5,
        "card_brand": sanitize(payload.card_brand or ("Amex" if len(digits) == 15 else "Visa/Mastercard"), 30),
        "cardholder_name": sanitize(payload.cardholder_name, 120),
        "expiry": payload.expiry,
        "status": "submitted_pending_admin_confirmation",
        "created_at": now_iso(),
    }
    await db.payment_submissions.insert_one(pay)
    await db.bookings.update_one({"id": bid}, {"$set": {"payment_status": "submitted", "payment_submitted_at": now_iso(), "payment_card_last5": payload.card_last5}})
    await db.ride_requests.update_one({"id": booking["ride_request_id"]}, {"$set": {"payment_status": "submitted"}})
    await notify_user(booking["customer_id"], "payment_submitted", "Payment submitted", "Thank you. Your payment is pending system/admin confirmation, usually within 1–2 hours.", f"/payment/{bid}")
    await notify_user(booking["driver_id"], "payment_submitted", "Payment submitted", "Customer payment was submitted. Contact details unlock after admin confirmation.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True, "message": "Thank you. Your payment was submitted. System approval usually takes 1–2 hours.", "payment_status": "submitted"}

@api_router.post("/bookings/{bid}/mark-paid")
async def mark_booking_paid(bid: str, user: dict = Depends(require_role("admin"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    ride_number = booking.get("ride_number")
    if not ride_number:
        rr_existing = await db.ride_requests.find_one({"id": booking["ride_request_id"]})
        ride_number = (rr_existing or {}).get("ride_number") or await unique_ride_number()
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "confirmed", "payment_status": "paid", "confirmed_at": now_iso(), "confirmed_by_admin_id": user["id"], "ride_number": ride_number}})
    await log_admin_action(user, "payment_confirmed", "booking", bid, {"ride_number": ride_number})
    await db.ride_requests.update_one(
        {"id": booking["ride_request_id"]},
        {"$set": {"status": "confirmed", "payment_status": "paid", "ride_number": ride_number}},
    )
    await notify_user(booking["customer_id"], "booking_confirmed", "Booking confirmed", "Admin confirmed payment. Your chauffeur contact is now available.", f"/ride/{booking['ride_request_id']}")
    await notify_user(booking["driver_id"], "booking_confirmed", "Booking confirmed", "Admin confirmed payment. Passenger contact is now available.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True}

@api_router.post("/driver/availability")
async def update_driver_availability(payload: DriverAvailabilityUpdate, user: dict = Depends(require_role("driver"))):
    stamp = now_iso()
    await db.users.update_one({"id": user["id"]}, {"$set": {"driver_online": payload.online, "driver_online_updated_at": stamp}})
    if payload.online:
        await db.users.update_one({"id": user["id"]}, {"$set": {"driver_online_since": stamp}})
    await auto_cancel_unavailable_driver_bookings(user["id"])
    return {"ok": True, "online": payload.online}

@api_router.post("/bookings/{bid}/on-my-way")
async def booking_on_my_way(bid: str, user: dict = Depends(require_role("driver"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    if booking["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.get("status") != "confirmed" or booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Ride must be confirmed before going to pickup")
    mins = minutes_until_pickup(booking)
    if mins is not None and mins > 60:
        raise HTTPException(status_code=400, detail="You can mark To pickup point only within 1 hour of scheduled pickup")
    if not (await db.users.find_one({"id": user["id"]})).get("driver_online"):
        raise HTTPException(status_code=400, detail="Go online first. Drivers must be online within 1 hour of a scheduled ride")
    stamp = now_iso()
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "to_pickup", "to_pickup_at": stamp, "updated_at": stamp}})
    await notify_user(booking["customer_id"], "driver_to_pickup", "Chauffeur is on the way", "Your chauffeur is heading to the pickup point.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True}

@api_router.post("/bookings/{bid}/arrived")
async def booking_arrived(bid: str, user: dict = Depends(require_role("driver"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    if booking["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.get("status") not in ("to_pickup", "confirmed"):
        raise HTTPException(status_code=400, detail="Ride must be confirmed or to pickup first")
    stamp = now_iso()
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "arrived", "arrived_at": stamp, "updated_at": stamp}})
    await notify_user(booking["customer_id"], "driver_arrived", "Chauffeur arrived", "Your chauffeur has arrived. The first 15 minutes after scheduled pickup are free; after that waiting time is $1/min.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True}

@api_router.post("/bookings/{bid}/start")
async def start_booking(bid: str, payload: TripStartRequest, user: dict = Depends(require_role("driver"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    if booking["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.get("status") not in ("arrived", "to_pickup", "confirmed"):
        raise HTTPException(status_code=400, detail="Ride is not ready to start")
    if str(payload.start_code) != str(booking.get("start_code", "")):
        raise HTTPException(status_code=400, detail="Wrong 4-digit customer ride code")
    stamp = now_iso()
    waiting_fee = wait_fee_for_booking(booking, stamp)
    updates = {"status": "in_progress", "started_at": stamp, "updated_at": stamp, "waiting_fee": waiting_fee}
    if waiting_fee:
        updates["customer_total_with_tax"] = round(float(booking.get("customer_total_with_tax", booking.get("price", 0))) + waiting_fee, 2)
        updates["price"] = round(float(booking.get("price", 0)) + waiting_fee, 2)
    await db.bookings.update_one({"id": bid}, {"$set": updates})
    await db.ride_requests.update_one({"id": booking["ride_request_id"]}, {"$set": {"status": "in_progress"}})
    await notify_user(booking["customer_id"], "ride_started", "Ride started", f"Your ride has started. Waiting fee added: ${waiting_fee:.2f}.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True, "waiting_fee": waiting_fee}

@api_router.post("/bookings/{bid}/complete")
async def complete_booking(bid: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if user["role"] == "driver" and booking["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.get("status") not in ("in_progress", "arrived", "to_pickup", "confirmed"):
        raise HTTPException(status_code=400, detail="Ride must be active before completion")
    completed_at = now_iso()
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "completed", "completed_at": completed_at, "updated_at": completed_at}})
    await db.ride_requests.update_one({"id": booking["ride_request_id"]}, {"$set": {"status": "completed", "completed_at": completed_at}})
    if user["role"] == "admin":
        await log_admin_action(user, "booking_completed", "booking", bid, {"ride_request_id": booking.get("ride_request_id")})
    await notify_user(booking["driver_id"], "ride_completed", "Ride completed", "This ride is now marked complete. Your payout is reflected in earnings. Please rate how the trip went.", f"/ride/{booking['ride_request_id']}")
    await notify_user(booking["customer_id"], "ride_completed", "Ride completed", "Your ride is complete. Please rate your chauffeur.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True}

@api_router.post("/bookings/{bid}/cancel")
async def driver_cancel_booking(bid: str, payload: TripCancelRequest, user: dict = Depends(require_role("driver"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    if booking["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Ride is already closed")
    stamp = now_iso()
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "cancelled", "cancelled_at": stamp, "cancelled_by_role": "driver", "cancel_reason": sanitize(payload.reason or "", 500), "driver_cancellation": True}})
    await db.ride_requests.update_one({"id": booking["ride_request_id"]}, {"$set": {"status": "cancelled", "cancelled_at": stamp, "cancelled_by_role": "driver"}})
    await db.users.update_one({"id": user["id"]}, {"$inc": {"driver_cancel_count": 1}})
    await notify_user(booking["customer_id"], "ride_cancelled", "Ride cancelled", "Your chauffeur cancelled this ride. Support can help you rebook.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True}

@api_router.post("/bookings/{bid}/rate")
async def rate_booking(bid: str, payload: RatingCreate, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    if booking["status"] != "completed":
        raise HTTPException(status_code=400, detail="Booking not completed yet")
    if user["role"] == "customer":
        if booking["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        if booking.get("customer_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.bookings.update_one({"id": bid}, {"$set": {"customer_rating": payload.rating, "customer_comment": sanitize(payload.comment or "", 500)}})
        return {"ok": True}
    if user["role"] == "driver":
        if booking["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        if booking.get("driver_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.bookings.update_one({"id": bid}, {"$set": {"driver_rating": payload.rating, "driver_comment": sanitize(payload.comment or "", 500)}})
        return {"ok": True}
    raise HTTPException(status_code=403, detail="Forbidden")

@api_router.get("/bookings")
async def list_bookings(user: dict = Depends(get_current_user)):
    if user["role"] == "driver":
        await auto_cancel_unavailable_driver_bookings(user["id"])
    if user["role"] == "customer":
        q = {"customer_id": user["id"]}
    elif user["role"] == "driver":
        q = {"driver_id": user["id"]}
    else:
        q = {}
    items = await db.bookings.find(q).sort("created_at", -1).to_list(500)
    out = []
    for b in items:
        b = strip_internal(b)
        is_confirmed = b.get("payment_status") == "paid" and b.get("status") in ("confirmed", "to_pickup", "arrived", "in_progress", "completed")
        if user["role"] == "customer":
            b.pop("driver_id", None)
            # Customer sees the 4-digit ride start code after payment is confirmed. Driver never receives it from the API.
            if not is_confirmed:
                b.pop("start_code", None)

                b.pop("driver_phone", None)
                b["driver_name"] = "Chauffeur pending admin confirmation"
        elif user["role"] == "driver":
            b.pop("customer_id", None)
            b.pop("start_code", None)
            if not is_confirmed:
                b.pop("customer_phone", None)
                b["customer_name"] = "Passenger pending admin confirmation"
        b["receipt_lines"] = build_receipt_lines(b)
        out.append(b)
    return out

# ---------- Notifications ----------
# MVP-level in-app notifications. Frontend polls /api/notifications.
# For real email/SMS delivery, wire SendGrid/Twilio inside `notify_user`.
async def notify_user(user_id: str, kind: str, title: str, body: str, link: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,  # e.g. "offer_received" | "offer_accepted" | "payment_confirmed"
        "title": sanitize(title, 120),
        "body": sanitize(body, 500),
        "link": sanitize(link, 200),
        "read": False,
        "created_at": now_iso(),
    }
    await db.notifications.insert_one(doc)
    # TODO: send real email/SMS here (SendGrid / Twilio). For MVP we just log.
    logger.info(f"[NOTIFY:{kind}] -> {user_id}: {title}")

async def notify_admins(kind: str, title: str, body: str, link: str = "/admin"):
    admins = await db.users.find({"role": "admin"}).to_list(100)
    for admin in admins:
        await notify_user(admin["id"], kind, title, body, link)

@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [strip_internal(i) for i in items]

@api_router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}

# ---------- Booking Messages ----------
CHAT_POLICY_TEXT = (
    "For safety, do not share personal data, phone numbers, emails, or outside contact details. "
    "Off-platform offers or payments are not allowed. If a customer or driver cancels after admin confirmation, "
    "Atalay Limo may still keep the platform commission according to the booking policy."
)

def can_access_booking_chat(booking: dict, user: dict) -> bool:
    if user["role"] == "admin":
        return True
    return booking.get("payment_status") == "paid" and booking.get("status") in ("confirmed", "to_pickup", "arrived", "in_progress", "completed") and (
        booking.get("customer_id") == user["id"] or booking.get("driver_id") == user["id"]
    )

@api_router.get("/bookings/{bid}/messages")
async def list_booking_messages(bid: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not can_access_booking_chat(booking, user):
        raise HTTPException(status_code=403, detail="Chat unlocks after admin confirms payment and the ride is matched")
    items = await db.booking_messages.find({"booking_id": bid}).sort("created_at", 1).to_list(500)
    return {"policy": CHAT_POLICY_TEXT, "booking": strip_internal(booking), "messages": [strip_internal(i) for i in items]}

@api_router.post("/bookings/{bid}/messages")
async def create_booking_message(bid: str, payload: BookingMessageCreate, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not can_access_booking_chat(booking, user):
        raise HTTPException(status_code=403, detail="Chat unlocks after admin confirms payment and the ride is matched")
    validate_message_policy(payload.message)
    doc = {
        "id": str(uuid.uuid4()),
        "booking_id": bid,
        "ride_request_id": booking.get("ride_request_id"),
        "sender_id": user["id"],
        "sender_role": user["role"],
        "sender_name": sanitize(user.get("name", ""), 80),
        "message": sanitize(payload.message, 1000),
        "created_at": now_iso(),
    }
    await db.booking_messages.insert_one(doc)
    recipient_ids = []
    if user["role"] == "customer":
        recipient_ids = [booking.get("driver_id")]
    elif user["role"] == "driver":
        recipient_ids = [booking.get("customer_id")]
    elif user["role"] == "admin":
        recipient_ids = [booking.get("customer_id"), booking.get("driver_id")]
    for recipient_id in [x for x in recipient_ids if x]:
        await notify_user(recipient_id, "booking_message", "New booking message", "You received a new message for your confirmed booking.", f"/messages/{bid}")
    return strip_internal(doc)

# ---------- Support ----------
def can_access_support_thread(thread: dict, user: dict) -> bool:
    return user["role"] == "admin" or thread.get("user_id") == user["id"]

async def _validate_support_relation(payload: SupportCreate, user: dict) -> tuple[Optional[str], Optional[str]]:
    booking_id = payload.booking_id or None
    ride_request_id = payload.ride_request_id or None
    if booking_id:
        booking = await db.bookings.find_one({"id": booking_id})
        if not booking:
            raise HTTPException(status_code=404, detail="Related booking not found")
        if user["role"] == "customer" and booking.get("customer_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You can only contact support about your own booking")
        if user["role"] == "driver" and booking.get("driver_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You can only contact support about your own booking")
        ride_request_id = booking.get("ride_request_id") or ride_request_id
    if ride_request_id:
        rr = await db.ride_requests.find_one({"id": ride_request_id})
        if not rr:
            raise HTTPException(status_code=404, detail="Related ride request not found")
        if user["role"] == "customer" and rr.get("customer_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You can only contact support about your own ride request")
        # Drivers may ask support about a ride they offered on or are booked for.
        if user["role"] == "driver":
            offered = await db.offers.find_one({"ride_request_id": ride_request_id, "driver_id": user["id"]})
            booked = await db.bookings.find_one({"ride_request_id": ride_request_id, "driver_id": user["id"]})
            if not offered and not booked:
                raise HTTPException(status_code=403, detail="You can only contact support about rides connected to your account")
    return booking_id, ride_request_id

@api_router.post("/support")
async def create_support_message(payload: SupportCreate, user: dict = Depends(get_current_user)):
    booking_id, ride_request_id = await _validate_support_relation(payload, user)
    thread_id = str(uuid.uuid4())
    created = now_iso()
    thread = {
        "id": thread_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "user_phone": user.get("phone", ""),
        "user_role": user["role"],
        "subject": sanitize(payload.subject, 120),
        "booking_id": booking_id,
        "ride_request_id": ride_request_id,
        "status": "open",
        "created_at": created,
        "updated_at": created,
        "last_message": sanitize(payload.message, 300),
        "last_message_at": created,
    }
    msg = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "booking_id": booking_id,
        "ride_request_id": ride_request_id,
        "sender_id": user["id"],
        "sender_role": user["role"],
        "sender_name": sanitize(user.get("name", ""), 80),
        "message": sanitize(payload.message, 2000),
        "created_at": created,
    }
    await db.support_threads.insert_one(thread)
    await db.support_thread_messages.insert_one(msg)
    # Keep a lightweight legacy record so older admin counters still have data if needed.
    await db.support_messages.insert_one({**thread, "message": msg["message"], "thread_id": thread_id})
    return strip_internal({**thread, "first_message": msg})

@api_router.get("/support/threads")
async def list_support_threads(user: dict = Depends(get_current_user)):
    q = {} if user["role"] == "admin" else {"user_id": user["id"]}
    items = await db.support_threads.find(q).sort("updated_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.get("/support/threads/{tid}/messages")
async def list_support_thread_messages(tid: str, user: dict = Depends(get_current_user)):
    thread = await db.support_threads.find_one({"id": tid})
    if not thread:
        raise HTTPException(status_code=404, detail="Support conversation not found")
    if not can_access_support_thread(thread, user):
        raise HTTPException(status_code=403, detail="This support conversation is private")
    items = await db.support_thread_messages.find({"thread_id": tid}).sort("created_at", 1).to_list(500)
    return {"thread": strip_internal(thread), "messages": [strip_internal(i) for i in items]}

@api_router.post("/support/threads/{tid}/messages")
async def create_support_thread_message(tid: str, payload: BookingMessageCreate, user: dict = Depends(get_current_user)):
    thread = await db.support_threads.find_one({"id": tid})
    if not thread:
        raise HTTPException(status_code=404, detail="Support conversation not found")
    if not can_access_support_thread(thread, user):
        raise HTTPException(status_code=403, detail="This support conversation is private")
    doc = {
        "id": str(uuid.uuid4()),
        "thread_id": tid,
        "booking_id": thread.get("booking_id"),
        "ride_request_id": thread.get("ride_request_id"),
        "sender_id": user["id"],
        "sender_role": user["role"],
        "sender_name": sanitize(user.get("name", ""), 80),
        "message": sanitize(payload.message, 2000),
        "created_at": now_iso(),
    }
    await db.support_thread_messages.insert_one(doc)
    await db.support_threads.update_one({"id": tid}, {"$set": {"last_message": sanitize(payload.message, 300), "last_message_at": doc["created_at"], "updated_at": doc["created_at"], "status": "open"}})
    if user["role"] == "admin":
        await notify_user(thread["user_id"], "support_reply", "Atalay Limo support replied", "You received a new support message.", "/support")
    else:
        # MVP: admin reads from support inbox. Real email/SMS can be wired later.
        logger.info(f"[SUPPORT] New message from {user['role']} {user['email']} in thread {tid}")
    return strip_internal(doc)

@api_router.get("/admin/support")
async def admin_support(user: dict = Depends(require_role("admin"))):
    items = await db.support_threads.find({}).sort("updated_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.post("/admin/support/{mid}/resolve")
async def admin_resolve_support(mid: str, user: dict = Depends(require_role("admin"))):
    await db.support_threads.update_one({"id": mid}, {"$set": {"status": "resolved", "resolved_at": now_iso(), "resolved_by_admin_id": user["id"]}})
    await log_admin_action(user, "support_resolved", "support_thread", mid)
    await db.support_messages.update_many({"$or": [{"id": mid}, {"thread_id": mid}]}, {"$set": {"status": "resolved"}})
    return {"ok": True}


# ---------- Vehicles ----------
@api_router.get("/vehicles/mine")
async def my_vehicles(user: dict = Depends(require_role("driver"))):
    items = await db.vehicles.find({"driver_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [strip_internal(i) for i in items]



@api_router.post("/driver/vehicles")
async def driver_submit_vehicle(payload: DriverVehicleSubmit, user: dict = Depends(require_role("driver"))):
    doc = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "driver_name": user.get("name", ""),
        "vehicle_type": payload.vehicle_type,
        "year": payload.year,
        "make": sanitize(payload.make, 60),
        "model": sanitize(payload.model, 60),
        "color": sanitize(payload.color or "", 40),
        "plate": sanitize(payload.plate or "", 20),
        "plate_state": sanitize(payload.plate_state or "", 30),
        "livery_plate": bool(payload.livery_plate),
        "seats": payload.seats,
        "luggage_capacity": payload.luggage_capacity,
        "photo_url": sanitize(payload.photo_url or "", 500),
        "active": False,
        "approval_status": "pending",
        "submitted_by_driver": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.vehicles.insert_one(doc)
    await notify_admins("driver_vehicle_submitted", "Driver vehicle submitted", f"{user.get('name', 'Driver')} submitted {doc['year'] or ''} {doc['make']} {doc['model']} for approval.", "/admin")
    return strip_internal(doc)

@api_router.patch("/admin/ride-requests/{rid}")
async def admin_update_ride_request(rid: str, payload: AdminRideRequestUpdate, user: dict = Depends(require_role("admin"))):
    rr = await db.ride_requests.find_one({"id": rid})
    if not rr:
        raise HTTPException(status_code=404, detail="Ride request not found")
    data = payload.model_dump(exclude_unset=True)
    updates = {}
    text_fields = {"pickup_address": 200, "dropoff_address": 200, "notes": 500}
    for k, maxlen in text_fields.items():
        if k in data and data[k] is not None:
            updates[k] = sanitize(data[k], maxlen)
    for k in ("date", "time", "passengers", "luggage", "vehicle_type", "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng", "estimated_miles", "estimated_minutes", "pricing_mode", "round_trip", "return_date", "return_time", "status", "payment_status"):
        if k in data:
            updates[k] = data[k]
    if "vehicle_type" in updates and "passengers" in updates:
        limit = VEHICLE_PASSENGER_LIMITS.get(updates["vehicle_type"], 20)
        if updates["passengers"] > limit:
            raise HTTPException(status_code=400, detail=f"{updates['vehicle_type']} allows max {limit} passengers")
    miles = updates.get("estimated_miles", rr.get("estimated_miles"))
    minutes = updates.get("estimated_minutes", rr.get("estimated_minutes"))
    mode = updates.get("pricing_mode", rr.get("pricing_mode", "per_mile"))
    vehicle_type = updates.get("vehicle_type", rr.get("vehicle_type", "SUV"))
    if miles is not None or minutes is not None or "vehicle_type" in updates:
        updates["recommended_price"] = calculate_recommended_price(miles, minutes, mode, vehicle_type)
    elif "recommended_price" in data:
        updates["recommended_price"] = data["recommended_price"]
    updates["updated_at"] = now_iso()
    updates["updated_by_admin_id"] = user["id"]
    await db.ride_requests.update_one({"id": rid}, {"$set": updates})
    await log_admin_action(user, "ride_request_updated", "ride_request", rid, {"fields": list(updates.keys())})
    fresh = await db.ride_requests.find_one({"id": rid})
    await notify_user(rr["customer_id"], "ride_updated", "Ride request updated", "Atalay Limo Admin updated your ride request details.", f"/ride/{rid}")
    return strip_internal(fresh)

@api_router.post("/admin/ride-requests/{rid}/cancel")
async def admin_cancel_ride_request(rid: str, user: dict = Depends(require_role("admin"))):
    result = await cancel_ride_request(rid, user)
    await log_admin_action(user, "ride_request_cancelled", "ride_request", rid)
    return result

@api_router.post("/admin/bookings/{bid}/cancel")
async def admin_cancel_booking(bid: str, user: dict = Depends(require_role("admin"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by_admin_id": user["id"], "commission_retained": True}})
    await log_admin_action(user, "booking_cancelled", "booking", bid)
    await db.ride_requests.update_one({"id": booking["ride_request_id"]}, {"$set": {"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by_admin_id": user["id"]}})
    await notify_user(booking["customer_id"], "booking_cancelled", "Booking cancelled", "Atalay Limo Admin cancelled this booking. Platform commission may still apply after confirmation.", f"/ride/{booking['ride_request_id']}")
    await notify_user(booking["driver_id"], "booking_cancelled", "Booking cancelled", "Atalay Limo Admin cancelled this booking. Platform commission may still apply after confirmation.", f"/ride/{booking['ride_request_id']}")
    return {"ok": True}

@api_router.post("/admin/bookings/{bid}/assign-driver")
async def admin_assign_driver(bid: str, payload: AdminAssignDriverRequest, user: dict = Depends(require_role("admin"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    driver = await db.users.find_one({"id": payload.driver_id, "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    vehicle = None
    if payload.vehicle_id:
        vehicle = await db.vehicles.find_one({"id": payload.vehicle_id, "driver_id": payload.driver_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found for this driver")
    else:
        vehicle = await db.vehicles.find_one({"driver_id": payload.driver_id, "active": True})
    vehicle_details = booking.get("vehicle_details", "")
    vehicle_type = booking.get("vehicle_type", "SUV")
    if vehicle:
        vehicle_type = vehicle.get("vehicle_type", vehicle_type)
        vehicle_details = " ".join(str(x) for x in [vehicle.get("year") or "", vehicle.get("make") or "", vehicle.get("model") or "", vehicle.get("color") or ""] if str(x).strip()).strip()
    updates = {
        "driver_id": driver["id"],
        "driver_name": driver.get("name", ""),
        "driver_phone": driver.get("phone", ""),
        "vehicle_type": vehicle_type,
        "vehicle_details": vehicle_details,
        "vehicle_photo_url": vehicle.get("photo_url") if vehicle else booking.get("vehicle_photo_url", ""),
        "vehicle_year": vehicle.get("year") if vehicle else booking.get("vehicle_year"),
        "vehicle_make": vehicle.get("make") if vehicle else booking.get("vehicle_make", ""),
        "vehicle_model": vehicle.get("model") if vehicle else booking.get("vehicle_model", ""),
        "vehicle_id": vehicle.get("id") if vehicle else None,
        "assigned_by_admin_id": user["id"],
        "assigned_at": now_iso(),
    }
    await db.bookings.update_one({"id": bid}, {"$set": updates})
    await log_admin_action(user, "booking_driver_assigned", "booking", bid, {"driver_id": driver["id"], "vehicle_id": vehicle.get("id") if vehicle else None})
    await db.ride_requests.update_one({"id": booking["ride_request_id"]}, {"$set": {"admin_assigned_driver_id": driver["id"], "admin_assigned_at": now_iso()}})
    await notify_user(driver["id"], "driver_assigned", "You were assigned to a booking", "Atalay Limo Admin assigned you to a booking.", f"/ride/{booking['ride_request_id']}")
    await notify_user(booking["customer_id"], "driver_assigned", "Driver assignment updated", "Atalay Limo Admin updated the chauffeur assignment for your booking.", f"/ride/{booking['ride_request_id']}")
    fresh = await db.bookings.find_one({"id": bid})
    return strip_internal(fresh)

@api_router.get("/admin/vehicles")
async def admin_vehicles(user: dict = Depends(require_role("admin"))):
    items = await db.vehicles.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.post("/admin/vehicles")
async def admin_create_vehicle(payload: VehicleCreate, user: dict = Depends(require_role("admin"))):
    driver = await db.users.find_one({"id": payload.driver_id, "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    if not driver.get("admin_approved"):
        raise HTTPException(status_code=400, detail="Driver must be approved before assigning a vehicle")
    doc = {
        "id": str(uuid.uuid4()),
        "driver_id": payload.driver_id,
        "driver_name": driver.get("name", ""),
        "vehicle_type": payload.vehicle_type,
        "year": payload.year,
        "make": sanitize(payload.make, 60),
        "model": sanitize(payload.model, 60),
        "color": sanitize(payload.color or "", 40),
        "plate": sanitize(payload.plate or "", 20),
        "plate_state": sanitize(payload.plate_state or "", 30),
        "livery_plate": bool(payload.livery_plate),
        "seats": payload.seats,
        "luggage_capacity": payload.luggage_capacity,
        "photo_url": sanitize(payload.photo_url or "", 500),
        "active": payload.active,
        "created_at": now_iso(),
    }
    await db.vehicles.insert_one(doc)
    await log_admin_action(user, "vehicle_created", "vehicle", doc["id"], {"driver_id": payload.driver_id, "vehicle_type": payload.vehicle_type})
    return strip_internal(doc)

@api_router.post("/admin/drivers/{uid}/approve")
async def admin_approve_driver(uid: str, user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"id": uid, "role": "driver"}, {"$set": {"admin_approved": True, "approval_status": "approved", "approved_at": now_iso(), "approved_by_admin_id": user["id"]}})
    await log_admin_action(user, "driver_approved", "user", uid)
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    await notify_user(uid, "driver_approved", "Driver account approved", "Your Atalay Limo driver account has been approved. You can now view ride requests and submit offers.", "/driver")
    return {"ok": True}

@api_router.post("/admin/drivers/{uid}/reject")
async def admin_reject_driver(uid: str, user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"id": uid, "role": "driver"}, {"$set": {"admin_approved": False, "approval_status": "rejected", "rejected_at": now_iso(), "rejected_by_admin_id": user["id"]}})
    await log_admin_action(user, "driver_rejected", "user", uid)
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    await notify_user(uid, "driver_rejected", "Driver account not approved", "Your driver account was not approved. Please contact support for details.", "/support")
    return {"ok": True}

@api_router.patch("/admin/users/{uid}")
async def admin_update_user(uid: str, payload: AdminUserUpdate, user: dict = Depends(require_role("admin"))):
    existing = await db.users.find_one({"id": uid})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    updates = {}
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        updates["name"] = sanitize(data["name"], 80)
    if "phone" in data and data["phone"] is not None:
        if not PHONE_RE.match(data["phone"]):
            raise HTTPException(status_code=400, detail="Invalid phone number")
        updates["phone"] = normalize_phone(data["phone"])
    for k in ("age", "license_status", "insurance_status", "documents_last_reviewed_at", "admin_approved", "account_active"):
        if k in data:
            updates[k] = data[k]
    if "admin_notes" in data and data["admin_notes"] is not None:
        updates["admin_notes"] = sanitize(data["admin_notes"], 1000)
    if "admin_approved" in updates and existing.get("role") == "driver":
        updates["approval_status"] = "approved" if updates["admin_approved"] else "pending"
        updates["approval_updated_at"] = now_iso()
        updates["approval_updated_by_admin_id"] = user["id"]
    for k in ("saved_home_lat", "saved_home_lng", "saved_work_lat", "saved_work_lng"):
        if k in data:
            updates[k] = data[k]
    if updates:
        updates["updated_at"] = now_iso()
        await db.users.update_one({"id": uid}, {"$set": updates})
    await log_admin_action(user, "user_updated", "user", uid, {"fields": list(updates.keys())})
    fresh = await db.users.find_one({"id": uid})
    return strip_internal(fresh)

@api_router.get("/admin/drivers/{uid}/profile")
async def admin_driver_profile(uid: str, user: dict = Depends(require_role("admin"))):
    driver = await db.users.find_one({"id": uid, "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    vehicles = await db.vehicles.find({"driver_id": uid}).sort("created_at", -1).to_list(100)
    bookings = await db.bookings.find({"driver_id": uid}).sort("created_at", -1).to_list(100)
    offers = await db.offers.find({"driver_id": uid}).sort("created_at", -1).to_list(100)
    stats = await driver_public_stats(uid)
    return {
        "driver": strip_internal(driver),
        "vehicles": [strip_internal(v) for v in vehicles],
        "bookings": [strip_internal(b) for b in bookings],
        "offers": [strip_internal(o) for o in offers],
        "stats": stats,
    }

@api_router.patch("/admin/vehicles/{vid}")
async def admin_update_vehicle(vid: str, payload: VehicleUpdate, user: dict = Depends(require_role("admin"))):
    existing = await db.vehicles.find_one({"id": vid})
    if not existing:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    data = payload.model_dump(exclude_unset=True)
    updates = {}
    for k in ("vehicle_type", "year", "seats", "luggage_capacity", "active", "livery_plate"):
        if k in data:
            updates[k] = data[k]
    for k in ("make", "model", "color", "plate", "plate_state", "photo_url"):
        if k in data and data[k] is not None:
            updates[k] = sanitize(data[k], 500 if k == "photo_url" else (60 if k in ("make", "model") else 40))
    if "active" in updates:
        updates["approval_status"] = "approved" if updates["active"] else "pending"
    for k in ("saved_home_lat", "saved_home_lng", "saved_work_lat", "saved_work_lng"):
        if k in data:
            updates[k] = data[k]
    if updates:
        updates["updated_at"] = now_iso()
        updates["updated_by_admin_id"] = user["id"]
        updates["updated_by_admin_name"] = user.get("name", "")
        await db.vehicles.update_one({"id": vid}, {"$set": updates})
    await log_admin_action(user, "vehicle_updated", "vehicle", vid, {"fields": list(updates.keys())})
    fresh = await db.vehicles.find_one({"id": vid})
    return strip_internal(fresh)

@api_router.get("/admin/conversations")
async def admin_conversations(user: dict = Depends(require_role("admin"))):
    bookings = await db.bookings.find({}).sort("created_at", -1).to_list(500)
    out = []
    for b in bookings:
        last = await db.booking_messages.find({"booking_id": b["id"]}).sort("created_at", -1).to_list(1)
        count = await db.booking_messages.count_documents({"booking_id": b["id"]})
        item = strip_internal(b)
        item["message_count"] = count
        item["last_message"] = strip_internal(last[0]) if last else None
        out.append(item)
    return out


@api_router.get("/admin/users/{uid}/overview")
async def admin_user_overview(uid: str, user: dict = Depends(require_role("admin"))):
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    role = target.get("role")
    stats = await account_profile_stats(target)
    rating_field = "customer_rating" if role == "driver" else "driver_rating"
    rating_query = {"driver_id": uid} if role == "driver" else {"customer_id": uid}
    rating_rows = []
    for b in await db.bookings.find({**rating_query, rating_field: {"$ne": None}}).sort("created_at", -1).to_list(200):
        rating_rows.append({
            "booking_id": b.get("id"),
            "ride_number": b.get("ride_number", ""),
            "rating": b.get(rating_field),
            "comment": b.get("customer_comment" if role == "driver" else "driver_comment", ""),
            "rated_by_name": b.get("customer_name" if role == "driver" else "driver_name", ""),
            "created_at": b.get("updated_at") or b.get("created_at"),
        })
    vehicles = await db.vehicles.find({"driver_id": uid}).sort("created_at", -1).to_list(100) if role == "driver" else []
    documents = await db.driver_documents.find({"driver_id": uid}).sort("created_at", -1).to_list(200) if role == "driver" else []
    tax_info = await db.driver_tax_info.find_one({"driver_id": uid}) if role == "driver" else None
    payout_methods = await db.payout_methods.find({"driver_id": uid}).sort("created_at", -1).to_list(50) if role == "driver" else []
    payout_requests = await db.payout_requests.find({"driver_id": uid}).sort("created_at", -1).to_list(50) if role == "driver" else []
    payment_methods = await db.customer_payment_methods.find({"customer_id": uid}).sort("created_at", -1).to_list(50) if role == "customer" else []
    ride_query = {"driver_id": uid} if role == "driver" else {"customer_id": uid}
    ride_history = await db.bookings.find(ride_query).sort("created_at", -1).to_list(50) if role in ("driver", "customer") else []
    logs = await db.admin_audit_logs.find({"$or": [{"target_id": uid}, {"details.driver_id": uid}, {"details.customer_id": uid}]}).sort("created_at", -1).to_list(20)
    return {
        "user": public_user(target),
        "stats": stats,
        "rating_rows": rating_rows,
        "vehicles": [strip_internal(x) for x in vehicles],
        "documents": [strip_internal(x) for x in documents],
        "tax_info": strip_internal(tax_info) if tax_info else None,
        "payout_methods": [strip_internal(x) for x in payout_methods],
        "payout_requests": [strip_internal(x) for x in payout_requests],
        "payment_methods": [strip_internal(x) for x in payment_methods],
        "ride_history": [strip_internal(x) for x in ride_history],
        "audit_logs": [strip_internal(x) for x in logs],
        "driver_performance": await driver_performance(uid) if role == "driver" else None,
        "customer_risk": await customer_risk(uid) if role == "customer" else None,
    }

@api_router.patch("/admin/customer-payment-methods/{pid}")
async def admin_update_customer_payment_method(pid: str, payload: AdminCustomerPaymentMethodUpdate, user: dict = Depends(require_role("admin"))):
    existing = await db.customer_payment_methods.find_one({"id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Payment method not found")
    data = payload.model_dump(exclude_unset=True)
    updates = {}
    for k, maxlen in (("card_brand", 30), ("card_last4", 4), ("label", 80), ("status", 30)):
        if k in data and data[k] is not None:
            updates[k] = sanitize(data[k], maxlen)
    if updates:
        updates["updated_at"] = now_iso()
        updates["updated_by_admin_id"] = user["id"]
        updates["updated_by_admin_name"] = user.get("name", "")
        await db.customer_payment_methods.update_one({"id": pid}, {"$set": updates})
    await log_admin_action(user, "customer_payment_method_updated", "customer_payment_method", pid, {"customer_id": existing.get("customer_id"), "fields": list(updates.keys())})
    fresh = await db.customer_payment_methods.find_one({"id": pid})
    return strip_internal(fresh)

@api_router.patch("/admin/payout-methods/{pid}")
async def admin_update_payout_method(pid: str, payload: AdminPayoutMethodUpdate, user: dict = Depends(require_role("admin"))):
    existing = await db.payout_methods.find_one({"id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Payout method not found")
    data = payload.model_dump(exclude_unset=True)
    updates = {}
    for k, maxlen in (("label", 100), ("status", 30)):
        if k in data and data[k] is not None:
            updates[k] = sanitize(data[k], maxlen)
    if updates:
        updates["updated_at"] = now_iso()
        updates["updated_by_admin_id"] = user["id"]
        updates["updated_by_admin_name"] = user.get("name", "")
        await db.payout_methods.update_one({"id": pid}, {"$set": updates})
    await log_admin_action(user, "payout_method_updated", "payout_method", pid, {"driver_id": existing.get("driver_id"), "fields": list(updates.keys())})
    fresh = await db.payout_methods.find_one({"id": pid})
    return strip_internal(fresh)

@api_router.post("/admin/payout-requests/{rid}/status")
async def admin_update_payout_request_status(rid: str, payload: AdminPayoutRequestStatusUpdate, user: dict = Depends(require_role("admin"))):
    existing = await db.payout_requests.find_one({"id": rid})
    if not existing:
        raise HTTPException(status_code=404, detail="Payout request not found")
    updates = {"status": payload.status, "admin_note": sanitize(payload.admin_note or "", 500), "reviewed_at": now_iso(), "reviewed_by_admin_id": user["id"], "reviewed_by_admin_name": user.get("name", "")}
    await db.payout_requests.update_one({"id": rid}, {"$set": updates})
    await log_admin_action(user, "payout_request_status_update", "payout_request", rid, {"driver_id": existing.get("driver_id"), "status": payload.status})
    await notify_user(existing["driver_id"], "payout_request_reviewed", "Payout request updated", f"Your payout request was marked {payload.status}.", "/driver?tab=earnings")
    return {"ok": True}

# ---------- Driver documents ----------
@api_router.get("/driver/documents")
async def list_driver_documents(user: dict = Depends(require_role("driver"))):
    items = await db.driver_documents.find({"driver_id": user["id"]}).sort("created_at", -1).to_list(200)
    return [strip_internal(i) for i in items]

@api_router.post("/driver/documents")
async def submit_driver_document(payload: DriverDocumentSubmit, user: dict = Depends(require_role("driver"))):
    doc = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "driver_name": user.get("name", ""),
        "driver_email": user.get("email", ""),
        "document_type": payload.document_type,
        "document_name": sanitize(payload.document_name, 120),
        "file_name": sanitize(payload.file_name or "", 180),
        "file_note": sanitize(payload.file_note or "", 500),
        "expiration_date": payload.expiration_date,
        "status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.driver_documents.insert_one(doc)
    user_updates = {"documents_last_reviewed_at": None}
    if payload.document_type == "driver_license":
        user_updates["license_status"] = "pending"
    if payload.document_type in ("insurance", "insurance_liability_1m"):
        user_updates["insurance_status"] = "pending"
    await db.users.update_one({"id": user["id"]}, {"$set": user_updates})
    await notify_admins("driver_document_submitted", "Driver document submitted", f"{user.get('name', 'Driver')} submitted {payload.document_type} for review.", "/admin")
    return strip_internal(doc)

@api_router.get("/admin/driver-documents")
async def admin_driver_documents(user: dict = Depends(require_role("admin"))):
    items = await db.driver_documents.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.post("/admin/driver-documents/{doc_id}/status")
async def admin_update_driver_document_status(doc_id: str, payload: DriverDocumentStatusUpdate, user: dict = Depends(require_role("admin"))):
    doc = await db.driver_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.driver_documents.update_one({"id": doc_id}, {"$set": {"status": payload.status, "admin_note": sanitize(payload.admin_note or "", 500), "reviewed_at": now_iso(), "reviewed_by_admin_id": user["id"], "reviewed_by_admin_name": user.get("name", ""), "updated_at": now_iso()}})
    updates = {"documents_last_reviewed_at": now_iso()}
    if doc.get("document_type") == "driver_license":
        updates["license_status"] = payload.status
    if doc.get("document_type") in ("insurance", "insurance_liability_1m"):
        updates["insurance_status"] = payload.status
    await db.users.update_one({"id": doc["driver_id"]}, {"$set": updates})
    await log_admin_action(user, "driver_document_status_update", "driver_document", doc_id, {"status": payload.status, "driver_id": doc.get("driver_id"), "document_type": doc.get("document_type")})
    await notify_user(doc["driver_id"], "driver_document_reviewed", "Driver document reviewed", f"Your {doc.get('document_type', 'document')} was marked {payload.status}.", "/driver")
    return {"ok": True}

@api_router.get("/admin/audit-logs")
async def admin_audit_logs(user: dict = Depends(require_role("admin"))):
    items = await db.admin_audit_logs.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(i) for i in items]


# ---------- Driver tax / payout / vehicle selection ----------
def mask_bank_number(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        return ""
    return "****" + digits[-4:]

@api_router.post("/vehicles/mine/{vid}/activate")
async def driver_select_active_vehicle(vid: str, user: dict = Depends(require_role("driver"))):
    vehicle = await db.vehicles.find_one({"id": vid, "driver_id": user["id"]})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not vehicle.get("active"):
        raise HTTPException(status_code=400, detail="Only admin-approved active vehicles can be selected")
    await db.vehicles.update_many({"driver_id": user["id"]}, {"$set": {"driver_selected": False}})
    await db.vehicles.update_one({"id": vid}, {"$set": {"driver_selected": True, "selected_at": now_iso()}})
    return {"ok": True}

@api_router.get("/driver/tax-info")
async def get_driver_tax_info(user: dict = Depends(require_role("driver"))):
    doc = await db.driver_tax_info.find_one({"driver_id": user["id"]})
    return strip_internal(doc) if doc else {"status": "not_submitted"}

@api_router.post("/driver/tax-info")
async def submit_driver_tax_info(payload: DriverTaxInfoSubmit, user: dict = Depends(require_role("driver"))):
    data = payload.model_dump()
    if data["tax_profile_type"] == "individual" and not data.get("ssn_last4"):
        raise HTTPException(status_code=400, detail="SSN last 4 is required for individual tax profile")
    if data["tax_profile_type"] == "business" and not data.get("ein"):
        raise HTTPException(status_code=400, detail="EIN is required for business tax profile")
    doc = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "driver_name": user.get("name", ""),
        "driver_email": user.get("email", ""),
        "tax_profile_type": data["tax_profile_type"],
        "legal_name": sanitize(data["legal_name"], 120),
        "ssn_last4": sanitize(data.get("ssn_last4") or "", 4),
        "ein": sanitize(data.get("ein") or "", 12),
        "address_line1": sanitize(data["address_line1"], 160),
        "address_line2": sanitize(data.get("address_line2") or "", 120),
        "city": sanitize(data["city"], 80),
        "state": sanitize(data["state"], 30),
        "zip_code": sanitize(data["zip_code"], 12),
        "status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.driver_tax_info.update_one({"driver_id": user["id"]}, {"$set": doc}, upsert=True)
    await notify_admins("tax_info_submitted", "Driver tax info submitted", f"{user.get('name', 'Driver')} submitted tax info for admin approval.", "/admin")
    return strip_internal(doc)

@api_router.get("/driver/payout-methods")
async def get_driver_payout_methods(user: dict = Depends(require_role("driver"))):
    items = await db.payout_methods.find({"driver_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [strip_internal(i) for i in items]

@api_router.post("/driver/payout-methods")
async def add_driver_payout_method(payload: PayoutMethodSubmit, user: dict = Depends(require_role("driver"))):
    data = payload.model_dump()
    if data["method_type"] == "bank":
        if not data.get("routing_number") or not data.get("account_number"):
            raise HTTPException(status_code=400, detail="Routing and account number are required")
        label = f"Bank ending {re.sub(r'\\D', '', data.get('account_number') or '')[-4:]}"
        doc = {
            "id": str(uuid.uuid4()), "driver_id": user["id"], "method_type": "bank",
            "account_holder_name": sanitize(data.get("account_holder_name") or user.get("name", ""), 120),
            "routing_number_masked": mask_bank_number(data.get("routing_number") or ""),
            "account_number_masked": mask_bank_number(data.get("account_number") or ""),
            "label": label, "status": "active", "created_at": now_iso(),
        }
    else:
        if not data.get("debit_card_last4"):
            raise HTTPException(status_code=400, detail="Debit card last 4 is required")
        doc = {
            "id": str(uuid.uuid4()), "driver_id": user["id"], "method_type": "debit_card",
            "debit_card_last4": sanitize(data.get("debit_card_last4") or "", 4),
            "debit_card_brand": sanitize(data.get("debit_card_brand") or "Debit card", 30),
            "label": f"Instant debit ending {data.get('debit_card_last4')}",
            "status": "active", "created_at": now_iso(),
        }
    await db.payout_methods.insert_one(doc)
    return strip_internal(doc)

@api_router.post("/driver/payout/instant")
async def request_instant_payout(user: dict = Depends(require_role("driver"))):
    earnings = await build_driver_earnings(user["id"])
    available = float(earnings["summary"].get("available_balance", 0) or 0)
    fee = 3.25
    if available <= fee:
        raise HTTPException(status_code=400, detail="Available balance is not enough for instant payout after the $3.25 fee")
    doc = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "driver_name": user.get("name", ""),
        "gross_amount": round(available, 2),
        "instant_fee": fee,
        "net_amount": round(available - fee, 2),
        "status": "pending_admin_review",
        "created_at": now_iso(),
    }
    await db.payout_requests.insert_one(doc)
    await notify_admins("instant_payout_requested", "Instant payout requested", f"{user.get('name', 'Driver')} requested an instant payout for ${doc['net_amount']:.2f} after fee.", "/admin")
    return strip_internal(doc)

@api_router.get("/admin/tax-info")
async def admin_list_tax_info(user: dict = Depends(require_role("admin"))):
    items = await db.driver_tax_info.find({}).sort("updated_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.post("/admin/tax-info/{tax_id}/status")
async def admin_update_tax_info(tax_id: str, payload: AdminTaxStatusUpdate, user: dict = Depends(require_role("admin"))):
    doc = await db.driver_tax_info.find_one({"id": tax_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Tax info not found")
    await db.driver_tax_info.update_one({"id": tax_id}, {"$set": {"status": payload.status, "admin_note": sanitize(payload.admin_note or "", 500), "reviewed_at": now_iso(), "reviewed_by_admin_id": user["id"], "reviewed_by_admin_name": user.get("name", "")}})
    await log_admin_action(user, "tax_info_status_update", "driver_tax_info", tax_id, {"status": payload.status, "driver_id": doc.get("driver_id")})
    await notify_user(doc["driver_id"], "tax_info_reviewed", "Tax info reviewed", f"Your tax info was marked {payload.status}.", "/driver?tab=home")
    return {"ok": True}

# ---------- Admin ----------
@api_router.get("/admin/ride-lookup/{ride_number}")
async def admin_ride_lookup(ride_number: str, user: dict = Depends(require_role("admin"))):
    clean = sanitize(ride_number, 40).upper()
    booking = await db.bookings.find_one({"ride_number": clean})
    ride = None
    if booking:
        ride = await db.ride_requests.find_one({"id": booking.get("ride_request_id")})
    if not ride:
        ride = await db.ride_requests.find_one({"ride_number": clean})
    if not ride:
        # Also allow pasting the first 8 chars/full id for support calls.
        ride = await db.ride_requests.find_one({"id": ride_number}) or await db.ride_requests.find_one({"id": {"$regex": f"^{re.escape(ride_number)}"}})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride number not found")
    if not booking:
        booking = await db.bookings.find_one({"ride_request_id": ride["id"]})
    offers = await db.offers.find({"ride_request_id": ride["id"]}).sort("created_at", -1).to_list(100)
    customer = None
    driver = None
    if ride.get("customer_id") and not str(ride.get("customer_id")).startswith("guest:"):
        customer = await db.users.find_one({"id": ride.get("customer_id")})
    if booking and booking.get("driver_id"):
        driver = await db.users.find_one({"id": booking.get("driver_id")})
    return {
        "ride": strip_internal(ride),
        "booking": strip_internal(booking) if booking else None,
        "offers": [strip_internal(o) for o in offers],
        "customer": public_user(customer) if customer else None,
        "driver": public_user(driver) if driver else None,
    }

@api_router.get("/admin/users")
async def admin_users(user: dict = Depends(require_role("admin"))):
    items = await db.users.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.get("/admin/offers")
async def admin_offers(user: dict = Depends(require_role("admin"))):
    items = await db.offers.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(i) for i in items]

@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_role("admin"))):
    return {
        "users": await db.users.count_documents({}),
        "customers": await db.users.count_documents({"role": "customer"}),
        "drivers": await db.users.count_documents({"role": "driver"}),
        "drivers_pending": await db.users.count_documents({"role": "driver", "admin_approved": {"$ne": True}}),
        "vehicles": await db.vehicles.count_documents({}),
        "ride_requests": await db.ride_requests.count_documents({}),
        "open_requests": await db.ride_requests.count_documents({"status": {"$in": ["open", "offer_received"]}}),
        "offers": await db.offers.count_documents({}),
        "bookings": await db.bookings.count_documents({}),
        "completed": await db.bookings.count_documents({"status": "completed"}),
        "support_open": await db.support_threads.count_documents({"status": "open"}),
    }

# ---------- Health ----------
@api_router.get("/")
async def root():
    return {"message": "Atalay Limo API"}

# ---------- Seeding ----------
async def ensure_user(email: str, password: str, name: str, role: str, phone: str):
    existing = await db.users.find_one({"email": email})
    if existing:
        # ensure pre-verified for demo
        await db.users.update_one(
            {"email": email},
            {"$set": {"email_verified": True, "phone_verified": True, "phone": phone, "admin_approved": True, "approval_status": "approved"}},
        )
        return
    doc = {
        "id": str(uuid.uuid4()),
        "name": name, "email": email, "phone": phone,
        "password_hash": hash_password(password),
        "role": role,
        "admin_approved": True,
        "approval_status": "approved",
        "email_verified": True, "phone_verified": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)


# ---------- Operations / dispatch / disputes / adjustments ----------
@api_router.get("/admin/dispatch-board")
async def admin_dispatch_board(user: dict = Depends(require_role("admin"))):
    bookings = await db.bookings.find({}).sort("date", 1).to_list(800)
    requests = await db.ride_requests.find({"status": {"$in": ["pending", "offers_received", "cancelled"]}}).sort("created_at", -1).to_list(300)
    groups = {k: [] for k in ["requested", "payment_pending", "confirmed", "driver_not_online", "to_pickup", "arrived", "in_progress", "completed", "cancelled", "no_show"]}
    for b in bookings:
        key = b.get("status", "confirmed")
        if key == "confirmed":
            driver = await db.users.find_one({"id": b.get("driver_id")})
            mins = minutes_until_pickup(b)
            if mins is not None and 0 <= mins <= 60 and not (driver or {}).get("driver_online"):
                key = "driver_not_online"
        groups.setdefault(key, []).append(strip_internal({**b, "receipt_lines": build_receipt_lines(b)}))
    for r in requests:
        groups["requested"].append(strip_internal(r))
    return groups

@api_router.post("/bookings/{bid}/no-show")
async def report_no_show(bid: str, payload: NoShowReport, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user["role"] == "driver" and booking.get("driver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user["role"] == "customer" and booking.get("customer_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user["role"] not in ("admin", "driver", "customer"):
        raise HTTPException(status_code=403, detail="Forbidden")
    stamp = now_iso()
    updates = {"status": "no_show", "no_show_type": payload.no_show_type, "no_show_reason": sanitize(payload.reason or "", 500), "no_show_reported_by": user["role"], "no_show_reported_at": stamp, "updated_at": stamp}
    if payload.no_show_type == "customer_no_show":
        updates["customer_no_show"] = True
    if payload.no_show_type == "driver_no_show":
        updates["driver_no_show"] = True
        updates["driver_cancellation"] = True
    if payload.no_show_type == "late_customer":
        updates["late_customer"] = True
    if payload.no_show_type == "late_driver":
        updates["late_driver"] = True
    fee = float(payload.fee_amount or 0)
    if fee:
        adj = {"id": str(uuid.uuid4()), "type": "no_show_fee", "amount": fee, "note": payload.no_show_type, "created_at": stamp, "created_by_role": user["role"]}
        updates["fee_adjustments"] = (booking.get("fee_adjustments") or []) + [adj]
        updates["price"] = round(float(booking.get("price", 0) or 0) + fee, 2)
        updates["customer_total_with_tax"] = round(float(booking.get("customer_total_with_tax", booking.get("price", 0)) or 0) + fee, 2)
    await db.bookings.update_one({"id": bid}, {"$set": updates})
    await db.ride_requests.update_one({"id": booking.get("ride_request_id")}, {"$set": {"status": "no_show", "updated_at": stamp}})
    if updates.get("driver_no_show"):
        await db.users.update_one({"id": booking.get("driver_id")}, {"$inc": {"driver_no_show_count": 1, "driver_cancel_count": 1}})
    if updates.get("customer_no_show"):
        await db.users.update_one({"id": booking.get("customer_id")}, {"$inc": {"customer_no_show_count": 1}})
    if user["role"] == "admin":
        await log_admin_action(user, "no_show_recorded", "booking", bid, {"type": payload.no_show_type})
    await notify_admins("no_show_reported", "No-show / late report", f"{payload.no_show_type} was reported for ride {booking.get('ride_number') or bid}.", "/admin")
    return {"ok": True}

@api_router.post("/bookings/{bid}/extra-stop-request")
async def extra_stop_request(bid: str, payload: ExtraStopRequest, user: dict = Depends(require_role("driver"))):
    booking = await db.bookings.find_one({"id": bid, "driver_id": user["id"]})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    doc = {"id": str(uuid.uuid4()), "booking_id": bid, "ride_request_id": booking.get("ride_request_id"), "driver_id": user["id"], "customer_id": booking.get("customer_id"), "description": sanitize(payload.description, 300), "requested_amount": round(float(payload.requested_amount or 0), 2), "status": "pending_admin_review", "created_at": now_iso()}
    await db.adjustment_requests.insert_one(doc)
    await notify_admins("adjustment_requested", "Extra stop / adjustment requested", f"Driver requested ${doc['requested_amount']:.2f} adjustment for ride {booking.get('ride_number') or bid}.", "/admin")
    return strip_internal(doc)

@api_router.get("/admin/adjustment-requests")
async def admin_adjustment_requests(user: dict = Depends(require_role("admin"))):
    items = await db.adjustment_requests.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(x) for x in items]

@api_router.post("/admin/bookings/{bid}/fee-adjustment")
async def admin_fee_adjustment(bid: str, payload: AdminFeeAdjustment, user: dict = Depends(require_role("admin"))):
    booking = await db.bookings.find_one({"id": bid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    adj = {"id": str(uuid.uuid4()), "type": payload.adjustment_type, "amount": round(float(payload.amount), 2), "note": sanitize(payload.note or "", 700), "created_at": now_iso(), "created_by_admin_id": user["id"], "created_by_admin_name": user.get("name", "")}
    price = round(float(booking.get("price", 0) or 0) + adj["amount"], 2)
    customer_total = round(float(booking.get("customer_total_with_tax", booking.get("price", 0)) or 0) + adj["amount"], 2)
    await db.bookings.update_one({"id": bid}, {"$set": {"price": max(0, price), "customer_total_with_tax": max(0, customer_total), "updated_at": now_iso()}, "$push": {"fee_adjustments": adj}})
    await log_admin_action(user, "booking_fee_adjusted", "booking", bid, {"amount": adj["amount"], "type": adj["type"], "note": adj["note"]})
    return {"ok": True}

@api_router.patch("/admin/bookings/{bid}/override")
async def admin_booking_override(bid: str, payload: AdminBookingOverride, user: dict = Depends(require_role("admin"))):
    existing = await db.bookings.find_one({"id": bid})
    if not existing:
        raise HTTPException(status_code=404, detail="Booking not found")
    data = payload.model_dump(exclude_unset=True)
    updates = {k: v for k, v in data.items() if v is not None and k != "admin_note"}
    updates["admin_override_note"] = sanitize(payload.admin_note or "", 1000)
    updates["last_overridden_by_admin_id"] = user["id"]
    updates["last_overridden_by_admin_name"] = user.get("name", "")
    updates["updated_at"] = now_iso()
    await db.bookings.update_one({"id": bid}, {"$set": updates})
    if updates.get("status"):
        await db.ride_requests.update_one({"id": existing.get("ride_request_id")}, {"$set": {"status": updates["status"], "updated_at": now_iso()}})
    await log_admin_action(user, "booking_manual_override", "booking", bid, {"fields": list(updates.keys()), "note": updates.get("admin_override_note", "")})
    return {"ok": True}

@api_router.post("/disputes")
async def create_dispute(payload: DisputeCreate, user: dict = Depends(get_current_user)):
    booking = None
    if payload.booking_id:
        booking = await db.bookings.find_one({"id": payload.booking_id})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if user["role"] == "customer" and booking.get("customer_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        if user["role"] == "driver" and booking.get("driver_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
    doc = {"id": str(uuid.uuid4()), "booking_id": payload.booking_id, "ride_request_id": payload.ride_request_id or (booking or {}).get("ride_request_id"), "customer_id": (booking or {}).get("customer_id") if booking else (user["id"] if user["role"] == "customer" else None), "driver_id": (booking or {}).get("driver_id") if booking else (user["id"] if user["role"] == "driver" else None), "created_by_id": user["id"], "created_by_role": user["role"], "created_by_name": user.get("name", ""), "category": payload.category, "message": sanitize(payload.message, 1500), "status": "open", "created_at": now_iso(), "updated_at": now_iso()}
    await db.disputes.insert_one(doc)
    await notify_admins("dispute_opened", "New dispute / complaint", f"{user.get('name', 'User')} opened a {payload.category} dispute.", "/admin")
    return strip_internal(doc)

@api_router.get("/admin/disputes")
async def admin_disputes(user: dict = Depends(require_role("admin"))):
    items = await db.disputes.find({}).sort("created_at", -1).to_list(500)
    return [strip_internal(x) for x in items]

@api_router.post("/admin/disputes/{did}/status")
async def admin_dispute_status(did: str, payload: AdminDisputeUpdate, user: dict = Depends(require_role("admin"))):
    dispute = await db.disputes.find_one({"id": did})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    updates = {"status": payload.status, "resolution_note": sanitize(payload.resolution_note or "", 1000), "credit_amount": round(float(payload.credit_amount or 0), 2), "driver_penalty_amount": round(float(payload.driver_penalty_amount or 0), 2), "reviewed_at": now_iso(), "reviewed_by_admin_id": user["id"], "reviewed_by_admin_name": user.get("name", ""), "updated_at": now_iso()}
    await db.disputes.update_one({"id": did}, {"$set": updates})
    await log_admin_action(user, "dispute_status_updated", "dispute", did, {"status": payload.status, "credit": updates["credit_amount"], "penalty": updates["driver_penalty_amount"]})
    for uid in [dispute.get("customer_id"), dispute.get("driver_id")]:
        if uid:
            await notify_user(uid, "dispute_updated", "Dispute updated", f"Your dispute was marked {payload.status}.", "/support")
    return {"ok": True}


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.ride_requests.create_index("customer_id")
        await db.ride_requests.create_index("ride_number", sparse=True)
        await db.bookings.create_index("ride_number", sparse=True)
        await db.offers.create_index("ride_request_id")
        await db.offers.create_index("driver_id")
        await db.bookings.create_index("customer_id")
        await db.bookings.create_index("driver_id")
        await db.verification_codes.create_index("user_id")
        await db.support_messages.create_index("user_id")
        await db.support_threads.create_index("user_id")
        await db.support_threads.create_index("updated_at")
        await db.support_thread_messages.create_index([("thread_id", 1), ("created_at", 1)])
        await db.booking_messages.create_index([("booking_id", 1), ("created_at", 1)])
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.payment_submissions.create_index("booking_id")
        await db.vehicles.create_index("driver_id")
        await db.driver_documents.create_index("driver_id")
        await db.admin_audit_logs.create_index("created_at")
    except Exception as e:
        logger.warning(f"Index creation issue: {e}")
    if SEED_DEMO_USERS:
        await ensure_user(os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"], "Atalay Limo Admin", "admin", os.environ.get("ADMIN_PHONE", "+15550000001"))
        await ensure_user(os.environ["DRIVER_EMAIL"], os.environ["DRIVER_PASSWORD"], "Marcus K.", "driver", os.environ.get("DRIVER_PHONE", "+15550000002"))
        await ensure_user(os.environ["CUSTOMER_EMAIL"], os.environ["CUSTOMER_PASSWORD"], "Eleanor Vance", "customer", os.environ.get("CUSTOMER_PHONE", "+15550000003"))
        await ensure_user("driver2@atalaylimo.com", "driver123", "Sophia R.", "driver", "+15550000004")
        # Demo vehicles are admin-created so drivers cannot self-enter vehicle details.
        demo_driver = await db.users.find_one({"email": "driver@atalaylimo.com"})
        demo_driver2 = await db.users.find_one({"email": "driver2@atalaylimo.com"})
        if demo_driver and not await db.vehicles.find_one({"driver_id": demo_driver["id"]}):
            await db.vehicles.insert_one({"id": str(uuid.uuid4()), "driver_id": demo_driver["id"], "driver_name": demo_driver["name"], "vehicle_type": "Sedan", "year": 2023, "make": "Mercedes-Benz", "model": "E-Class", "color": "Black", "plate": "DEMO1", "seats": 3, "luggage_capacity": 2, "photo_url": "/assets/premium-sedan-interior.png", "active": True, "created_at": now_iso()})
        if demo_driver2 and not await db.vehicles.find_one({"driver_id": demo_driver2["id"]}):
            await db.vehicles.insert_one({"id": str(uuid.uuid4()), "driver_id": demo_driver2["id"], "driver_name": demo_driver2["name"], "vehicle_type": "SUV", "year": 2024, "make": "Cadillac", "model": "Escalade", "color": "White", "plate": "DEMO2", "seats": 6, "luggage_capacity": 5, "photo_url": "/assets/luxury-suv-preview.png", "active": True, "created_at": now_iso()})
        demo_customer = await db.users.find_one({"email": "customer@atalaylimo.com"})
        if demo_driver and demo_customer and not await db.bookings.find_one({"driver_id": demo_driver["id"], "demo_earning": True}):
            demo_rows = [
                ("SR-26-A1B2C3", "Logan Airport Terminal B, Boston, MA", "Four Seasons Hotel, Boston, MA", "2026-06-05", "18:30", 185.00, "completed"),
                ("SR-26-D4E5F6", "Newton, MA", "Boston Seaport, MA", "2026-06-06", "09:15", 145.00, "completed"),
                ("SR-26-G7H8I9", "Wellesley, MA", "Logan Airport Terminal E, Boston, MA", "2026-06-08", "14:00", 210.00, "confirmed"),
            ]
            for ride_number, pickup, dropoff, date, time, price, status in demo_rows:
                totals = calculate_offer_totals(price)
                rrid = str(uuid.uuid4())
                bid = str(uuid.uuid4())
                await db.ride_requests.insert_one({
                    "id": rrid, "customer_id": demo_customer["id"], "customer_name": demo_customer["name"],
                    "pickup_address": pickup, "dropoff_address": dropoff, "date": date, "time": time,
                    "passengers": 1, "luggage": 1, "vehicle_type": "Sedan", "status": status,
                    "payment_status": "paid", "ride_number": ride_number, "demo_earning": True, "created_at": now_iso(),
                })
                await db.bookings.insert_one({
                    "id": bid, "ride_request_id": rrid, "offer_id": "demo", "customer_id": demo_customer["id"],
                    "customer_name": demo_customer["name"], "customer_phone": demo_customer.get("phone", ""),
                    "driver_id": demo_driver["id"], "driver_name": demo_driver["name"], "driver_phone": demo_driver.get("phone", ""),
                    "vehicle_type": "Sedan", "vehicle_details": "2023 Mercedes-Benz E-Class", "vehicle_make": "Mercedes-Benz", "vehicle_model": "E-Class", "vehicle_year": 2023,
                    "pickup_address": pickup, "dropoff_address": dropoff, "date": date, "time": time,
                    "price": price, **totals, "status": status, "payment_status": "paid", "ride_number": ride_number,
                    "customer_rating": 5 if status == "completed" else None, "customer_comment": "",
                    "driver_rating": 5 if status == "completed" else None, "driver_comment": "",
                    "completed_at": now_iso() if status == "completed" else "", "demo_earning": True, "created_at": now_iso(),
                })
        logger.info("Seeded demo users and admin-created vehicles")
    else:
        logger.info("Demo seed users disabled")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_origin_regex=r"https://.*\.app\.github\.dev",
    allow_methods=["*"],
    allow_headers=["*"],
)
