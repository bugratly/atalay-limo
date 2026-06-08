"""Iteration 4 tests: map/pricing fields on ride-requests + in-app notifications.

Covers:
- POST /api/ride-requests accepts and persists pickup_lat/lng, dropoff_lat/lng,
  estimated_miles, estimated_minutes, recommended_price, pricing_mode.
- Notifications: offer_received fires for customer when driver offers;
  offer_accepted fires for selected driver when customer accepts.
- GET /api/notifications (descending), POST /api/notifications/{id}/read,
  POST /api/notifications/read-all.
"""
import os
import uuid
import time
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
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN),
        "driver": _login(DRIVER),
        "driver2": _login(DRIVER2),
        "customer": _login(CUSTOMER),
    }


class TestMapPricingFields:
    """RideRequestCreate accepts and returns map+pricing fields."""

    def test_create_with_map_and_pricing_fields(self, tokens):
        payload = {
            "pickup_address": "TEST JFK Terminal 4",
            "dropoff_address": "TEST Times Square, NY",
            "date": "2026-05-01", "time": "09:00",
            "passengers": 2, "luggage": 1, "vehicle_type": "Sedan",
            "notes": "TEST iter4 pricing",
            "pickup_lat": 40.6413,
            "pickup_lng": -73.7781,
            "dropoff_lat": 40.7580,
            "dropoff_lng": -73.9855,
            "estimated_miles": 15.0,
            "estimated_minutes": 35,
            "recommended_price": 105.0,
            "pricing_mode": "per_mile",
        }
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Field persistence assertions
        assert d["pickup_lat"] == 40.6413
        assert d["pickup_lng"] == -73.7781
        assert d["dropoff_lat"] == 40.7580
        assert d["dropoff_lng"] == -73.9855
        assert d["estimated_miles"] == 15.0
        assert d["estimated_minutes"] == 35
        assert d["recommended_price"] == 105.0
        assert d["pricing_mode"] == "per_mile"
        # GET also returns them
        g = requests.get(f"{API}/ride-requests/{d['id']}", headers=_h(tokens["customer"]), timeout=15)
        assert g.status_code == 200
        gd = g.json()
        assert gd["estimated_miles"] == 15.0
        assert gd["recommended_price"] == 105.0
        assert gd["pricing_mode"] == "per_mile"

    def test_create_with_hourly_mode(self, tokens):
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST hourly pickup",
            "dropoff_address": "TEST hourly drop",
            "date": "2026-05-02", "time": "10:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "Luxury",
            "recommended_price": 150.0,
            "estimated_minutes": 120,
            "pricing_mode": "hourly",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["pricing_mode"] == "hourly"
        assert r.json()["recommended_price"] == 150.0

    def test_create_without_map_fields_still_works(self, tokens):
        """Backward compat: omitting all map/pricing fields should still succeed."""
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST plain pickup",
            "dropoff_address": "TEST plain drop",
            "date": "2026-05-03", "time": "11:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pickup_lat"] is None
        assert d["recommended_price"] is None
        assert d["pricing_mode"] == "per_mile"  # default

    def test_invalid_pricing_mode_rejected(self, tokens):
        r = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST", "dropoff_address": "TEST",
            "date": "2026-05-04", "time": "11:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
            "pricing_mode": "weekly",  # invalid
        }, timeout=15)
        assert r.status_code == 422


