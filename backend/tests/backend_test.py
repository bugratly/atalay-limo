"""Backend tests for Atalay Limo private transportation marketplace.

Covers:
- Auth: register (with phone), duplicate email/phone, login, /me, verification gate
- Verification: send + confirm email + phone via dev_code
- Ride requests CRUD + role guards
- Offers with platform_commission=20% / driver_payout=80%
- Anonymized offers for customer (no driver_name/driver_id/driver_phone leak)
- Anti-regression: customer fetch never leaks driver identity
- Accept-offer -> booking with driver_phone + customer_phone revealed
- Mark-paid (placeholder), complete, rating (1-5, second rate=400)
- Rating reflects on driver's avg in subsequent offers
- Support: customer/driver create message; admin lists with role/name/email/phone; resolve
- Admin role guards; sanitization for very long inputs
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@atalaylimo.com", "password": "admin123"}
DRIVER = {"email": "driver@atalaylimo.com", "password": "driver123"}
DRIVER2 = {"email": "driver2@atalaylimo.com", "password": "driver123"}
CUSTOMER = {"email": "customer@atalaylimo.com", "password": "customer123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN),
        "driver": _login(DRIVER),
        "driver2": _login(DRIVER2),
        "customer": _login(CUSTOMER),
    }


def _register(name, email, phone, password, role):
    return requests.post(f"{API}/auth/register", json={
        "name": name, "email": email, "phone": phone, "password": password, "role": role,
    }, timeout=15)


def _verify_user(token):
    """Run verify/send+confirm for both channels using dev_code."""
    for ch in ("email", "phone"):
        s = requests.post(f"{API}/auth/verify/send", headers=_h(token), json={"channel": ch}, timeout=15)
        assert s.status_code == 200, s.text
        code = s.json()["dev_code"]
        c = requests.post(f"{API}/auth/verify/confirm", headers=_h(token),
                          json={"channel": ch, "code": code}, timeout=15)
        assert c.status_code == 200, c.text


# ---------- Auth & Verification ----------
class TestAuth:
    def test_register_and_login_with_phone(self):
        suffix = str(uuid.uuid4().int)[:8]
        email = f"test_{suffix}@atalaylimo.com"
        phone = f"+1555{suffix[:7]}"
        r = _register("TEST User", email, phone, "pw123456", "customer")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email
        assert data["user"]["phone"].replace(" ", "").replace("-", "") == phone
        assert data["user"]["email_verified"] is False
        assert data["user"]["phone_verified"] is False
        assert "token" in data

        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "pw123456"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["user"]["email"] == email

    def test_duplicate_email_rejected(self):
        s1 = str(uuid.uuid4().int)[:8]
        s2 = str(uuid.uuid4().int)[:8]
        email = f"test_dup_{s1}@atalaylimo.com"
        r1 = _register("TEST D1", email, f"+1666{s1[:7]}", "pw123456", "customer")
        assert r1.status_code == 200
        r2 = _register("TEST D2", email, f"+1777{s2[:7]}", "pw123456", "customer")
        assert r2.status_code == 400

    def test_duplicate_phone_rejected(self):
        s1 = str(uuid.uuid4().int)[:8]
        phone = f"+1888{s1[:7]}"
        r1 = _register("TEST P1", f"test_p1_{s1}@atalaylimo.com", phone, "pw123456", "customer")
        assert r1.status_code == 200
        r2 = _register("TEST P2", f"test_p2_{str(uuid.uuid4().int)[:8]}@atalaylimo.com", phone, "pw123456", "customer")
        assert r2.status_code == 400

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "no@x.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_unverified_user_blocked_on_protected(self):
        """New user without verification cannot create ride request -> 403."""
        s = str(uuid.uuid4().int)[:8]
        reg = _register("TEST Unverified", f"test_unv_{s}@atalaylimo.com", f"+1999{s[:7]}",
                        "pw123456", "customer").json()
        tok = reg["token"]
        r = requests.post(f"{API}/ride-requests", headers=_h(tok), json={
            "pickup_address": "TEST A", "dropoff_address": "TEST B",
            "date": "2026-05-01", "time": "10:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15)
        assert r.status_code == 403
        assert "verif" in r.text.lower()

    def test_verification_flow_unlocks_protected(self):
        s = str(uuid.uuid4().int)[:8]
        reg = _register("TEST Verify", f"test_v_{s}@atalaylimo.com", f"+1444{s[:7]}",
                        "pw123456", "customer").json()
        tok = reg["token"]
        _verify_user(tok)
        # /me reflects verified
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15).json()
        assert me["email_verified"] is True and me["phone_verified"] is True
        # protected endpoint now works
        r = requests.post(f"{API}/ride-requests", headers=_h(tok), json={
            "pickup_address": "TEST A", "dropoff_address": "TEST B",
            "date": "2026-05-01", "time": "10:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15)
        assert r.status_code == 200, r.text

    def test_verify_confirm_invalid_code(self):
        s = str(uuid.uuid4().int)[:8]
        reg = _register("TEST BadCode", f"test_bc_{s}@atalaylimo.com", f"+1333{s[:7]}",
                        "pw123456", "customer").json()
        tok = reg["token"]
        requests.post(f"{API}/auth/verify/send", headers=_h(tok), json={"channel": "email"}, timeout=15)
        c = requests.post(f"{API}/auth/verify/confirm", headers=_h(tok),
                          json={"channel": "email", "code": "000000"}, timeout=15)
        assert c.status_code == 400


# ---------- Ride lifecycle, offers privacy, booking, rating ----------
class TestRideAndOfferPrivacy:
    state = {}

    def test_customer_creates_request(self, tokens):
        payload = {
            "pickup_address": "TEST 100 Main St",
            "dropoff_address": "TEST 999 Airport Rd",
            "date": "2026-02-15", "time": "10:30",
            "passengers": 2, "luggage": 1,
            "vehicle_type": "Sedan", "notes": "TEST ride <script>alert(1)</script>"
        }
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "open"
        # script tag remains as text - React escapes on render
        assert "<script>" in data["notes"]
        self.__class__.state["ride_id"] = data["id"]

    def test_driver_submits_offer_with_commission(self, tokens):
        rid = self.state["ride_id"]
        r = requests.post(f"{API}/ride-requests/{rid}/offers", headers=_h(tokens["driver"]),
                          json={"price": 100, "vehicle_type": "Sedan",
                                "vehicle_details": "Black Mercedes E-Class",
                                "eta_minutes": 15, "notes": "TEST"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price"] == 100
        assert d["platform_commission"] == 20.0
        assert d["driver_payout"] == 80.0
        assert d["vehicle_type"] == "Sedan"
        assert d["vehicle_details"] == "Black Mercedes E-Class"
        self.state["offer1_id"] = d["id"]

    def test_second_driver_offer(self, tokens):
        rid = self.state["ride_id"]
        r = requests.post(f"{API}/ride-requests/{rid}/offers", headers=_h(tokens["driver2"]),
                          json={"price": 65, "vehicle_type": "SUV",
                                "vehicle_details": "White Cadillac Escalade",
                                "eta_minutes": 20}, timeout=15)
        assert r.status_code == 200, r.text
        self.state["offer2_id"] = r.json()["id"]

    def test_offer_missing_vehicle_type_rejected(self, tokens):
        rid = self.state["ride_id"]
        # need a different driver - use one not yet offered. Actually both have offered.
        # Re-use driver but with missing vehicle_type -> pydantic 422
        r = requests.post(f"{API}/ride-requests/{rid}/offers", headers=_h(tokens["driver"]),
                          json={"price": 50}, timeout=15)
        assert r.status_code in (400, 422)

    def test_customer_view_anonymizes_offers(self, tokens):
        rid = self.state["ride_id"]
        r = requests.get(f"{API}/ride-requests/{rid}", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        offers = data["offers"]
        assert len(offers) == 2
        for o in offers:
            # Anti-regression: NO driver identity must leak
            assert "driver_name" not in o, f"driver_name leaked! {o}"
            assert "driver_id" not in o, f"driver_id leaked! {o}"
            assert "driver_phone" not in o, f"driver_phone leaked! {o}"
            # Required public fields
            for k in ("id", "price", "vehicle_type", "vehicle_details", "eta_minutes",
                      "notes", "status", "driver_rating", "driver_rating_count",
                      "completed_trips"):
                assert k in o, f"missing field {k}"
            assert isinstance(o["driver_rating_count"], int)
            assert isinstance(o["completed_trips"], int)

    def test_accept_offer_creates_booking_with_phones(self, tokens):
        oid = self.state["offer2_id"]
        r = requests.post(f"{API}/offers/{oid}/accept", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200, r.text
        booking = r.json()["booking"]
        assert booking["status"] == "payment_pending"
        # Phones revealed after match
        assert booking["driver_phone"], "driver_phone missing in booking"
        assert booking["customer_phone"], "customer_phone missing in booking"
        assert booking["driver_name"]
        assert booking["platform_commission"] == 13.0  # 65 * .2
        assert booking["driver_payout"] == 52.0
        self.state["booking_id"] = booking["id"]

    def test_customer_bookings_show_driver_phone(self, tokens):
        r = requests.get(f"{API}/bookings", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200
        b = next(x for x in r.json() if x["id"] == self.state["booking_id"])
        assert b["driver_name"]
        assert b["driver_phone"]

    def test_driver_bookings_show_customer_phone(self, tokens):
        r = requests.get(f"{API}/bookings", headers=_h(tokens["driver2"]), timeout=15)
        assert r.status_code == 200
        b = next(x for x in r.json() if x["id"] == self.state["booking_id"])
        assert b["customer_name"]
        assert b["customer_phone"]

    def test_mark_paid_then_complete(self, tokens):
        bid = self.state["booking_id"]
        r1 = requests.post(f"{API}/bookings/{bid}/mark-paid", headers=_h(tokens["customer"]), timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/bookings/{bid}/complete", headers=_h(tokens["driver2"]), timeout=15)
        assert r2.status_code == 200

    def test_rate_booking_1_to_5(self, tokens):
        bid = self.state["booking_id"]
        r = requests.post(f"{API}/bookings/{bid}/rate", headers=_h(tokens["customer"]),
                          json={"rating": 5, "comment": "TEST excellent"}, timeout=15)
        assert r.status_code == 200, r.text

    def test_rate_booking_twice_rejected(self, tokens):
        bid = self.state["booking_id"]
        r = requests.post(f"{API}/bookings/{bid}/rate", headers=_h(tokens["customer"]),
                          json={"rating": 4}, timeout=15)
        assert r.status_code == 400

    def test_rate_out_of_range_rejected(self, tokens):
        bid = self.state["booking_id"]
        r = requests.post(f"{API}/bookings/{bid}/rate", headers=_h(tokens["customer"]),
                          json={"rating": 6}, timeout=15)
        assert r.status_code == 422

    def test_driver_rating_reflects_in_new_offer(self, tokens):
        """After driver2 received 5-star rating, a new ride's offer from driver2 should show rating=5."""
        # Customer creates a new ride request
        rr = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST new pickup", "dropoff_address": "TEST new drop",
            "date": "2026-04-01", "time": "12:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "SUV",
        }, timeout=15).json()
        new_rid = rr["id"]
        # driver2 submits offer
        requests.post(f"{API}/ride-requests/{new_rid}/offers", headers=_h(tokens["driver2"]),
                      json={"price": 80, "vehicle_type": "SUV",
                            "vehicle_details": "Escalade"}, timeout=15)
        # customer view should show driver_rating=5
        view = requests.get(f"{API}/ride-requests/{new_rid}", headers=_h(tokens["customer"]), timeout=15).json()
        assert view["offers"][0]["driver_rating"] == 5.0
        assert view["offers"][0]["driver_rating_count"] >= 1
        assert view["offers"][0]["completed_trips"] >= 1


