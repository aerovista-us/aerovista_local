# CDA Karaoke

AeroVista Local's two-part karaoke product:

1. **Where can I sing tonight?** — local karaoke discovery.
2. **Take the stage** — a browser-based karaoke machine/game using the singer's own audio file and microphone.

## Current product

CDA Karaoke remains intentionally narrower than CDA Tonight on the discovery side. It promotes dependable recurring karaoke nights first, labels weaker schedule evidence instead of hiding uncertainty, and makes it easy to call the venue or open the source before leaving home.

The built-in machine adds a second use case: people can stay in the app and actually sing.

## Karaoke Machine V1

- Local song upload using browser-supported audio formats such as MP3, WAV and M4A.
- Song playback + volume control.
- Browser microphone permission through `getUserMedia`.
- Live microphone level meter.
- Live pitch frequency + musical-note estimate.
- Adjustable microphone gain.
- Optional microphone monitoring.
- Adjustable echo/delay effect for monitored vocals.
- Lyrics editor: paste one phrase per line.
- **Auto-Time Lyrics** for instant approximate timing.
- **Tap-Sync Lyrics** for real karaoke-style line timing: play the song once and tap when each line starts.
- Full karaoke stage with current line, next line and song progress.
- Performance game with 0–100 score and live singing combo.
- Current score intentionally measures vocal presence + detectable pitched singing, not melody accuracy. Melody-accuracy scoring belongs to the future analysis tier.
- Song and mic processing remain local in the browser in V1.

### Browser / hardware notes

Microphone access requires a secure context (`https://` or localhost) and explicit browser permission. Monitoring the microphone through speakers can create acoustic feedback, so headphones are strongly recommended when **Hear my microphone** is enabled.

## Future Karaoke Studio

The UI reserves two optional product capabilities but deliberately keeps them disabled until a real processing backend exists:

### Strip Vocals

Technically this should be implemented as **vocal separation / stem separation**, not a simple EQ trick. The future service can accept a user-provided audio file and create an instrumental stem plus isolated vocal/reference stem. Likely architecture:

- job upload / signed object storage;
- GPU or optimized separation worker;
- instrumental + vocal stems;
- waveform / timing metadata;
- cleanup and expiry policy;
- optional account/history layer.

### Create Lyrics

Future song prep can create a draft lyric/transcription track from a user-provided song, then align lines/words to timestamps. The output should remain editable because automatic transcription and timing will never be perfect.

That pipeline also unlocks stronger game scoring because the product can derive a reference vocal/pitch track and compare the singer against it instead of only measuring microphone activity.

## Discovery V1

- Mobile-first, zero-dependency static app.
- Seven-day selector generated in `America/Los_Angeles`.
- Verified-only filter.
- Confidence labels: `verified` vs `reported`.
- Direct map, phone, and source actions.
- Event-driven venue watchlist.
- Community update path reuses CDA Tonight's submission surface.
- PWA manifest and app icon included.
- Umami event attributes/hooks are placed on the important interaction paths.

## Data policy

Recurring karaoke is unusually volatile. A venue being tagged as “karaoke” does **not** mean a weekly schedule is current.

Promotion rules:

1. `verified`: a first-party venue calendar or karaoke-host schedule supports the recurring night/time.
2. `reported`: current evidence supports karaoke at the venue, but the recurrence/time is not strong enough for verified status.
3. Event-driven/uncertain venues stay in the watchlist rather than the weekly feed.

Initial source check: 2026-08-23.

## Files

- `index.html` — complete app shell including discovery + karaoke machine.
- `styles.css` — discovery / AeroVista Local visual system.
- `machine.css` — karaoke machine, lyric studio and game UI.
- `app.js` — schedule/date/filter/render engine.
- `machine.js` — song upload, microphone graph, pitch detection, lyric timing and game engine.
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

Machine mode additionally calls Umami hooks for song upload, microphone connection, lyric preparation/timing, monitoring and performance start/finish when the tracker is available.
