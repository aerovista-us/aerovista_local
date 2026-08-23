# CDA Karaoke

AeroVista Local's two-part karaoke product:

1. **Where can I sing tonight?** — local karaoke discovery.
2. **Take the stage** — a browser-based karaoke machine/game using the singer's own audio file and microphone.

Current public route: `https://local.aerovista.us/karaoke/`

## Current product

CDA Karaoke remains intentionally narrower than CDA Tonight on the discovery side. It promotes dependable recurring karaoke nights first, labels weaker schedule evidence instead of hiding uncertainty, and makes it easy to call the venue or open the source before leaving home.

The built-in machine adds a second use case: people can stay in the app and actually sing.

## Karaoke Machine V1

- Local song upload using browser-supported audio formats such as MP3, WAV and M4A.
- Song playback + volume control.
- Browser microphone permission through `getUserMedia`.
- **Speaker Isolation** mode requests browser acoustic echo cancellation (AEC) so phone/laptop playback is reduced in the captured microphone signal where the browser/device supports it.
- **Raw Vocal** mode disables AEC when an unprocessed mic signal is preferred.
- The UI reads `MediaStreamTrack.getSettings().echoCancellation` so it reports the device's actual AEC setting when available.
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
- Current score intentionally measures vocal presence + detectable pitched singing, not melody accuracy. Melody-accuracy scoring belongs to the analysis/reference tier.
- Song, analyzer and mic processing remain local in the browser in V1.

### Speaker Isolation limits

AEC is the same class of technology used by communications apps to reduce loudspeaker audio returning through the microphone, but a browser does not receive every private phone-call DSP feature exposed to native telephony stacks. Results vary by browser, phone, speaker volume, physical mic/speaker geometry, Bluetooth routing and OS processing.

Headphones remain the deterministic way to prevent the backing track from reaching the microphone. Speaker Isolation is designed to make speaker-mode karaoke substantially more usable, not claim perfect source separation.

`restrictOwnAudio` and `suppressLocalAudioPlayback` are screen-capture controls and are intentionally not used for normal microphone capture.

## AeroVista Audio Lab — Analyzer V0.1

The karaoke app now contains the first browser-native version of the high-end music analyzer. It decodes the complete user-provided song locally with Web Audio and performs an offline PCM/spectral scan.

Current outputs:

- tempo / BPM estimate + confidence;
- harmonic key/mode estimate + confidence using chroma analysis;
- RMS loudness in dBFS;
- sample peak in dBFS;
- active-block dynamic-range estimate;
- clipping percentage;
- DC offset;
- stereo L/R correlation + width indicator;
- spectral centroid / brightness;
- 85% spectral rolloff;
- 120 Hz–4 kHz vocal-band energy share;
- whole-song energy timeline;
- source-readiness score and quality warnings.

The analyzer deliberately labels estimates as estimates. V0.1 does **not** claim true LUFS, isolated-vocal analysis, melody transcription or source identity.

### Analyzer roadmap

This should converge with the existing EchoVerse audio-analysis lineage rather than become a separate analytics dialect.

**V0.2 — mastering-grade measurements**

- ITU-R BS.1770 / EBU R128 integrated LUFS;
- loudness range (LRA);
- true peak / inter-sample peak;
- MFCC features;
- more robust onset/tempo confidence;
- structural segmentation: intro / verse / chorus / bridge / outro candidates;
- silence, count-in and likely vocal-entry detection.

**V0.3 — karaoke intelligence**

- vocal-presence probability over time;
- reference pitch contour;
- melody-note segmentation;
- phrase boundaries;
- lyric/transcription alignment;
- singer-vs-reference pitch/rhythm scoring;
- key/transposition recommendations for the singer.

**V1 — Studio pipeline**

- vocal / instrumental stem separation;
- isolated reference-vocal analyzer;
- automatic lyrics + word-level timestamps;
- instrumental render for karaoke playback;
- optional persistent song-prep jobs and account history.

For heavier real-time DSP, the preferred web path is `AudioWorklet` so custom processing runs on the audio rendering thread instead of the main UI thread.

## Future Karaoke Studio

The UI reserves two optional product capabilities but deliberately keeps them disabled until a real processing backend exists.

### Strip Vocals

This should be implemented as **vocal separation / stem separation**, not a simple EQ or center-channel trick. The future service can accept a user-provided audio file and create an instrumental stem plus isolated vocal/reference stem.

Likely architecture:

- job upload / signed object storage;
- GPU or optimized separation worker;
- instrumental + vocal stems;
- waveform / timing metadata;
- cleanup and expiry policy;
- optional account/history layer.

### Create Lyrics

Future song prep can create a draft lyric/transcription track from a user-provided song, then align lines and words to timestamps. The output remains editable because automatic transcription and timing will not always be perfect.

That pipeline also unlocks true game scoring because the product can derive a reference vocal/pitch track and compare the singer against it instead of only measuring microphone activity.

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

- `index.html` — complete app shell including discovery + karaoke machine + Audio Lab.
- `styles.css` — discovery / AeroVista Local visual system.
- `machine.css` — karaoke machine, lyric studio and game UI.
- `analyzer.css` — analyzer + Speaker Isolation status UI.
- `app.js` — schedule/date/filter/render engine.
- `aec.js` — browser AEC / Speaker Isolation compatibility layer.
- `machine.js` — song upload, microphone graph, pitch detection, lyric timing and game engine.
- `analyzer.js` — local full-song PCM, tempo, key, dynamics, stereo and spectral analyzer.
- `data.js` — source-backed recurring nights and watchlist.
- `manifest.webmanifest` / `icon.svg` — installable app metadata.

## Public identity

- Product: **CDA Karaoke**
- Current host: `https://local.aerovista.us/karaoke/`
- Possible future dedicated repo: `aerovista-us/cda-karaoke`
- Possible future dedicated host: `karaoke.aerovista.us`

## Umami

Once a dedicated Umami website is created, add its tracker script to `index.html` before `data.js`:

```html
<script defer src="https://YOUR-UMAMI-HOST/script.js" data-website-id="YOUR-WEBSITE-ID"></script>
```

Machine mode additionally calls Umami hooks for song upload, microphone connection, AEC changes, lyric preparation/timing, monitoring, performance start/finish and Audio Lab analysis when the tracker is available.
