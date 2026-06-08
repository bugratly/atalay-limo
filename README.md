# Atalay Limo

Private transportation marketplace built for Atalay Limo.

Maintained by bugratly.


## Apple Maps

The map component now supports Apple MapKit JS. Add this to `frontend/.env` when you have an Apple Maps token:

```env
REACT_APP_APPLE_MAPS_TOKEN=your_mapkit_js_token
```

If the token is missing or invalid, the app automatically falls back to the existing OpenStreetMap/CARTO map so development still works in Codespaces.
