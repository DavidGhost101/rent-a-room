// Native app configuration.
//
// The Android app has no backend of its own -- it's a WebView shell around
// the same frontend the website uses, and every API call needs an ABSOLUTE
// URL to wherever the Rent A Room backend is actually deployed (Railway,
// Render, a VPS, etc.). On the website this file isn't loaded at all, so
// requests stay relative to whatever domain is serving the page -- unchanged
// from before.
//
// Before building the Android app, replace the placeholder below with your
// real deployed backend URL (no trailing slash), e.g.:
//   window.API_BASE_URL = 'https://rentaroom-production.up.railway.app';
window.API_BASE_URL = 'https://REPLACE_WITH_YOUR_DEPLOYED_BACKEND_URL';
