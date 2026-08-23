(() => {
  const data = window.KARAOKE_DATA;
  if (!data) return;

  const zone = data.timezone || "America/Los_Angeles";
  const dayRail = document.getElementById("dayRail");
  const eventList = document.getElementById("eventList");
  const nextList = document.getElementById("nextList");
  const watchList = document.getElementById("watchList");
  const selectedSummary = document.getElementById("selectedSummary");
  const verifiedToggle = document.getElementById("verifiedToggle");
  const todayLabel = document.getElementById("todayLabel");
  const todayAnswer = document.getElementById("todayAnswer");

  let selectedIndex = 0;
  let verifiedOnly = false;

  const pacificToday = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric"
    }).formatToParts(new Date());
    const get = type => Number(parts.find(p => p.type === type)?.value);
    return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  })();

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(pacificToday);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });

  const fmtDay = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  const fmtDayLong = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
  const fmtMonthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const fmtFull = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  function weekday(date) { return date.getUTCDay(); }

  function formatTime(value) {
    if (!value) return "Time TBA";
    const [hRaw, mRaw] = value.split(":").map(Number);
    const suffix = hRaw >= 12 ? "PM" : "AM";
    const h = hRaw % 12 || 12;
    return `${h}${mRaw ? `:${String(mRaw).padStart(2, "0")}` : ""} ${suffix}`;
  }

  function mapsUrl(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  function callUrl(phone) {
    return `tel:+1${phone.replace(/\D/g, "")}`;
  }

  function eventsForDate(date, onlyVerified = verifiedOnly) {
    return data.recurring
      .filter(item => item.day === weekday(date))
      .filter(item => !onlyVerified || item.confidence === "verified")
      .sort((a, b) => {
        if (a.confidence !== b.confidence) return a.confidence === "verified" ? -1 : 1;
        return a.start.localeCompare(b.start);
      });
  }

  function getNextOccurrences(limit = 3, onlyVerified = false) {
    const out = [];
    for (let offset = 0; offset < 15 && out.length < limit; offset++) {
      const date = new Date(pacificToday);
      date.setUTCDate(date.getUTCDate() + offset);
      const items = eventsForDate(date, onlyVerified);
      for (const item of items) {
        out.push({ date, item, offset });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function renderDayRail() {
    dayRail.innerHTML = dates.map((date, index) => {
      const count = eventsForDate(date).length;
      return `<button class="day-btn ${index === selectedIndex ? "active" : ""}" type="button" role="tab" aria-selected="${index === selectedIndex}" data-index="${index}" data-umami-event="karaoke-select-day">
        <strong>${index === 0 ? "Tonight" : fmtDay.format(date)}</strong>
        <span>${date.getUTCDate()}</span>
        <small>${count ? `${count} lead${count === 1 ? "" : "s"}` : "quiet"}</small>
      </button>`;
    }).join("");

    dayRail.querySelectorAll(".day-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedIndex = Number(btn.dataset.index);
        renderDayRail();
        renderSelectedDay();
      });
    });
  }

  function eventCard(item) {
    const smoking = item.indoorSmoking === "yes"
      ? "Indoor smoking"
      : item.indoorSmoking === "reported"
        ? "Smoking reported"
        : "Smoking unknown";
    const safeId = item.id.replace(/[^a-z0-9-]/gi, "");

    return `<article class="event-card" id="card-${safeId}">
      <div class="event-time"><strong>${formatTime(item.start)}</strong><span>until ${formatTime(item.end)}</span></div>
      <div class="event-main">
        <div class="confidence ${item.confidence}">${item.confidenceLabel}</div>
        <h3>${item.venue}</h3>
        <div class="meta">${item.area} · ${item.address}</div>
        <div class="tags">${[...item.tags, smoking].map(t => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
      <div class="event-side">
        <a class="icon-btn" href="${mapsUrl(item.address)}" target="_blank" rel="noopener" aria-label="Map ${item.venue}" data-umami-event="karaoke-open-map">↗</a>
        <button class="icon-btn details-btn" type="button" aria-label="More details for ${item.venue}" aria-expanded="false" data-card="card-${safeId}">＋</button>
      </div>
      <div class="details">
        <div>
          <p>${item.notes}</p>
          <p style="margin-top:8px"><strong style="color:#eee7f5">Practical:</strong> ${item.age} · ${item.food}</p>
        </div>
        <div class="detail-links">
          <a href="${callUrl(item.phone)}" data-umami-event="karaoke-call-venue">Call</a>
          <a href="${item.sourceUrl}" target="_blank" rel="noopener" data-umami-event="karaoke-open-source">Source ↗</a>
        </div>
      </div>
    </article>`;
  }

  function bindDetails() {
    document.querySelectorAll(".details-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const card = document.getElementById(btn.dataset.card);
        const open = card.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
        btn.textContent = open ? "−" : "＋";
      });
    });
  }

  function renderSelectedDay() {
    const date = dates[selectedIndex];
    const all = data.recurring.filter(item => item.day === weekday(date));
    const visible = eventsForDate(date);
    const confirmed = all.filter(item => item.confidence === "verified").length;
    const reported = all.length - confirmed;

    selectedSummary.innerHTML = `<strong>${fmtFull.format(date)}</strong> · ${confirmed} verified${reported ? ` · ${reported} reported lead${reported === 1 ? "" : "s"}` : ""}${verifiedOnly ? " · showing verified only" : ""}`;

    if (!visible.length) {
      const next = getNextOccurrences(1, verifiedOnly)[0];
      eventList.innerHTML = `<div class="empty-state"><strong>No ${verifiedOnly ? "verified " : ""}karaoke found for this night yet.</strong><p>${next ? `Next ${verifiedOnly ? "verified " : ""}lead: ${next.item.venue}, ${fmtDayLong.format(next.date)} at ${formatTime(next.item.start)}.` : "We have no dependable recurring lead in the current data."} Schedules move around, so this is intentionally conservative.</p></div>`;
    } else {
      eventList.innerHTML = visible.map(eventCard).join("");
      bindDetails();
    }
  }

  function renderStatus() {
    const todayEvents = eventsForDate(pacificToday, false);
    const confirmed = todayEvents.filter(e => e.confidence === "verified");
    const nextVerified = getNextOccurrences(1, true)[0];
    todayLabel.textContent = fmtFull.format(pacificToday);

    if (confirmed.length) {
      todayAnswer.innerHTML = `<b>${confirmed.length === 1 ? confirmed[0].venue : `${confirmed.length} verified karaoke nights`}</b> ${confirmed.length === 1 ? `starts at ${formatTime(confirmed[0].start)}.` : "are on the board tonight."}`;
    } else if (todayEvents.length) {
      todayAnswer.innerHTML = `<b>${todayEvents.length} reported lead${todayEvents.length === 1 ? "" : "s"} tonight</b>, but none meet our verified threshold yet. Check before you go.`;
    } else if (nextVerified) {
      const when = nextVerified.offset === 1 ? "tomorrow" : fmtDayLong.format(nextVerified.date);
      todayAnswer.innerHTML = `Nothing verified tonight. <b>Next strong lead: ${nextVerified.item.venue} ${when} at ${formatTime(nextVerified.item.start)}.</b>`;
    } else {
      todayAnswer.textContent = "Nothing verified in the current recurring schedule.";
    }
  }

  function renderNext() {
    const items = getNextOccurrences(3, true);
    nextList.innerHTML = items.map(({ date, item, offset }) => `<article class="mini-card">
      <div class="when">${offset === 0 ? "Tonight" : offset === 1 ? "Tomorrow" : fmtDayLong.format(date)} · ${formatTime(item.start)}</div>
      <h3>${item.venue}</h3>
      <p>${item.notes}</p>
      <div class="mini-bottom"><span>${item.area}</span><a href="${item.sourceUrl}" target="_blank" rel="noopener" data-umami-event="karaoke-next-source">Verify ↗</a></div>
    </article>`).join("");
  }

  function renderWatchlist() {
    watchList.innerHTML = data.watchlist.map(item => `<article class="watch-card">
      <div class="watch-label">Event-driven · check calendar</div>
      <h3>${item.venue}</h3>
      <p>${item.reason}</p>
      <div class="mini-bottom"><span>${item.area}</span><a href="${item.sourceUrl}" target="_blank" rel="noopener" data-umami-event="karaoke-watch-source">${item.sourceLabel} ↗</a></div>
    </article>`).join("");
  }

  verifiedToggle.addEventListener("click", () => {
    verifiedOnly = !verifiedOnly;
    verifiedToggle.setAttribute("aria-pressed", String(verifiedOnly));
    renderDayRail();
    renderSelectedDay();
  });

  document.getElementById("jumpTonight").addEventListener("click", () => {
    selectedIndex = 0;
    renderDayRail();
    renderSelectedDay();
    document.getElementById("schedule").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("jumpWeek").addEventListener("click", () => {
    document.getElementById("schedule").scrollIntoView({ behavior: "smooth" });
  });

  renderStatus();
  renderDayRail();
  renderSelectedDay();
  renderNext();
  renderWatchlist();
})();
