(function () {
  const stateValue = document.getElementById("stateValue");
  const lastErrorValue = document.getElementById("lastErrorValue");
  const busyLabel = document.getElementById("busyLabel");
  const reportStatus = document.getElementById("fullTestReportStatus");
  const authToolsPanel = document.querySelector(".auth-tools-panel");
  const authMode = document.getElementById("authMode");
  const authFields = [...document.querySelectorAll("[data-auth-field]")];

  if (authToolsPanel && new URLSearchParams(window.location.search).get("authTools") === "1") {
    authToolsPanel.open = true;
  }

  authMode?.addEventListener("change", updateAuthFields);

  function update() {
    setTone(stateValue?.closest(".metric-card"), connectionTone(stateValue?.textContent));
    setTone(lastErrorValue?.closest(".metric-card"), errorTone(lastErrorValue?.textContent));
    setTone(busyLabel, busyTone(busyLabel?.textContent));
    setTone(reportStatus, reportTone(reportStatus?.textContent));
  }

  function updateAuthFields() {
    const selectedMode = authMode?.value || "none";

    authFields.forEach((field) => {
      const isActive = field.dataset.authField === selectedMode;
      const input = field.querySelector("input");
      field.hidden = !isActive;
      if (input) {
        input.disabled = !isActive;
      }
    });
  }

  function connectionTone(value) {
    const text = normalize(value);

    if (text === "connected") {
      return "is-good";
    }

    if (text === "connecting" || text === "reconnecting") {
      return "is-warning";
    }

    return "is-idle";
  }

  function errorTone(value) {
    const text = normalize(value);
    return text && text !== "-" ? "is-bad" : "is-good";
  }

  function busyTone(value) {
    return normalize(value) === "running" ? "is-warning" : "";
  }

  function reportTone(value) {
    const text = normalize(value);

    if (text === "passed") {
      return "is-good";
    }

    if (text === "failed") {
      return "is-bad";
    }

    if (text === "warning" || text === "cancelled" || text === "running") {
      return "is-warning";
    }

    return "";
  }

  function setTone(element, tone) {
    if (!element) {
      return;
    }

    element.classList.remove("is-good", "is-warning", "is-bad", "is-idle");
    if (tone) {
      element.classList.add(tone);
    }
  }

  function normalize(value) {
    return (value || "").trim().toLowerCase();
  }

  const observer = new MutationObserver(update);
  [stateValue, lastErrorValue, busyLabel, reportStatus]
    .filter(Boolean)
    .forEach((element) => observer.observe(element, { childList: true, subtree: true }));

  update();
  updateAuthFields();
})();