class TestNotifications:
    """In-app notifications wired around offer lifecycle."""
    state = {}

    def test_clear_baseline(self, tokens):
        # mark all read for both customer and driver to get a clean baseline
        for who in ("customer", "driver"):
            requests.post(f"{API}/notifications/read-all", headers=_h(tokens[who]), timeout=15)

    def test_offer_emits_offer_received_for_customer(self, tokens):
        # 1) customer creates a ride
        rr = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST notif pickup",
            "dropoff_address": "TEST notif drop",
            "date": "2026-06-01", "time": "12:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "Sedan",
        }, timeout=15).json()
        self.__class__.state["rid"] = rr["id"]

        # 2) driver submits offer
        of = requests.post(f"{API}/ride-requests/{rr['id']}/offers",
                           headers=_h(tokens["driver"]),
                           json={"price": 120, "vehicle_type": "Sedan",
                                 "vehicle_details": "TEST notif sedan",
                                 "eta_minutes": 12}, timeout=15)
        assert of.status_code == 200, of.text
        self.state["oid"] = of.json()["id"]
        # Give server a brief moment (notify_user is awaited inline but be safe)
        time.sleep(0.3)

        # 3) customer notifications include offer_received with link=/ride/{rid}
        n = requests.get(f"{API}/notifications", headers=_h(tokens["customer"]), timeout=15)
        assert n.status_code == 200, n.text
        items = n.json()
        match = [x for x in items if x["kind"] == "offer_received" and x["link"] == f"/ride/{rr['id']}"]
        assert match, f"offer_received notification not found. items={items}"
        notif = match[0]
        assert notif["read"] is False
        assert "New offer" in notif["title"]
        assert isinstance(notif["created_at"], str)
        self.state["customer_notif_id"] = notif["id"]

    def test_notifications_sorted_descending(self, tokens):
        # Create another ride+offer; the newer notification should come first
        rr = requests.post(f"{API}/ride-requests", headers=_h(tokens["customer"]), json={
            "pickup_address": "TEST notif pickup 2",
            "dropoff_address": "TEST notif drop 2",
            "date": "2026-06-02", "time": "13:00",
            "passengers": 1, "luggage": 0, "vehicle_type": "SUV",
        }, timeout=15).json()
        requests.post(f"{API}/ride-requests/{rr['id']}/offers", headers=_h(tokens["driver2"]),
                      json={"price": 130, "vehicle_type": "SUV"}, timeout=15)
        time.sleep(0.3)
        items = requests.get(f"{API}/notifications", headers=_h(tokens["customer"]), timeout=15).json()
        assert len(items) >= 2
        # descending by created_at
        assert items[0]["created_at"] >= items[1]["created_at"]

    def test_mark_single_notification_read(self, tokens):
        nid = self.state["customer_notif_id"]
        r = requests.post(f"{API}/notifications/{nid}/read", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200
        items = requests.get(f"{API}/notifications", headers=_h(tokens["customer"]), timeout=15).json()
        match = next(x for x in items if x["id"] == nid)
        assert match["read"] is True

    def test_mark_all_read(self, tokens):
        r = requests.post(f"{API}/notifications/read-all", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200
        items = requests.get(f"{API}/notifications", headers=_h(tokens["customer"]), timeout=15).json()
        assert all(x["read"] for x in items), f"some unread remain: {[x for x in items if not x['read']]}"

    def test_cannot_mark_other_users_notification(self, tokens):
        """Driver should not be able to mark the customer's notification id read."""
        nid = self.state["customer_notif_id"]
        r = requests.post(f"{API}/notifications/{nid}/read", headers=_h(tokens["driver"]), timeout=15)
        # endpoint returns 200 either way (update_one with user_id filter is a no-op for non-owners)
        assert r.status_code == 200
        # Confirm the customer's notif remains as it was (still read)
        items = requests.get(f"{API}/notifications", headers=_h(tokens["customer"]), timeout=15).json()
        match = next(x for x in items if x["id"] == nid)
        assert match["read"] is True  # still read; not flipped by driver

    def test_accept_offer_emits_offer_accepted_for_driver(self, tokens):
        oid = self.state["oid"]
        # clear driver baseline for this test
        requests.post(f"{API}/notifications/read-all", headers=_h(tokens["driver"]), timeout=15)
        r = requests.post(f"{API}/offers/{oid}/accept", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200, r.text
        booking = r.json()["booking"]
        rid = self.state["rid"]
        time.sleep(0.3)
        items = requests.get(f"{API}/notifications", headers=_h(tokens["driver"]), timeout=15).json()
        match = [x for x in items if x["kind"] == "offer_accepted" and x["link"] == f"/ride/{rid}" and x["read"] is False]
        assert match, f"offer_accepted not delivered to driver. items={items}"
        assert "accepted" in match[0]["title"].lower() or "accepted" in match[0]["body"].lower()
        # Make sure customer did NOT get an offer_accepted on their own bell
        cust_items = requests.get(f"{API}/notifications", headers=_h(tokens["customer"]), timeout=15).json()
        assert not any(x["kind"] == "offer_accepted" for x in cust_items), \
            "offer_accepted should go to driver, not customer"


class TestNotificationsAuth:
    def test_unauth_blocked(self):
        r = requests.get(f"{API}/notifications", timeout=15)
        assert r.status_code == 401
