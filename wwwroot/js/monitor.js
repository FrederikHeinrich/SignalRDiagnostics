(function () {
  const d = window.Diagnostics;
  const elements = {
    clearLog: document.getElementById("clearMonitorLog"),
    clientsTable: document.getElementById("clientsTable"),
    log: document.getElementById("monitorLog"),
    state: document.getElementById("monitorState")
  };

  const state = { log: { count: 0 } };
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(d.buildHubUrl(d.defaultBaseUrl(), "/testHub").href)
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  elements.clearLog.addEventListener("click", () => {
    elements.log.textContent = "";
    state.log.count = 0;
  });

  connection.on("MonitorUpdate", renderSnapshot);
  connection.on("ServerEvent", (event) => {
    log(`${event.eventType.toUpperCase()} ${event.clientId}: ${event.message}`);
  });

  connection.onreconnecting((error) => {
    elements.state.textContent = "Reconnecting";
    log(`Monitor reconnecting: ${error?.message || "connection lost"}`);
  });

  connection.onreconnected(async () => {
    elements.state.textContent = "Connected";
    await registerMonitor();
    log("Monitor reconnected.");
  });

  connection.onclose((error) => {
    elements.state.textContent = "Disconnected";
    log(`Monitor disconnected: ${error?.message || "closed"}`);
  });

  start().catch((error) => {
    elements.state.textContent = "Error";
    log(`Monitor start failed: ${error.message || error}`);
  });

  async function start() {
    await connection.start();
    elements.state.textContent = "Connected";
    await registerMonitor();
    log(`Monitor connected. Connection id: ${connection.connectionId || "(not exposed)"}`);
  }

  function registerMonitor() {
    return connection.invoke("RegisterClient", {
      clientId: d.getClientId("monitor"),
      role: "monitor",
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      transportMode: "Auto",
      authMode: "None"
    });
  }

  function renderSnapshot(snapshot) {
    d.setText("currentConnections", snapshot.currentConnections);
    d.setText("totalConnections", snapshot.totalConnections);
    d.setText("totalDisconnects", snapshot.totalDisconnects);
    d.setText("messagesSent", snapshot.messagesSent);
    d.setText("messagesReceived", snapshot.messagesReceived);
    d.setText("averageSessionDuration", `${Math.round(snapshot.averageSessionDurationSeconds)}s`);
    renderClients(snapshot.activeClients || []);
  }

  function renderClients(clients) {
    if (clients.length === 0) {
      elements.clientsTable.innerHTML = '<tr><td colspan="6" class="empty-cell">No active clients</td></tr>';
      return;
    }

    elements.clientsTable.innerHTML = clients.map((client) => {
      const status = escapeHtml(client.status || "unknown");
      const role = client.role && client.role !== "client" ? ` (${escapeHtml(client.role)})` : "";

      return `<tr>
        <td>${escapeHtml(client.clientId)}${role}</td>
        <td>${escapeHtml(client.connectionId)}</td>
        <td>${d.formatDateTime(client.connectedSince)}</td>
        <td>${d.formatTime(client.lastPing)}</td>
        <td>${d.formatTime(client.lastPong)}</td>
        <td class="${d.statusClass(status)}">${status}</td>
      </tr>`;
    }).join("");
  }

  function log(message) {
    d.appendLog(elements.log, message, state.log);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
