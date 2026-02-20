(() => {
  let apiKey = null;
  let jobId = null;

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

  function setSnackbar(isOpen) {
    el.snackbar.setAttribute("aria-hidden", isOpen ? "false" : "true");
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
      setSnackbar(true);
      return;
    }
    if (state === "done") {
      el.btnUpload.disabled = false;
      el.btnProcess.disabled = false;
      el.btnDownload.disabled = !hasJob;
      setSnackbar(false);
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

    // Download via fetch zodat we de API-key header kunnen meesturen.
    setState("processing");
    try {
      const res = await fetch(`/api/download?jobId=${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { "X-API-Key": apiKey },
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      // Als de backend JSON terugstuurt, is het een foutmelding.
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

      // Probeer bestandsnaam uit Content-Disposition te halen.
      let filename = "persbericht.docx";
      const dispo = res.headers.get("content-disposition") || "";
      const match = dispo.match(/filename\*?=(?:UTF-8''|\")?([^;
\"]+)/i);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]).replace(/"/g, "");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setState("done");
    } catch (e) {
      setSignals([{ code: "W010", message: "Technisch probleem tijdens download. Probeer opnieuw." }], true);
      setState("error");
    }
  });

  setState("init");
})();
