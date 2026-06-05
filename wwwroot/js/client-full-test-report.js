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

  function renderRunning(session) {
    const ui = elements();
    if (!ui.panel) {
      return;
    }

    const completed = session.scenarios.filter((scenario) => scenario.status !== "Pending").length;
    ui.panel.hidden = false;
    ui.status.textContent = "Running";
    ui.summary.textContent = `Matrix test running: ${completed}/${session.scenarios.length} scenarios completed.`;
    ui.details.innerHTML = renderScenarioTable(session.scenarios);
    ui.text.textContent = "Report will be available when the matrix test finishes.";
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
    ui.details.innerHTML = report.items.map(renderItem).join("") + renderScenarioTable(session.scenarios);
    ui.text.textContent = report.text;
  }

  function buildReport(session) {
    const durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
    const totals = summarizeStatuses(session.scenarios);
    const status = statusForSession(session, totals);
    const summary = `${status}: ${totals.passed}/${session.scenarios.length} scenarios passed, ${totals.failed} failed, ${durationSeconds}s runtime.`;
    const items = [
      ["Started", session.startedAt.toLocaleString()],
      ["Ended", session.endedAt.toLocaleString()],
      ["Runtime", `${durationSeconds}s`],
      ["Target", `${session.config.baseUrl}${session.config.hubPath}`],
      ["Scenarios", `${session.scenarios.length} total`],
      ["Passed", totals.passed],
      ["Failed", totals.failed],
      ["Warnings", totals.warning],
      ["Per scenario hold", `${session.scenarios[0]?.holdSeconds || 0}s`],
      ["Ping interval", `${session.config.pingIntervalSeconds}s`],
      ["Messages", `${session.counters.sent} sent, ${session.counters.received} received`],
      ["Cancelled", session.cancelled ? "Yes" : "No"]
    ];

    return {
      generatedAt: new Date().toISOString(),
      id: session.id,
      items,
      json: { durationSeconds, session, status, totals },
      status,
      summary,
      text: textReport(status, summary, items, session)
    };
  }

  function statusForSession(session, totals) {
    if (session.cancelled) {
      return "Cancelled";
    }

    if (session.errors.length > 0 || totals.failed > 0) {
      return "Failed";
    }

    return totals.warning > 0 ? "Warning" : "Passed";
  }

  function summarizeStatuses(scenarios) {
    return scenarios.reduce((totals, scenario) => {
      totals[scenario.status.toLowerCase()] = (totals[scenario.status.toLowerCase()] || 0) + 1;
      return totals;
    }, { cancelled: 0, failed: 0, passed: 0, pending: 0, warning: 0 });
  }

  function summarizeCounters(scenarios) {
    return scenarios.reduce((total, scenario) => ({
      received: total.received + (scenario.counters?.received || 0),
      sent: total.sent + (scenario.counters?.sent || 0)
    }), { received: 0, sent: 0 });
  }

  function summarizePings(pings) {
    const values = pings.filter((ping) => ping?.ok).map((ping) => ping.durationMs);
    const total = values.reduce((sum, value) => sum + value, 0);
    return { averageMs: values.length ? Math.round(total / values.length) : 0, count: values.length };
  }

  function renderScenarioTable(scenarios) {
    const rows = scenarios.map((scenario) => {
      const pings = summarizePings(scenario.pings);
      return `<tr>
        <td>${escapeHtml(scenario.transportLabel)} / ${escapeHtml(scenario.authLabel)}</td>
        <td>${stepText(scenario.negotiate, (item) => `${item.status} ${item.durationMs}ms`)}</td>
        <td>${stepText(scenario.connection, (item) => item.connectionId || "connected")}</td>
        <td>${stepText(scenario.echo, (item) => `${item.durationMs}ms`)}</td>
        <td>${pings.count} ok / avg ${pings.averageMs}ms</td>
        <td><strong class="${statusClass(scenario.status)}">${escapeHtml(scenario.status)}</strong></td>
      </tr>`;
    }).join("");

    return `<div class="table-wrap scenario-table"><table>
      <thead><tr><th>Scenario</th><th>Negotiate</th><th>Connect</th><th>Echo</th><th>Ping</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function textReport(status, summary, items, session) {
    const lines = [
      "SignalR Diagnostics Full Matrix Test Report",
      `Status: ${status}`,
      summary,
      "",
      ...items.map(([key, value]) => `${key}: ${value}`),
      "",
      "Scenarios:"
    ];

    session.scenarios.forEach((scenario) => {
      const pings = summarizePings(scenario.pings);
      lines.push(`- ${scenario.transportLabel} / ${scenario.authLabel}: ${scenario.status}; negotiate=${stepTextPlain(scenario.negotiate)}; connect=${stepTextPlain(scenario.connection)}; echo=${stepTextPlain(scenario.echo)}; pings=${pings.count} avg ${pings.averageMs}ms`);
      scenario.errors.forEach((error) => lines.push(`  error: ${error}`));
      scenario.warnings.forEach((warning) => lines.push(`  warning: ${warning}`));
    });

    if (session.errors.length > 0) {
      lines.push("", "Session errors:", ...session.errors.map((error) => `- ${error}`));
    }

    return lines.join("\n");
  }

  async function copyReport() {
    if (reportState.latest) {
      await navigator.clipboard.writeText(reportState.latest.text);
    }
  }

  function downloadReport() {
    if (!reportState.latest) {
      return;
    }

    const blob = new Blob([JSON.stringify(reportState.latest.json, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `signalr-diagnostics-matrix-report-${reportState.latest.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function renderItem([key, value]) {
    return `<div class="report-item"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function stepText(result, formatter) {
    if (!result) {
      return "-";
    }

    return result.ok ? escapeHtml(formatter(result)) : escapeHtml(result.error || "failed");
  }

  function stepTextPlain(result) {
    if (!result) {
      return "-";
    }

    return result.ok ? "ok" : result.error || "failed";
  }

  function statusClass(status) {
    return `status-${String(status || "").toLowerCase()}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  initialize();
  window.FullTestReport = { renderComplete, renderRunning, summarizeCounters, summarizePings };
})();
