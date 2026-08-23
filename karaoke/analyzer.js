(() => {
  const root = document.getElementById("musicAnalyzer");
  if (!root) return;

  const songFile = document.getElementById("songFile");
  const analyzeButton = document.getElementById("analyzeSong");
  const analyzeStatus = document.getElementById("analyzeStatus");
  const resultGrid = document.getElementById("analysisResults");
  const canvas = document.getElementById("analysisCanvas");
  const readiness = document.getElementById("analysisReadiness");

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let lastAnalysis = null;

  const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

  function track(name) {
    try { if (typeof window.umami?.track === "function") window.umami.track(name); } catch (_) {}
  }

  function db(value) {
    return 20 * Math.log10(Math.max(1e-12, value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    if (lo === hi) return sorted[lo];
    const t = index - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  async function yieldToUI() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  function fftMagnitudes(signal) {
    const n = signal.length;
    const real = new Float64Array(n);
    const imag = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      real[i] = signal[i] * window;
    }

    let j = 0;
    for (let i = 1; i < n; i += 1) {
      let bit = n >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let len = 2; len <= n; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wLenR = Math.cos(angle);
      const wLenI = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let wr = 1;
        let wi = 0;
        for (let k = 0; k < len / 2; k += 1) {
          const uR = real[i + k];
          const uI = imag[i + k];
          const vR = real[i + k + len / 2] * wr - imag[i + k + len / 2] * wi;
          const vI = real[i + k + len / 2] * wi + imag[i + k + len / 2] * wr;
          real[i + k] = uR + vR;
          imag[i + k] = uI + vI;
          real[i + k + len / 2] = uR - vR;
          imag[i + k + len / 2] = uI - vI;
          const nextWr = wr * wLenR - wi * wLenI;
          wi = wr * wLenI + wi * wLenR;
          wr = nextWr;
        }
      }
    }

    const out = new Float64Array(n / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Math.hypot(real[i], imag[i]);
    return out;
  }

  function estimateTempo(mono, sampleRate) {
    const frame = 1024;
    const hop = 256;
    if (mono.length < frame * 4) return { bpm: 0, confidence: 0 };
    const envelope = [];
    let previous = 0;
    for (let start = 0; start + frame < mono.length; start += hop) {
      let sum = 0;
      for (let i = 0; i < frame; i += 1) sum += mono[start + i] * mono[start + i];
      const energy = Math.sqrt(sum / frame);
      envelope.push(Math.max(0, energy - previous * 0.96));
      previous = energy;
    }
    const mean = envelope.reduce((a, b) => a + b, 0) / Math.max(1, envelope.length);
    for (let i = 0; i < envelope.length; i += 1) envelope[i] = Math.max(0, envelope[i] - mean * 0.65);

    const fps = sampleRate / hop;
    const candidates = [];
    for (let bpm = 60; bpm <= 190; bpm += 0.5) {
      const lag = Math.round((60 * fps) / bpm);
      if (lag < 1 || lag >= envelope.length) continue;
      let score = 0;
      let normA = 0;
      let normB = 0;
      for (let i = lag; i < envelope.length; i += 1) {
        const a = envelope[i];
        const b = envelope[i - lag];
        score += a * b;
        normA += a * a;
        normB += b * b;
      }
      score /= Math.sqrt(normA * normB) || 1;
      candidates.push({ bpm, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || { bpm: 0, score: 0 };
    const distinctSecond = candidates.find(item => Math.abs(item.bpm - best.bpm) > 3) || { score: 0 };
    return {
      bpm: Math.round(best.bpm),
      confidence: clamp((best.score - distinctSecond.score + best.score * 0.25) * 100, 0, 99)
    };
  }

  function estimateKey(chroma) {
    const total = chroma.reduce((a, b) => a + b, 0);
    if (!total) return { label: "Unknown", confidence: 0 };
    const normalized = chroma.map(value => value / total);
    const scored = [];
    for (let root = 0; root < 12; root += 1) {
      for (const [mode, profile] of [["major", MAJOR_PROFILE], ["minor", MINOR_PROFILE]]) {
        let dot = 0;
        let profileNorm = 0;
        let chromaNorm = 0;
        for (let i = 0; i < 12; i += 1) {
          const p = profile[(i - root + 12) % 12];
          dot += normalized[i] * p;
          profileNorm += p * p;
          chromaNorm += normalized[i] * normalized[i];
        }
        const score = dot / (Math.sqrt(profileNorm * chromaNorm) || 1);
        scored.push({ root, mode, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1] || { score: 0 };
    return {
      label: `${NOTES[best.root]} ${best.mode}`,
      confidence: clamp((best.score - second.score) * 550 + best.score * 28, 0, 99)
    };
  }

  function buildMono(buffer, targetRate = 12000) {
    const stride = Math.max(1, Math.round(buffer.sampleRate / targetRate));
    const rate = buffer.sampleRate / stride;
    const length = Math.floor(buffer.length / stride);
    const mono = new Float32Array(length);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      const sourceIndex = i * stride;
      for (const channel of channels) sum += channel[sourceIndex] || 0;
      mono[i] = sum / channels.length;
    }
    return { mono, rate };
  }

  function basicMetrics(buffer) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    let peak = 0;
    let sumSquares = 0;
    let sum = 0;
    let samples = 0;
    let clipped = 0;
    const stride = buffer.length > 12_000_000 ? 2 : 1;

    let lr = 0;
    let ll = 0;
    let rr = 0;
    let stereoSamples = 0;

    for (let i = 0; i < buffer.length; i += stride) {
      let mixed = 0;
      for (const channel of channels) {
        const value = channel[i] || 0;
        peak = Math.max(peak, Math.abs(value));
        if (Math.abs(value) >= 0.999) clipped += 1;
        mixed += value;
      }
      mixed /= channels.length;
      sumSquares += mixed * mixed;
      sum += mixed;
      samples += 1;

      if (channels.length >= 2) {
        const left = channels[0][i] || 0;
        const right = channels[1][i] || 0;
        lr += left * right;
        ll += left * left;
        rr += right * right;
        stereoSamples += 1;
      }
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, samples));
    const correlation = channels.length >= 2 ? lr / (Math.sqrt(ll * rr) || 1) : 1;
    return {
      peak,
      rms,
      dc: sum / Math.max(1, samples),
      clippedPct: 100 * clipped / Math.max(1, samples * channels.length),
      correlation: clamp(correlation, -1, 1),
      stereoSamples
    };
  }

  function blockDynamics(mono, rate) {
    const block = Math.max(256, Math.round(rate * 0.4));
    const values = [];
    const energyTimeline = [];
    for (let start = 0; start + block <= mono.length; start += block) {
      let sum = 0;
      for (let i = 0; i < block; i += 1) sum += mono[start + i] * mono[start + i];
      const rms = Math.sqrt(sum / block);
      values.push(db(rms));
      energyTimeline.push(rms);
    }
    const active = values.filter(value => value > -60);
    const p10 = percentile(active, 0.10);
    const p95 = percentile(active, 0.95);
    return {
      rangeDb: Math.max(0, p95 - p10),
      p10,
      p95,
      energyTimeline
    };
  }

  async function spectralMetrics(mono, rate) {
    const fftSize = 2048;
    const windows = Math.min(180, Math.max(24, Math.floor(mono.length / (rate * 0.75))));
    const chroma = Array(12).fill(0);
    let centroidSum = 0;
    let rolloffSum = 0;
    let vocalEnergy = 0;
    let usefulEnergy = 0;
    let used = 0;

    for (let w = 0; w < windows; w += 1) {
      const center = Math.floor(((w + 0.5) / windows) * mono.length);
      const start = clamp(center - fftSize / 2, 0, Math.max(0, mono.length - fftSize));
      const frame = mono.slice(start, start + fftSize);
      if (frame.length < fftSize) continue;
      const mags = fftMagnitudes(frame);
      let weighted = 0;
      let magSum = 0;
      let spectrumEnergy = 0;
      const cumulative = [];

      for (let k = 1; k < mags.length; k += 1) {
        const frequency = k * rate / fftSize;
        const mag = mags[k];
        const energy = mag * mag;
        if (frequency >= 40 && frequency <= 6000) {
          weighted += frequency * mag;
          magSum += mag;
          spectrumEnergy += energy;
          usefulEnergy += energy;
          if (frequency >= 120 && frequency <= 4000) vocalEnergy += energy;
        }
        cumulative.push(spectrumEnergy);
        if (frequency >= 55 && frequency <= 4200 && mag > 0) {
          const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
          chroma[((midi % 12) + 12) % 12] += Math.sqrt(mag);
        }
      }

      if (magSum > 0) {
        centroidSum += weighted / magSum;
        const target = spectrumEnergy * 0.85;
        let rolloffBin = 1;
        for (let i = 0; i < cumulative.length; i += 1) {
          if (cumulative[i] >= target) { rolloffBin = i + 1; break; }
        }
        rolloffSum += rolloffBin * rate / fftSize;
        used += 1;
      }
      if (w % 18 === 0) await yieldToUI();
    }

    return {
      centroid: used ? centroidSum / used : 0,
      rolloff: used ? rolloffSum / used : 0,
      vocalBandPct: usefulEnergy ? 100 * vocalEnergy / usefulEnergy : 0,
      key: estimateKey(chroma)
    };
  }

  function drawEnergy(timeline) {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(300, canvas.clientWidth || 700);
    const height = 118;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    ctx.fillRect(0, 0, width, height);
    if (!timeline.length) return;

    const bins = 120;
    const grouped = [];
    for (let b = 0; b < bins; b += 1) {
      const start = Math.floor((b / bins) * timeline.length);
      const end = Math.max(start + 1, Math.floor(((b + 1) / bins) * timeline.length));
      let max = 0;
      for (let i = start; i < end && i < timeline.length; i += 1) max = Math.max(max, timeline[i]);
      grouped.push(max);
    }
    const peak = Math.max(...grouped, 1e-6);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#6fe4ff");
    gradient.addColorStop(0.52, "#ad7cff");
    gradient.addColorStop(1, "#ff6fbd");
    ctx.fillStyle = gradient;
    const gap = 2;
    const barWidth = width / grouped.length;
    grouped.forEach((value, i) => {
      const normalized = Math.sqrt(value / peak);
      const h = Math.max(2, normalized * (height - 20));
      ctx.fillRect(i * barWidth, (height - h) / 2, Math.max(1, barWidth - gap), h);
    });
  }

  function readinessScore(metrics) {
    let score = 100;
    const notes = [];
    if (metrics.basic.clippedPct > 0.05) { score -= 22; notes.push("noticeable clipping"); }
    else if (metrics.basic.clippedPct > 0.005) { score -= 8; notes.push("minor clipping"); }
    if (db(metrics.basic.rms) < -24) { score -= 12; notes.push("quiet source"); }
    if (metrics.dynamics.rangeDb < 5) { score -= 10; notes.push("heavily compressed"); }
    if (metrics.basic.peak < 0.08) { score -= 12; notes.push("very low peak level"); }
    if (metrics.basic.correlation < -0.2) { score -= 12; notes.push("phase-sensitive stereo"); }
    score = clamp(Math.round(score), 0, 100);
    const label = score >= 88 ? "Excellent source" : score >= 72 ? "Good source" : score >= 55 ? "Usable source" : "Needs attention";
    return { score, label, notes };
  }

  function metricCard(label, value, detail) {
    return `<article class="analysis-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
  }

  function renderResults(metrics) {
    const stereoWidth = metrics.channels < 2 ? "Mono" : `${Math.round((1 - metrics.basic.correlation) * 50)}%`;
    const tempoConfidence = `${Math.round(metrics.tempo.confidence)}% confidence`;
    const keyConfidence = `${Math.round(metrics.spectral.key.confidence)}% confidence`;
    resultGrid.innerHTML = [
      metricCard("Tempo", metrics.tempo.bpm ? `${metrics.tempo.bpm} BPM` : "Unknown", tempoConfidence),
      metricCard("Key", metrics.spectral.key.label, keyConfidence),
      metricCard("RMS loudness", `${db(metrics.basic.rms).toFixed(1)} dBFS`, `sample peak ${db(metrics.basic.peak).toFixed(1)} dBFS`),
      metricCard("Dynamic range", `${metrics.dynamics.rangeDb.toFixed(1)} dB`, "active 400 ms blocks"),
      metricCard("Stereo width", stereoWidth, metrics.channels < 2 ? "single channel" : `L/R corr ${metrics.basic.correlation.toFixed(2)}`),
      metricCard("Brightness", `${Math.round(metrics.spectral.centroid)} Hz`, `85% rolloff ${Math.round(metrics.spectral.rolloff)} Hz`),
      metricCard("Vocal-band energy", `${metrics.spectral.vocalBandPct.toFixed(0)}%`, "120 Hz–4 kHz share"),
      metricCard("Clipping", `${metrics.basic.clippedPct.toFixed(3)}%`, `DC ${metrics.basic.dc.toFixed(4)}`)
    ].join("");

    const ready = readinessScore(metrics);
    readiness.innerHTML = `<strong>${ready.score}/100 · ${ready.label}</strong><span>${ready.notes.length ? ready.notes.join(" · ") : "No obvious source-quality warnings detected."}</span>`;
    drawEnergy(metrics.dynamics.energyTimeline);
  }

  async function analyze() {
    const file = songFile?.files?.[0];
    if (!file) {
      analyzeStatus.textContent = "Load a song first.";
      return;
    }
    if (!AudioCtx) {
      analyzeStatus.textContent = "Web Audio decoding is unavailable in this browser.";
      return;
    }

    analyzeButton.disabled = true;
    analyzeStatus.textContent = "Decoding full song…";
    resultGrid.innerHTML = "";
    readiness.textContent = "";
    track("karaoke-analyzer-start");

    let context;
    try {
      context = new AudioCtx({ sampleRate: 48000 });
      const bytes = await file.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      analyzeStatus.textContent = "Scanning levels, dynamics and stereo field…";
      const basic = basicMetrics(buffer);
      const { mono, rate } = buildMono(buffer);
      const dynamics = blockDynamics(mono, rate);
      await yieldToUI();

      analyzeStatus.textContent = "Detecting tempo, harmonic center and spectral profile…";
      const tempo = estimateTempo(mono, rate);
      await yieldToUI();
      const spectral = await spectralMetrics(mono, rate);

      lastAnalysis = {
        fileName: file.name,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        basic,
        dynamics,
        tempo,
        spectral
      };
      renderResults(lastAnalysis);
      analyzeStatus.textContent = `Deep scan complete · ${formatDuration(buffer.duration)} · ${(buffer.sampleRate / 1000).toFixed(1)} kHz · ${buffer.numberOfChannels === 1 ? "mono" : `${buffer.numberOfChannels} channels`}`;
      track("karaoke-analyzer-complete");
      window.dispatchEvent(new CustomEvent("karaoke:analysis", { detail: lastAnalysis }));
    } catch (error) {
      console.error("Karaoke analyzer failed", error);
      analyzeStatus.textContent = "Could not decode or analyze this file. Try a different browser-supported audio format.";
      track("karaoke-analyzer-error");
    } finally {
      analyzeButton.disabled = false;
      if (context) context.close().catch(() => {});
    }
  }

  analyzeButton.addEventListener("click", analyze);
  songFile?.addEventListener("change", () => {
    lastAnalysis = null;
    resultGrid.innerHTML = "";
    readiness.textContent = "";
    analyzeStatus.textContent = songFile.files?.[0] ? "Song loaded. Ready for a deep local scan." : "Load a song to analyze it.";
  });
})();