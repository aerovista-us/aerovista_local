# CDA Karaoke

AeroVista Local's focused answer to: **Where can I sing tonight?**

## Product position

CDA Karaoke is intentionally narrower than CDA Tonight. It promotes dependable recurring karaoke nights first, labels weaker schedule evidence instead of hiding uncertainty, and makes it easy to call the venue or open the source before leaving home.

## V1

- Mobile-first, zero-dependency static app.
- Seven-day selector generated in `America/Los_Angeles`.
- Verified-only filter.
- Confidence labels: `verified` vs `reported`.
- Direct map, phone, and source actions.
- Event-driven venue watchlist.
- Community update path reuses CDA Tonight's submission surface.
- PWA manifest and app icon included.
- Umami event attributes are already placed on the important interaction paths.

## Data policy

Recurring karaoke is unusually volatile. A venue being tagged as “karaoke” does **not** mean a weekly schedule is current.

Promotion rules:

1. `verified`: a first-party venue calendar or karaoke-host schedule supports the recurring night/time.
2. `reported`: current evidence supports karaoke at the venue, but the recurrence/time is not strong enough for verified status.
3. Event-driven/uncertain venues stay in the watchlist rather than the weekly feed.

Initial source check: 2026-08-23.

## Files

- `index.html` — app shell and semantic content.
- `styles.css` — standalone AeroVista Local karaoke visual system.
- `app.js` — schedule/date/filter/render engine.
- `data.js` — source-backed recurring nights and watchlist.
- `manifest.webmanifest` / `icon.svg` — installable app metadata.

## Recommended public identity

- Product: **CDA Karaoke**
- Recommended dedicated repo: `aerovista-us/cda-karaoke`
- Recommended public host: `karaoke.aerovista.us`
- Umami website name: `CDA Karaoke`
- Umami domain: `karaoke.aerovista.us`

The app currently lives under `aerovista_local/karaoke/` as a working incubator build so it can be reviewed before extracting it into a dedicated repo/deployment.

## Umami

Once the Umami website is created, add its tracker script to `index.html` before `data.js`:

```html
<script defer src="https://YOUR-UMAMI-HOST/script.js" data-website-id="YOUR-WEBSITE-ID"></script>
```

The UI already contains `data-umami-event` attributes for day selection, maps, venue calls, source checks, and submissions.
