(function () {
  const reportState = { latest: null };

  function elements() {
    return {
      copy: document.getElementById("copyReportButton"),
      details: document.getElementById("fullTestReportDetails"),
      download: document.getElementById("downloadReportButton"),
      panel: document.getElementById("fullTestReportPanel"),
      status: document.getElementById("fullTestReportStatus"),
      summary: document.getElementById("fullTestReportSummary"),
      text: document.getElementById("fullTestReportText")
    };
  }

  function initialize() {
    const ui = elements();
    ui.copy?.addEventListener("click", copyReport);
    ui.download?.addEventListener("click", downloadReport);
  }

  async function run(context) {
    const { d, elements: form, methods, state } = context;
    const session = createSession(d, form);
    renderRunning(session);
    state.fullTestCancel = false;
    methods.resetCounters();

    try {
      session.negotiate = await methods.testNegotiate();
      session.connection = await methods.connect();
      session.echo = await methods.sendMessage();

      methods.log(`Full test started for ${session.config.durationSeconds} seconds.`);
      session.pings.push(await methods.invokePing());

      const endAt = Date.now() + session.config.durationSeconds * 1000;
      while (!state.fullTestCancel && Date.now() < endAt) {
        await delay(session.config.pingIntervalSeconds * 1000);
        if (!state.fullTestCancel && Date.now() < endAt) {
          session.pings.push(await methods.invokePing());
        }
      }

      session.cancelled = state.fullTestCancel;
      methods.log(session.cancelled ? "Full test cancelled." : "Full test completed.");
    } catch (error) {
      session.errors.push(error?.message || String(error));
      methods.recordError(error);
    } finally {
      session.endedAt = new Date();
      session.counters = {
        lastError: state.lastError,
        received: state.received,
        sent: state.sent
      };

      try {
        if (state.connection) {
          await methods.disconnect(true, false);
        }
      } catch (error) {
        session.errors.push(`Disconnect failed: ${error?.message || String(error)}`);
      }

      renderComplete(session);
    }
  }

  function createSession(d, form) {
    return {
      cancelled: false,
      config: {
        authMode: selectedText(form.authMode),
        baseUrl: form.baseUrl.value,
        durationSeconds: d.numberValue(form.durationSeconds, 60),
        hubPath: form.hubPath.value,
        pingIntervalSeconds: d.numberValue(form.pingIntervalSeconds, 5),
        testMessage: form.testMessage.value,
        transportMode: selectedText(form.transportMode)
      },
      counters: { lastError: "-", received: 0, sent: 0 },
      echo: null,
      endedAt: null,
      errors: [],
      id: crypto.randomUUID(),
      negotiate: null,
      connection: null,
      pings: [],
      startedAt: new Date()
    };
  }

  function renderRunning(session) {
    const ui = elements();
    if (!ui.panel) {
      return;
    }

    ui.panel.hidden = false;
    ui.status.textContent = "Running";
    ui.summary.textContent = `Full test started at ${session.startedAt.toLocaleString()}.`;
    ui.details.innerHTML = "";
    ui.text.textContent = "Report will be available when the full test finishes.";
  }

  function renderComplete(session) {
    const ui = elements();
    const report = buildReport(session);
    reportState.latest = report;

    if (!ui.panel) {
      return;
    }

    ui.panel.hidden = false;
    ui.status.textContent = report.status;
    ui.summary.textContent = report.summary;
    ui.details.innerHTML = report.items.map(renderItem).join("");
    ui.text.textContent = report.text;
  }

  function buildReport(session) {
    const pingStats = summarizePings(session.pings);
    const durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
    const status = statusFor(session, pingStats);
    const summary = `${status}: ${pingStats.count} ping roundtrip(s), ${durationSeconds}s runtime, ${session.errors.length} error(s).`;
    const items = [
      ["Started", session.startedAt.toLocaleString()],
      ["Ended", session.endedAt.toLocaleString()],
      ["Runtime", `${durationSeconds}s`],
      ["Target", `${session.config.baseUrl}${session.config.hubPath}`],
      ["Trace id", traceIds(session)],
      ["Transport", session.config.transportMode],
      ["Auth", session.config.authMode],
      ["Negotiate", session.negotiate?.ok ? `${session.negotiate.status} in ${session.negotiate.durationMs} ms` : errorText(session.negotiate)],
      ["Connection", session.connection?.ok ? session.connection.connectionId : errorText(session.connection)],
      ["Echo", session.echo?.ok ? `${session.echo.durationMs} ms` : errorText(session.echo)],
      ["Pings", `${pingStats.count} ok, avg ${pingStats.averageMs} ms`],
      ["Min / Max ping", `${pingStats.minMs} / ${pingStats.maxMs} ms`],
      ["Messages", `${session.counters.sent} sent, ${session.counters.received} received`],
      ["Last error", session.counters.lastError || "-"],
      ["Cancelled", session.cancelled ? "Yes" : "No"]
    ];

    return {
      generatedAt: new Date().toISOString(),
      id: session.id,
      items,
      json: { durationSeconds, pingStats, session, status },
      status,
      summary,
      text: textReport(status, summary, items, session.errors)
    };
  }

  function statusFor(session, pingStats) {
    if (session.errors.length > 0 || session.counters.lastError !== "-") {
      return "Failed";
    }

    if (session.cancelled) {
      return "Cancelled";
    }

    return session.negotiate?.ok && session.connection?.ok && session.echo?.ok && pingStats.count > 0
      ? "Passed"
      : "Warning";
  }

  function traceIds(session) {
    return [
      session.negotiate?.diagnostics?.traceId,
      session.connection?.diagnostics?.traceId
    ].filter(Boolean).join(" / ") || "-";
  }

  function summarizePings(pings) {
    const values = pings.filter((ping) => ping?.ok).map((ping) => ping.durationMs);
    const total = values.reduce((sum, value) => sum + value, 0);

    return {
      averageMs: values.length ? Math.round(total / values.length) : 0,
      count: values.length,
      maxMs: values.length ? Math.max(...values) : 0,
      minMs: values.length ? Math.min(...values) : 0
    };
  }

  function textReport(status, summary, items, errors) {
    const lines = [
      "SignalR Diagnostics Full Test Report",
      `Status: ${status}`,
      summary,
      "",
      ...items.map(([key, value]) => `${key}: ${value}`)
    ];

    if (errors.length > 0) {
      lines.push("", "Errors:", ...errors.map((error) => `- ${error}`));
    }

    return lines.join("\n");
  }

  async function copyReport() {
    if (!reportState.latest) {
      return;
    }

    await navigator.clipboard.writeText(reportState.latest.text);
  }

  function downloadReport() {
    if (!reportState.latest) {
      return;
    }

    const blob = new Blob([JSON.stringify(reportState.latest.json, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `signalr-diagnostics-report-${reportState.latest.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function renderItem([key, value]) {
    return `<div class="report-item"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function errorText(result) {
    return result?.error || "not completed";
  }

  function selectedText(select) {
    return select.options[select.selectedIndex].text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  initialize();
  window.FullTestRunner = { run };
})();
