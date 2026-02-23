(() => {
  // -----------------------------
  // Theme: AUTO (Europe/Amsterdam) 17:00–00:00 + manual toggle (tijdelijke override)
  // -----------------------------
  const THEME_MODE_KEY = "via_theme_mode";          // "auto" | "manual"
  const THEME_PREF_KEY = "via_theme_pref";          // "light" | "dark" (alleen relevant in manual)
  const THEME_UNTIL_KEY = "via_theme_override_until"; // epoch ms (alleen relevant in manual)

  function getAmsterdamTimeParts() {
    // Betrouwbaar uur/minuut in Europe/Amsterdam, ongeacht device timezone
    const dtf = new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = dtf.formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;

    const hour = Number(map.hour);
    const minute = Number(map.minute);
    return { hour, minute };
  }

  function isAutoDarkAmsterdamNow() {
    const { hour } = getAmsterdamTimeParts();
    // Dark tussen 17:00 en 00:00 → uur 17 t/m 23
    return hour >= 17;
  }

  function minutesUntilNextBoundaryAmsterdam() {
    // Volgende grens is óf 17:00 óf 00:00 (middernacht) in Amsterdam
    const { hour, minute } = getAmsterdamTimeParts();

    // Als we in dark-window zitten (>=17), volgende switch is 00:00
    if (hour >= 17) {
      const minsLeft = (24 - hour) * 60 - minute; // tot 24:00
      return Math.max(1, minsLeft);
    }

    // Anders: volgende switch is 17:00
    const minsLeft = (17 - hour) * 60 - minute;
    return Math.max(1, minsLeft);
  }

  function setTheme(theme) {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);

    const btn = document.getElementById("themeToggle");
    if (btn) {
      const icon = btn.querySelector(".icon-btn__icon");
      const text = btn.querySelector(".icon-btn__text");
      if (theme === "dark") {
        if (icon) icon.textContent = "☀️";
        if (text) text.textContent = "Licht";
        btn.setAttribute("aria-label", "Wissel naar lichte modus");
      } else {
        if (icon) icon.textContent = "🌙";
        if (text) text.textContent = "Donker";
        btn.setAttribute("aria-label", "Wissel naar donkere modus");
      }
    }
  }

  function clearManualOverride() {
    localStorage.removeItem(THEME_MODE_KEY);
    localStorage.removeItem(THEME_PREF_KEY);
    localStorage.removeItem(THEME_UNTIL_KEY);
  }

  function getThemeMode() {
    const m = localStorage.getItem(THEME_MODE_KEY);
    return m === "manual" ? "manual" : "auto";
  }

  function applyAutoTheme() {
    setTheme(isAutoDarkAmsterdamNow() ? "dark" : "light");
  }

  function initTheme() {
    const mode = getThemeMode();

    if (mode === "manual") {
      const untilRaw = localStorage.getItem(THEME_UNTIL_KEY);
      const until = untilRaw ? Number(untilRaw) : NaN;

      // Als manual verlopen is → terug naar auto
      if (!Number.isFinite(until) || Date.now() >= until) {
        clearManualOverride();
        applyAutoTheme();
        return;
      }

      const pref = localStorage.getItem(THEME_PREF_KEY);
      if (pref === "light" || pref === "dark") {
        setTheme(pref);
        return;
      }

      // manual zonder pref → terug naar auto
      clearManualOverride();
      applyAutoTheme();
      return;
    }

    // default: auto
    applyAutoTheme();
  }

  function bindThemeToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      // Toggle tussen licht/donker, maar als tijdelijke override tot volgende boundary.
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";

      const mins = minutesUntilNextBoundaryAmsterdam();
      const until = Date.now() + mins * 60 * 1000;

      localStorage.setItem(THEME_MODE_KEY, "manual");
      localStorage.setItem(THEME_PREF_KEY, next);
      localStorage.setItem(THEME_UNTIL_KEY, String(until));

      setTheme(next);
    });
  }

  function scheduleAutoThemeChecks() {
    // 1) Elke minuut: als auto, pas toe (ook als tijdzone/DST verandert)
    setInterval(() => {
      const mode = getThemeMode();
      if (mode !== "auto") {
        // Manual kan verlopen; check dat ook zonder reload
        const untilRaw = localStorage.getItem(THEME_UNTIL_KEY);
        const until = untilRaw ? Number(untilRaw) : NaN;
        if (Number.isFinite(until) && Date.now() >= until) {
          clearManualOverride();
          applyAutoTheme();
        }
        return;
      }
      applyAutoTheme();
    }, 60_000);
  }

  // -----------------------------
  // App state + snackbar
  // -----------------------------
  let apiKey = null;
  let jobId = null;
  let lastSelectedFilename = null;

  let snackTimer = null;

  const el = {
    apiKey: document.getElementById("apiKey"),
    apiKeyError: document.getElementById("apiKeyError"),
    fileInput: document.getElementById("fileInput"),
    btnUpload: document.getElementById("btnUpload"),
    btnProcess: document.getElementById("btnProcess"),
    btnDownload: document.getElementById("btnDownload"),
    fileMeta: document.getElementById("fileMeta"),
    signalsList: document.getElementById("signalsList"),
    snackbar: document.getElementById("snackbar"),
    techHelp: document.getElementById("techHelp"),
  };

  function clearSnackTimer() {
    if (snackTimer) {
      clearTimeout(snackTimer);
      snackTimer = null;
    }
  }

  function setSnackbar(isOpen, { text, variant, autoHideMs } = {}) {
    clearSnackTimer();

    if (typeof text === "string") {
      el.snackbar.textContent = text;
    }

    el.snackbar.classList.remove("snackbar--progress", "snackbar--success");
    if (variant === "progress") el.snackbar.classList.add("snackbar--progress");
    if (variant === "success") el.snackbar.classList.add("snackbar--success");

    el.snackbar.setAttribute("aria-hidden", isOpen ? "false" : "true");
    el.snackbar.style.display = isOpen ? "block" : "none";

    if (isOpen && typeof autoHideMs === "number" && autoHideMs > 0) {
      snackTimer = setTimeout(() => setSnackbar(false), autoHideMs);
    }
  }

  function setSignals(signals, showTechHelp) {
    el.signalsList.innerHTML = "";
    (signals || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.code}: ${s.message}`;
      el.signalsList.appendChild(li);
    });
    el.techHelp.hidden = !showTechHelp;
  }

  function requireKeyOrShowError() {
    if (!apiKey) {
      el.apiKeyError.textContent = "API-key is vereist om verder te gaan.";
      return false;
    }
    el.apiKeyError.textContent = "";
    return true;
  }

  function setState(state) {
    const hasKey = !!apiKey;
    const hasJob = !!jobId;

    if (state === "init") {
      el.btnUpload.disabled = !hasKey;
      el.btnProcess.disabled = true;
      el.btnDownload.disabled = true;
      setSnackbar(false);
      return;
    }
    if (state === "keyReady") {
      el.btnUpload.disabled = false;
      el.btnProcess.disabled = true;
      el.btnDownload.disabled = true;
      setSnackbar(false);
      return;
    }
    if (state === "fileReady") {
      el.btnUpload.disabled = false;
      el.btnProcess.disabled = false;
      el.btnDownload.disabled = true;
      setSnackbar(false);
      return;
    }
    if (state === "processing") {
      el.btnUpload.disabled = true;
      el.btnProcess.disabled = true;
      el.btnDownload.disabled = true;
      setSnackbar(true, {
        text: "Bezig... een ogenblik geduld",
        variant: "progress",
      });
      return;
    }
    if (state === "done") {
      el.btnUpload.disabled = false;
      el.btnProcess.disabled = false;
      el.btnDownload.disabled = !hasJob;
      setSnackbar(true, {
        text: "Klaar om te downloaden!",
        variant: "success",
        autoHideMs: 3000,
      });
      return;
    }
    if (state === "error") {
      el.btnUpload.disabled = false;
      el.btnProcess.disabled = false;
      el.btnDownload.disabled = true;
      setSnackbar(false);
    }
  }

  async function postForm(url, formData, extraHeaders = {}) {
    const res = await fetch(url, { method: "POST", body: formData, headers: extraHeaders });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  }

  async function postJson(url, body, extraHeaders = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  }

  function buildFallbackOutputName(selectedFilename) {
    const defaultName = "document_bewerkt.txt";
    if (!selectedFilename) return defaultName;

    const justName = String(selectedFilename).split(/[\\/]/).pop() || "";
    const base = justName.replace(/\.[^.]+$/, "") || "document";
    return `${base}_bewerkt.txt`;
  }

  function parseContentDispositionFilename(dispo) {
    const d = String(dispo || "");
    const mStar = d.match(/filename\*\s*=\s*UTF-8''([^;\n]+)/i);
    if (mStar && mStar[1]) {
      try {
        return decodeURIComponent(mStar[1].trim().replace(/"/g, ""));
      } catch (_) {
        return mStar[1].trim().replace(/"/g, "");
      }
    }
    const m = d.match(/filename\s*=\s*"([^"]+)"/i) || d.match(/filename\s*=\s*([^;\n]+)/i);
    if (m && m[1]) return m[1].trim().replace(/"/g, "");
    return null;
  }

  // -----------------------------
  // Events
  // -----------------------------
  el.apiKey.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const val = (el.apiKey.value || "").trim();
    apiKey = val.length ? val : null;
    if (!apiKey) {
      el.apiKeyError.textContent = "API-key is vereist om verder te gaan.";
      setState("init");
      return;
    }
    el.apiKeyError.textContent = "";
    setState("keyReady");
  });

  el.btnUpload.addEventListener("click", () => {
    if (!requireKeyOrShowError()) return;
    el.fileInput.click();
  });

  el.fileInput.addEventListener("change", async () => {
    if (!requireKeyOrShowError()) return;
    const f = el.fileInput.files && el.fileInput.files[0];
    if (!f) return;

    lastSelectedFilename = f.name;

    el.fileMeta.textContent = `Gekozen bestand: ${f.name} (${Math.round(f.size / 1024)} KB)`;
    setSignals([], false);

    const form = new FormData();
    form.append("file", f);

    setState("processing");
    const { ok, json } = await postForm("/api/upload", form, { "X-API-Key": apiKey });

    if (!ok || !json) {
      setSignals([{ code: "W010", message: "Technisch probleem tijdens upload. Probeer een ander bestand of herlaad de pagina." }], true);
      setState("error");
      return;
    }

    if (json.status === "error") {
      setSignals(json.signals || [], json.techHelp === true);
      if (json.auditLogUrl) window.location.href = json.auditLogUrl;
      setState("error");
      return;
    }

    jobId = json.jobId;
    setState("fileReady");
  });

  el.btnProcess.addEventListener("click", async () => {
    if (!requireKeyOrShowError()) return;
    if (!jobId) return;

    setState("processing");
    const { ok, json } = await postJson("/api/process", { jobId }, { "X-API-Key": apiKey });

    if (!ok || !json) {
      setSignals([{ code: "W010", message: "Technisch probleem tijdens verwerking. Herlaad de pagina (Ctrl+F5) en probeer het opnieuw." }], true);
      setState("error");
      return;
    }

    if (json.status === "error") {
      setSignals(json.signals || [], json.techHelp === true);
      if (json.auditLogUrl) window.location.href = json.auditLogUrl;
      setState("error");
      return;
    }

    setSignals(json.signals || [], false);
    setState("done");
  });

  el.btnDownload.addEventListener("click", async () => {
    if (!requireKeyOrShowError()) return;
    if (!jobId) return;

    setState("processing");
    try {
      const res = await fetch(`/api/download?jobId=${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { "X-API-Key": apiKey },
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (ct.includes("application/json")) {
        const json = await res.json().catch(() => null);
        if (!json) {
          setSignals([{ code: "W010", message: "Technisch probleem tijdens download. Probeer opnieuw." }], true);
          setState("error");
          return;
        }
        if (json.status === "error") {
          setSignals(json.signals || [], json.techHelp === true);
          if (json.auditLogUrl) window.location.href = json.auditLogUrl;
          setState("error");
          return;
        }
      }

      if (!res.ok) {
        setSignals([{ code: "W010", message: "Technisch probleem tijdens download. Probeer opnieuw." }], true);
        setState("error");
        return;
      }

      const blob = await res.blob();

      const dispo = res.headers.get("content-disposition") || "";
      const fromHeader = parseContentDispositionFilename(dispo);
      const filename = fromHeader || buildFallbackOutputName(lastSelectedFilename);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setState("done");
    } catch (_) {
      setSignals([{ code: "W010", message: "Technisch probleem tijdens download. Probeer opnieuw." }], true);
      setState("error");
    }
  });

  // -----------------------------
  // Init
  // -----------------------------
  initTheme();
  bindThemeToggle();
  scheduleAutoThemeChecks();

  // Hard reset snackbar on load
  setSnackbar(false);
  setState("init");
})();
