(() => {
  const toggle = document.getElementById("speakerIsolation");
  const status = document.getElementById("aecStatus");
  const mediaDevices = navigator.mediaDevices;
  if (!toggle || !status || !mediaDevices?.getUserMedia) return;

  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  let activeAudioTrack = null;

  function supported() {
    try { return Boolean(mediaDevices.getSupportedConstraints?.().echoCancellation); }
    catch (_) { return false; }
  }

  function report(track) {
    if (!track) {
      status.textContent = toggle.checked
        ? "Speaker Isolation will be requested when the mic connects."
        : "Raw Vocal mode: browser echo cancellation is disabled.";
      status.dataset.state = toggle.checked ? "pending" : "raw";
      return;
    }
    const settings = track.getSettings?.() || {};
    if (settings.echoCancellation === true) {
      status.textContent = "AEC enabled · this device reports browser echo cancellation active.";
      status.dataset.state = "active";
    } else if (settings.echoCancellation === false) {
      status.textContent = toggle.checked
        ? "AEC requested, but this device reports it inactive. Headphones are the reliable fallback."
        : "Raw Vocal active · echo cancellation off for the cleanest unprocessed mic signal.";
      status.dataset.state = toggle.checked ? "unavailable" : "raw";
    } else {
      status.textContent = toggle.checked
        ? "AEC requested · this browser does not expose its active setting."
        : "Raw Vocal requested · this browser does not expose its active setting.";
      status.dataset.state = "unknown";
    }
  }

  try {
    mediaDevices.getUserMedia = async function(constraints = {}) {
      const next = { ...constraints };
      if (next.audio) {
        const audio = next.audio === true ? {} : { ...next.audio };
        audio.echoCancellation = toggle.checked;
        next.audio = audio;
      }
      const stream = await originalGetUserMedia(next);
      activeAudioTrack = stream.getAudioTracks?.()[0] || null;
      report(activeAudioTrack);
      return stream;
    };
  } catch (_) {
    status.textContent = "Speaker Isolation control could not wrap microphone capture in this browser.";
    status.dataset.state = "unavailable";
  }

  toggle.addEventListener("change", async () => {
    if (!supported()) {
      status.textContent = "This browser does not advertise echo-cancellation control. Headphones are the reliable fallback.";
      status.dataset.state = "unavailable";
      return;
    }
    if (!activeAudioTrack || activeAudioTrack.readyState === "ended") {
      report(null);
      return;
    }
    try {
      await activeAudioTrack.applyConstraints({ echoCancellation: toggle.checked });
      report(activeAudioTrack);
      try {
        if (typeof window.umami?.track === "function") {
          window.umami.track(toggle.checked ? "karaoke-aec-on" : "karaoke-aec-off");
        }
      } catch (_) {}
    } catch (_) {
      status.textContent = "This device needs the microphone reconnected to change AEC mode.";
      status.dataset.state = "pending";
    }
  });

  if (!supported()) {
    status.textContent = "This browser does not advertise echo-cancellation control. Headphones are the reliable fallback.";
    status.dataset.state = "unavailable";
  } else {
    report(null);
  }
})();