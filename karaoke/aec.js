(() => {
  const modeControl = document.getElementById("speakerMode") || document.getElementById("speakerIsolation");
  const status = document.getElementById("aecStatus");
  const songVolume = document.getElementById("songVolume");
  const songVolumeOut = document.getElementById("songVolumeOut");
  const audio = document.getElementById("karaokeAudio");
  const mediaDevices = navigator.mediaDevices;
  if (!modeControl || !status || !mediaDevices?.getUserMedia) return;

  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  let activeAudioTrack = null;

  function mode() {
    if (modeControl.tagName === "SELECT") return modeControl.value;
    return modeControl.checked ? "balanced" : "vocal";
  }

  function supported() {
    try { return Boolean(mediaDevices.getSupportedConstraints?.().echoCancellation); }
    catch (_) { return false; }
  }

  function requestedEchoCancellation(selectedMode) {
    if (selectedMode === "vocal") return false;
    if (selectedMode === "strong") return "all";
    return true;
  }

  function presetCap(selectedMode) {
    if (selectedMode === "vocal") return 0.62;
    if (selectedMode === "balanced") return 0.72;
    return 1;
  }

  function softenBackingTrack(selectedMode) {
    if (!songVolume || !audio) return "";
    const cap = presetCap(selectedMode);
    const current = Number(songVolume.value);
    if (!Number.isFinite(current) || current <= cap) return "";
    songVolume.value = String(cap);
    audio.volume = cap;
    if (songVolumeOut) songVolumeOut.textContent = `${Math.round(cap * 100)}%`;
    return ` Backing track softened to ${Math.round(cap * 100)}% to protect vocal tails; you can raise it manually.`;
  }

  function report(track, selectedMode, extra = "") {
    if (!track) {
      if (selectedMode === "vocal") {
        status.textContent = `Vocal First will keep browser AEC off and prioritize complete words.${extra}`;
        status.dataset.state = "vocal";
      } else if (selectedMode === "strong") {
        status.textContent = `Strong Isolation will request the strongest browser AEC available.${extra}`;
        status.dataset.state = "strong";
      } else {
        status.textContent = `Balanced will use normal browser AEC with a softer backing level.${extra}`;
        status.dataset.state = "balanced";
      }
      return;
    }

    const settings = track.getSettings?.() || {};
    const active = settings.echoCancellation;

    if (selectedMode === "vocal") {
      if (active === false) {
        status.textContent = `Vocal First active · browser AEC is off, so word endings should stay intact.${extra}`;
        status.dataset.state = "vocal";
      } else {
        status.textContent = `Vocal First requested, but this device still reports AEC enabled.${extra}`;
        status.dataset.state = "unavailable";
      }
      return;
    }

    if (selectedMode === "strong") {
      if (active === true || active === "all") {
        status.textContent = `Strong Isolation active · maximum supported browser echo cancellation.${extra}`;
        status.dataset.state = "strong";
      } else {
        status.textContent = `Strong Isolation requested, but this device does not report AEC active.${extra}`;
        status.dataset.state = "unavailable";
      }
      return;
    }

    if (active === true || active === "all") {
      status.textContent = `Balanced active · browser AEC is on with reduced backing level.${extra}`;
      status.dataset.state = "balanced";
    } else if (active === false) {
      status.textContent = `Balanced requested, but this device reports AEC inactive.${extra}`;
      status.dataset.state = "unavailable";
    } else {
      status.textContent = `Balanced AEC requested · this browser does not expose its active setting.${extra}`;
      status.dataset.state = "unknown";
    }
  }

  async function applyEchoConstraint(track, selectedMode) {
    const requested = requestedEchoCancellation(selectedMode);
    try {
      await track.applyConstraints({ echoCancellation: requested });
      return;
    } catch (error) {
      if (selectedMode === "strong") {
        await track.applyConstraints({ echoCancellation: true });
        return;
      }
      throw error;
    }
  }

  try {
    mediaDevices.getUserMedia = async function(constraints = {}) {
      const selectedMode = mode();
      const next = { ...constraints };
      if (next.audio) {
        const audioConstraints = next.audio === true ? {} : { ...next.audio };
        audioConstraints.echoCancellation = requestedEchoCancellation(selectedMode);
        audioConstraints.noiseSuppression = false;
        audioConstraints.autoGainControl = false;
        next.audio = audioConstraints;
      }

      const volumeNote = softenBackingTrack(selectedMode);
      let stream;
      try {
        stream = await originalGetUserMedia(next);
      } catch (error) {
        if (selectedMode !== "strong" || !next.audio || typeof next.audio !== "object") throw error;
        const fallback = { ...next, audio: { ...next.audio, echoCancellation: true } };
        stream = await originalGetUserMedia(fallback);
      }

      activeAudioTrack = stream.getAudioTracks?.()[0] || null;
      report(activeAudioTrack, selectedMode, volumeNote);
      return stream;
    };
  } catch (_) {
    status.textContent = "Mic cleanup presets could not wrap microphone capture in this browser.";
    status.dataset.state = "unavailable";
  }

  modeControl.addEventListener("change", async () => {
    const selectedMode = mode();
    const volumeNote = softenBackingTrack(selectedMode);

    if (selectedMode !== "vocal" && !supported()) {
      status.textContent = `This browser does not advertise echo-cancellation control.${volumeNote} Vocal First remains available.`;
      status.dataset.state = "unavailable";
      return;
    }

    if (!activeAudioTrack || activeAudioTrack.readyState === "ended") {
      report(null, selectedMode, volumeNote);
      return;
    }

    try {
      await applyEchoConstraint(activeAudioTrack, selectedMode);
      report(activeAudioTrack, selectedMode, volumeNote);
      try {
        if (typeof window.umami?.track === "function") {
          window.umami.track(`karaoke-mic-mode-${selectedMode}`);
        }
      } catch (_) {}
    } catch (_) {
      status.textContent = `This device needs the microphone reconnected to switch to ${selectedMode} mode.${volumeNote}`;
      status.dataset.state = "pending";
    }
  });

  report(null, mode());
})();