# ---------- Role guards ----------
class TestRoleGuards:
    def test_driver_cannot_create_ride(self, tokens):
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["driver"]), json={
            "pickup_address": "x", "dropoff_address": "y",
            "date": "2026-02-15", "time": "10:30",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15)
        assert r.status_code == 403

    def test_customer_cannot_submit_offer(self, tokens):
        # create a ride first
        rr = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST cust offer", "dropoff_address": "TEST",
            "date": "2026-02-15", "time": "10:30",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15).json()
        r = requests.post(f"{API}/ride-requests/{rr['id']}/offers", headers=_h(tokens["customer"]),
                          json={"price": 10, "vehicle_type": "Sedan"}, timeout=15)
        assert r.status_code == 403

    def test_admin_endpoints_reject_non_admin(self, tokens):
        for url in (f"{API}/admin/users", f"{API}/admin/stats", f"{API}/admin/offers", f"{API}/admin/support"):
            r = requests.get(url, headers=_h(tokens["customer"]), timeout=15)
            assert r.status_code == 403, url


# ---------- Support ----------
class TestSupport:
    def test_customer_submits_support(self, tokens):
        r = requests.post(f"{API}/support", headers=_h(tokens["customer"]),
                          json={"subject": "TEST help", "message": "TEST need help"}, timeout=15)
        assert r.status_code == 200, r.text

    def test_admin_lists_support_with_user_meta(self, tokens):
        r = requests.get(f"{API}/admin/support", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        sample = items[0]
        for k in ("user_role", "user_name", "user_email", "user_phone", "subject", "message"):
            assert k in sample, f"missing {k} in support listing"

    def test_admin_resolves_support(self, tokens):
        # Create a ticket as driver
        c = requests.post(f"{API}/support", headers=_h(tokens["driver"]),
                          json={"subject": "TEST driver issue", "message": "TEST cannot login"}, timeout=15).json()
        mid = c["id"]
        r = requests.post(f"{API}/admin/support/{mid}/resolve", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        # verify
        items = requests.get(f"{API}/admin/support", headers=_h(tokens["admin"]), timeout=15).json()
        match = next(x for x in items if x["id"] == mid)
        assert match["status"] == "resolved"


# ---------- Input sanitization ----------
class TestSanitization:
    def test_long_address_rejected(self, tokens):
        long_addr = "A" * 250
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": long_addr, "dropoff_address": "ok",
            "date": "2026-02-15", "time": "10:30",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15)
        assert r.status_code == 422

    def test_html_in_name_stored_as_text(self):
        s = str(uuid.uuid4().int)[:8]
        evil = "<img src=x onerror=alert(1)>TEST"
        r = _register(evil, f"test_xss_{s}@atalaylimo.com", f"+1222{s[:7]}", "pw123456", "customer")
        assert r.status_code == 200
        # Name stored as-is — React escapes on render
        assert "<img" in r.json()["user"]["name"]
