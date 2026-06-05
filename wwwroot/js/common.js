(function () {
  const pad = (value) => String(value).padStart(2, "0");

  function formatTime(value) {
    if (!value) {
      return "-";
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return `${date.toLocaleDateString()} ${formatTime(date)}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${pad(minutes)}:${pad(secs)}`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value ?? "-";
    }
  }

  function appendLog(element, message, state) {
    if (!element) {
      return;
    }

    state.count += 1;
    const line = `[${formatTime(new Date())}] ${message}`;
    element.textContent += element.textContent ? `\n${line}` : line;
    element.scrollTop = element.scrollHeight;
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function formatHeaders(headers) {
    const lines = [];
    headers.forEach((value, key) => lines.push(`${key}: ${value}`));
    return lines.join("\n");
  }

  function numberValue(element, fallback) {
    const value = Number(element.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function buildHubUrl(baseUrl, hubPath) {
    const base = baseUrl.trim() || window.location.origin;
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const normalizedPath = (hubPath.trim() || "/testHub").replace(/^\/+/, "");
    return new URL(normalizedPath, normalizedBase);
  }

  function setBusy(button, busy) {
    if (!button) {
      return;
    }

    button.classList.toggle("is-loading", busy);
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  }

  function getClientId(prefix) {
    const key = `signalr-diagnostics-${prefix}-id`;
    let id = window.localStorage.getItem(key);

    if (!id) {
      id = `${prefix}-${crypto.randomUUID()}`;
      window.localStorage.setItem(key, id);
    }

    return id;
  }

  function statusClass(status) {
    return `status-${String(status || "unknown").toLowerCase()}`;
  }

  window.Diagnostics = {
    appendLog,
    buildHubUrl,
    formatHeaders,
    formatDateTime,
    formatDuration,
    formatTime,
    getClientId,
    numberValue,
    safeJson,
    setBusy,
    setText,
    statusClass
  };
})();
