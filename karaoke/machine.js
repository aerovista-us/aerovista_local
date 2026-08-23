(() => {
  const root = document.getElementById("karaokeMachine");
  if (!root) return;

  const songFile = document.getElementById("songFile");
  const songName = document.getElementById("songName");
  const audio = document.getElementById("karaokeAudio");
  const songVolume = document.getElementById("songVolume");
  const songVolumeOut = document.getElementById("songVolumeOut");
  const micConnect = document.getElementById("micConnect");
  const micState = document.getElementById("micState");
  const micStateDetail = document.getElementById("micStateDetail");
  const micLevelBar = document.getElementById("micLevelBar");
  const pitchValue = document.getElementById("pitchValue");
  const noteValue = document.getElementById("noteValue");
  const monitorToggle = document.getElementById("monitorToggle");
  const micGainControl = document.getElementById("micGain");
  const micGainOut = document.getElementById("micGainOut");
  const echoAmount = document.getElementById("echoAmount");
  const echoAmountOut = document.getElementById("echoAmountOut");
  const lyricsInput = document.getElementById("lyricsInput");
  const prepareLyrics = document.getElementById("prepareLyrics");
  const autoTimeLyrics = document.getElementById("autoTimeLyrics");
  const startSync = document.getElementById("startSync");
  const syncPad = document.getElementById("syncPad");
  const syncNow = document.getElementById("syncNow");
  const tapSync = document.getElementById("tapSync");
  const syncStatus = document.getElementById("syncStatus");
  const stageSongName = document.getElementById("stageSongName");
  const stageSongMeta = document.getElementById("stageSongMeta");
  const currentLyric = document.getElementById("currentLyric");
  const nextLyric = document.getElementById("nextLyric");
  const stageProgressBar = document.getElementById("stageProgressBar");
  const scoreValue = document.getElementById("scoreValue");
  const comboValue = document.getElementById("comboValue");
  const startGame = document.getElementById("startGame");
  const pauseGame = document.getElementById("pauseGame");
  const restartGame = document.getElementById("restartGame");

  let audioUrl = "";
  let lyricLines = [];
  let lyricTimes = [];
  let syncing = false;
  let syncIndex = 0;
  let gaming = false;
  let micStream = null;
  let audioContext = null;
  let analyser = null;
  let micGainNode = null;
  let dryGainNode = null;
  let wetGainNode = null;
  let delayNode = null;
  let feedbackNode = null;
  let micBuffer = null;
  let meterFrame = 0;
  let gameFrame = 0;
  let totalSamples = 0;
  let activeSamples = 0;
  let pitchedSamples = 0;
  let comboSamples = 0;
  let lastPitchAt = 0;

  function track(name) {
    try {
      if (typeof window.umami?.track === "function") window.umami.track(name);
    } catch (_) {}
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setSongReadyState() {
    const hasSong = Boolean(audio.src);
    const hasLyrics = lyricLines.length > 0;
    startSync.disabled = !(hasSong && hasLyrics);
    autoTimeLyrics.disabled = !(hasSong && hasLyrics && Number.isFinite(audio.duration) && audio.duration > 0);
    startGame.disabled = !(hasSong && hasLyrics);
  }

  function parseLyrics() {
    lyricLines = lyricsInput.value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 250);
    lyricTimes = [];
    if (!lyricLines.length) {
      syncStatus.textContent = "Add at least one lyric line first.";
      currentLyric.textContent = "Paste lyrics, then prepare them.";
      nextLyric.textContent = "One line per row works best.";
      setSongReadyState();
      return;
    }
    currentLyric.textContent = lyricLines[0];
    nextLyric.textContent = lyricLines[1] || "Ready when you are.";
    syncStatus.textContent = `${lyricLines.length} lyric lines prepared. Tap-sync them for the best karaoke timing.`;
    setSongReadyState();
    track("karaoke-prepare-lyrics");
  }

  function autoTime() {
    if (!lyricLines.length || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const intro = Math.min(5, audio.duration * 0.05);
    const usable = Math.max(1, audio.duration - intro);
    lyricTimes = lyricLines.map((_, i) => intro + (usable * i / lyricLines.length));
    syncStatus.textContent = `Auto-timed ${lyricLines.length} lines across ${formatClock(audio.duration)}. Tap-sync later for tighter timing.`;
    setSongReadyState();
    track("karaoke-auto-time-lyrics");
  }

  async function beginSync() {
    if (!audio.src || !lyricLines.length) return;
    syncing = true;
    gaming = false;
    syncIndex = 0;
    lyricTimes = [];
    audio.currentTime = 0;
    syncPad.classList.add("active");
    syncNow.innerHTML = `Waiting for: <strong>${escapeHtml(lyricLines[0])}</strong>`;
    tapSync.textContent = "Tap when this line starts";
    syncStatus.textContent = "Tap once at the start of every lyric line. The song will keep playing.";
    try { await audio.play(); } catch (_) {}
    track("karaoke-start-tap-sync");
  }

  function recordSyncTap() {
    if (!syncing) return;
    lyricTimes.push(audio.currentTime);
    syncIndex += 1;
    if (syncIndex >= lyricLines.length) {
      syncing = false;
      syncPad.classList.remove("active");
      syncStatus.textContent = `Tap-sync complete: ${lyricTimes.length} timed lines saved for this session.`;
      setSongReadyState();
      track("karaoke-complete-tap-sync");
      return;
    }
    syncNow.innerHTML = `Waiting for: <strong>${escapeHtml(lyricLines[syncIndex])}</strong>`;
    tapSync.textContent = `${syncIndex + 1}/${lyricLines.length} · Tap line start`;
  }

  function ensureTiming() {
    if (lyricTimes.length === lyricLines.length) return true;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      autoTime();
      return lyricTimes.length === lyricLines.length;
    }
    return false;
  }

  function findLyricIndex(time) {
    if (!lyricTimes.length) return 0;
    let index = 0;
    for (let i = 0; i < lyricTimes.length; i += 1) {
      if (time >= lyricTimes[i]) index = i;
      else break;
    }
    return index;
  }

  function renderStage() {
    if (!audio.src || !lyricLines.length) return;
    const index = findLyricIndex(audio.currentTime);
    const started = lyricTimes.length ? audio.currentTime >= lyricTimes[0] : true;
    currentLyric.textContent = started ? (lyricLines[index] || "") : "Get ready…";
    currentLyric.classList.toggle("active", gaming && !audio.paused);
    nextLyric.textContent = started ? (lyricLines[index + 1] || "Last line — finish strong.") : (lyricLines[0] || "");
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    stageProgressBar.style.width = `${duration ? clamp((audio.currentTime / duration) * 100, 0, 100) : 0}%`;
  }

  function resetScore() {
    totalSamples = 0;
    activeSamples = 0;
    pitchedSamples = 0;
    comboSamples = 0;
    scoreValue.textContent = "0";
    comboValue.textContent = "0.0s combo";
    comboValue.classList.remove("hot");
  }

  function updateScore(rms, pitch) {
    if (!gaming || audio.paused || audio.ended) return;
    totalSamples += 1;
    const active = rms > 0.028;
    if (active) {
      activeSamples += 1;
      comboSamples += 1;
      if (pitch > 65 && pitch < 1300) pitchedSamples += 1;
    } else {
      comboSamples = 0;
    }
    const presence = totalSamples ? activeSamples / totalSamples : 0;
    const pitched = activeSamples ? pitchedSamples / activeSamples : 0;
    const score = clamp(Math.round(presence * 72 + pitched * 28), 0, 100);
    const comboSeconds = comboSamples / 10;
    scoreValue.textContent = String(score);
    comboValue.textContent = `${comboSeconds.toFixed(1)}s combo`;
    comboValue.classList.toggle("hot", comboSeconds >= 3);
  }

  async function startPerformance() {
    if (!audio.src || !lyricLines.length) return;
    if (!ensureTiming()) {
      syncStatus.textContent = "Wait for the song duration to load, then try again.";
      return;
    }
    if (!micStream) {
      try { await connectMic(); } catch (_) {}
    }
    resetScore();
    syncing = false;
    syncPad.classList.remove("active");
    gaming = true;
    audio.currentTime = 0;
    try { await audio.play(); } catch (_) {}
    pauseGame.disabled = false;
    restartGame.disabled = false;
    startGame.textContent = "Restart performance";
    renderStage();
    track("karaoke-start-performance");
  }

  function togglePause() {
    if (!audio.src) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function restartPerformance() {
    if (!audio.src) return;
    audio.currentTime = 0;
    resetScore();
    if (gaming) audio.play().catch(() => {});
    renderStage();
  }

  async function connectMic() {
    if (micStream) {
      stopMic();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      micState.textContent = "Mic unavailable";
      micStateDetail.textContent = "This browser does not expose microphone access.";
      throw new Error("getUserMedia unavailable");
    }

    micState.textContent = "Requesting mic…";
    micStateDetail.textContent = "Your browser will ask for permission.";
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") await audioContext.resume();

      const source = audioContext.createMediaStreamSource(micStream);
      micGainNode = audioContext.createGain();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      micBuffer = new Float32Array(analyser.fftSize);
      dryGainNode = audioContext.createGain();
      wetGainNode = audioContext.createGain();
      delayNode = audioContext.createDelay(1.0);
      feedbackNode = audioContext.createGain();
      delayNode.delayTime.value = 0.16;
      feedbackNode.gain.value = 0.18;
      dryGainNode.gain.value = monitorToggle.checked ? 0.8 : 0;
      wetGainNode.gain.value = monitorToggle.checked ? Number(echoAmount.value) : 0;
      micGainNode.gain.value = Number(micGainControl.value);

      source.connect(micGainNode);
      micGainNode.connect(analyser);
      micGainNode.connect(dryGainNode);
      micGainNode.connect(delayNode);
      delayNode.connect(wetGainNode);
      delayNode.connect(feedbackNode);
      feedbackNode.connect(delayNode);
      dryGainNode.connect(audioContext.destination);
      wetGainNode.connect(audioContext.destination);

      micState.textContent = "Mic connected";
      micStateDetail.textContent = "Level + pitch detection active.";
      micConnect.textContent = "Disconnect mic";
      runMeter();
      track("karaoke-connect-mic");
    } catch (error) {
      micStream = null;
      micState.textContent = "Mic blocked";
      micStateDetail.textContent = "Allow microphone permission and use HTTPS.";
      micConnect.textContent = "Connect microphone";
      throw error;
    }
  }

  function stopMic() {
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = 0;
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    micStream = null;
    analyser = null;
    micGainNode = null;
    dryGainNode = null;
    wetGainNode = null;
    delayNode = null;
    feedbackNode = null;
    micLevelBar.style.width = "0%";
    pitchValue.textContent = "—";
    noteValue.textContent = "No pitch";
    micState.textContent = "Mic disconnected";
    micStateDetail.textContent = "Connect when you are ready to sing.";
    micConnect.textContent = "Connect microphone";
    track("karaoke-disconnect-mic");
  }

  function runMeter() {
    if (!analyser || !micBuffer) return;
    analyser.getFloatTimeDomainData(micBuffer);
    let sum = 0;
    for (let i = 0; i < micBuffer.length; i += 1) sum += micBuffer[i] * micBuffer[i];
    const rms = Math.sqrt(sum / micBuffer.length);
    micLevelBar.style.width = `${clamp(rms * 460, 0, 100)}%`;

    const now = performance.now();
    let pitch = 0;
    if (now - lastPitchAt > 95 && rms > 0.018) {
      pitch = detectPitch(micBuffer, audioContext.sampleRate);
      lastPitchAt = now;
      if (pitch > 0) {
        const note = frequencyToNote(pitch);
        pitchValue.textContent = `${Math.round(pitch)} Hz`;
        noteValue.textContent = note;
      } else {
        pitchValue.textContent = "—";
        noteValue.textContent = "No pitch";
      }
    } else if (pitchValue.textContent !== "—") {
      const parsed = Number.parseFloat(pitchValue.textContent);
      if (Number.isFinite(parsed)) pitch = parsed;
    }

    updateScore(rms, pitch);
    meterFrame = requestAnimationFrame(runMeter);
  }

  function detectPitch(buffer, sampleRate) {
    let rms = 0;
    for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.012) return -1;

    let start = 0;
    let end = buffer.length - 1;
    const threshold = 0.2;
    for (let i = 0; i < buffer.length / 2; i += 1) {
      if (Math.abs(buffer[i]) < threshold) { start = i; break; }
    }
    for (let i = 1; i < buffer.length / 2; i += 1) {
      if (Math.abs(buffer[buffer.length - i]) < threshold) { end = buffer.length - i; break; }
    }
    const trimmed = buffer.slice(start, end);
    const size = trimmed.length;
    const correlations = new Array(size).fill(0);
    for (let lag = 0; lag < size; lag += 1) {
      let value = 0;
      for (let i = 0; i < size - lag; i += 1) value += trimmed[i] * trimmed[i + lag];
      correlations[lag] = value;
    }
    let dip = 0;
    while (dip + 1 < size && correlations[dip] > correlations[dip + 1]) dip += 1;
    let maxPos = -1;
    let maxVal = -1;
    for (let i = dip; i < size; i += 1) {
      if (correlations[i] > maxVal) { maxVal = correlations[i]; maxPos = i; }
    }
    if (maxPos <= 0) return -1;
    return sampleRate / maxPos;
  }

  function frequencyToNote(frequency) {
    if (!(frequency > 0)) return "No pitch";
    const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const note = names[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${note}${octave}`;
  }

  function formatClock(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }

  songFile.addEventListener("change", () => {
    const file = songFile.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      songName.textContent = "Choose an audio file (MP3, WAV, M4A, etc.).";
      return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    audio.src = audioUrl;
    audio.load();
    songName.textContent = file.name;
    stageSongName.textContent = file.name.replace(/\.[^.]+$/, "");
    stageSongMeta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · local file`;
    resetScore();
    setSongReadyState();
    track("karaoke-upload-song");
  });

  audio.addEventListener("loadedmetadata", () => {
    stageSongMeta.textContent = `${formatClock(audio.duration)} · local file`;
    setSongReadyState();
  });
  audio.addEventListener("timeupdate", renderStage);
  audio.addEventListener("play", () => { pauseGame.textContent = "Pause"; });
  audio.addEventListener("pause", () => { pauseGame.textContent = "Resume"; });
  audio.addEventListener("ended", () => {
    gaming = false;
    currentLyric.classList.remove("active");
    comboValue.textContent = `Final · ${scoreValue.textContent}/100`;
    track("karaoke-finish-performance");
  });

  songVolume.addEventListener("input", () => {
    const value = clamp(Number(songVolume.value), 0, 1);
    audio.volume = value;
    songVolumeOut.textContent = `${Math.round(value * 100)}%`;
  });
  micGainControl.addEventListener("input", () => {
    const value = clamp(Number(micGainControl.value), 0, 2);
    micGainOut.textContent = `${value.toFixed(1)}×`;
    if (micGainNode) micGainNode.gain.value = value;
  });
  echoAmount.addEventListener("input", () => {
    const value = clamp(Number(echoAmount.value), 0, 0.8);
    echoAmountOut.textContent = `${Math.round(value * 100)}%`;
    if (wetGainNode) wetGainNode.gain.value = monitorToggle.checked ? value : 0;
  });
  monitorToggle.addEventListener("change", () => {
    if (dryGainNode) dryGainNode.gain.value = monitorToggle.checked ? 0.8 : 0;
    if (wetGainNode) wetGainNode.gain.value = monitorToggle.checked ? Number(echoAmount.value) : 0;
    track(monitorToggle.checked ? "karaoke-monitor-on" : "karaoke-monitor-off");
  });

  micConnect.addEventListener("click", () => connectMic().catch(() => {}));
  prepareLyrics.addEventListener("click", parseLyrics);
  autoTimeLyrics.addEventListener("click", autoTime);
  startSync.addEventListener("click", () => beginSync().catch(() => {}));
  tapSync.addEventListener("click", recordSyncTap);
  startGame.addEventListener("click", () => startPerformance().catch(() => {}));
  pauseGame.addEventListener("click", togglePause);
  restartGame.addEventListener("click", restartPerformance);

  window.addEventListener("beforeunload", () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    if (meterFrame) cancelAnimationFrame(meterFrame);
    if (gameFrame) cancelAnimationFrame(gameFrame);
  });

  audio.volume = Number(songVolume.value);
  setSongReadyState();
})();
