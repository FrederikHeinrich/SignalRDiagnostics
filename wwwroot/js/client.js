(function () {
  const d = window.Diagnostics;
  const elements = {
    authMode: document.getElementById("authMode"),
    baseUrl: document.getElementById("baseUrl"),
    bearerToken: document.getElementById("bearerToken"),
    busyLabel: document.getElementById("busyLabel"),
    clearButton: document.getElementById("clearButton"),
    connectButton: document.getElementById("connectButton"),
    cookieValue: document.getElementById("cookieValue"),
    disconnectButton: document.getElementById("disconnectButton"),
    durationSeconds: document.getElementById("durationSeconds"),
    fullTestButton: document.getElementById("fullTestButton"),
    hubPath: document.getElementById("hubPath"),
    log: document.getElementById("log"),
    logCount: document.getElementById("logCount"),
    negotiateButton: document.getElementById("negotiateButton"),
    pingIntervalSeconds: document.getElementById("pingIntervalSeconds"),
    sendButton: document.getElementById("sendButton"),
    testMessage: document.getElementById("testMessage"),
    transportMode: document.getElementById("transportMode")
  };

  const state = {
    connectedAt: null,
    connection: null,
    fullTestCancel: false,
    interval: null,
    lastError: "-",
    log: { count: 0 },
    received: 0,
    runtimeTimer: null,
    sent: 0
  };

  elements.baseUrl.value = d.defaultBaseUrl();
  updateStatus();

  elements.negotiateButton.addEventListener("click", () => runAction(elements.negotiateButton, testNegotiate));
  elements.connectButton.addEventListener("click", () => runAction(elements.connectButton, connect));
  elements.sendButton.addEventListener("click", () => runAction(elements.sendButton, sendMessage));
  elements.fullTestButton.addEventListener("click", () => runAction(elements.fullTestButton, runFullTest));
  elements.disconnectButton.addEventListener("click", () => runAction(elements.disconnectButton, disconnect));
  elements.clearButton.addEventListener("click", clearLog);

  [elements.transportMode, elements.authMode].forEach((element) => element.addEventListener("change", updateStatus));

  function log(message) {
    d.appendLog(elements.log, message, state.log);
    d.setText("logCount", `${state.log.count} entries`);
  }

  async function runAction(button, action) {
    d.setBusy(button, true);
    elements.busyLabel.textContent = "Running";

    try {
      await action();
    } catch (error) {
      recordError(error);
    } finally {
      d.setBusy(button, false);
      elements.busyLabel.textContent = "Idle";
      updateStatus();
    }
  }

  async function testNegotiate() {
    const hubUrl = d.buildHubUrl(elements.baseUrl.value, elements.hubPath.value);
    const url = new URL(`${hubUrl.href.replace(/\/$/, "")}/negotiate`);
    url.searchParams.set("negotiateVersion", "1");
    const headers = {};
    const auth = authOptions(headers, hubUrl);
    const started = performance.now();

    log(`GET ${url.href}`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: auth.credentials,
        mode: "cors"
      });
      const body = await response.text();
      const elapsed = Math.round(performance.now() - started);

      log(`Negotiate status: ${response.status} ${response.statusText}`);
      log(`Negotiate duration: ${elapsed} ms`);
      log(`Response headers:\n${d.formatHeaders(response.headers) || "(none visible)"}`);
      log(`Body preview:\n${body.slice(0, 4000) || "(empty)"}`);
      return {
        bodyPreview: body.slice(0, 4000),
        durationMs: elapsed,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: url.href
      };
    } catch (error) {
      recordError(error);
      log("Negotiate failed. Browser CORS, TLS, WAF, routing, or backend availability can all block this request.");
      return { durationMs: Math.round(performance.now() - started), error: error?.message || String(error), ok: false, url: url.href };
    }
  }

  async function connect() {
    await disconnect(false, false);

    const hubUrl = d.buildHubUrl(elements.baseUrl.value, elements.hubPath.value);
    const options = signalROptions(hubUrl);
    const started = performance.now();
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl.href, options)
      .configureLogging(signalR.LogLevel.Information)
      .build();

    registerHandlers(connection);
    state.connection = connection;
    log(`Connecting to ${hubUrl.href}`);

    await connection.start();
    state.connectedAt = new Date();
    startRuntimeTimer();
    countSent();

    await connection.invoke("RegisterClient", {
      clientId: d.getClientId("client"),
      role: "client",
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      transportMode: transportLabel(),
      authMode: authLabel()
    });

    log(`Connected. Connection id: ${connection.connectionId || "(not exposed)"}`);
    updateStatus();
    return { connectionId: connection.connectionId || "", durationMs: Math.round(performance.now() - started), ok: true, url: hubUrl.href };
  }

  function registerHandlers(connection) {
    connection.on("ServerPing", async (payload) => {
      countReceived();
      d.setText("lastPingValue", d.formatTime(payload.serverTimestamp));
      log(`ServerPing received: ${d.safeJson(payload)}`);

      try {
        countSent();
        const result = await connection.invoke("Pong", new Date().toISOString());
        countReceived();
        d.setText("lastPongValue", d.formatTime(result.serverTimestamp));
        log(`Pong acknowledged: ${d.safeJson(result)}`);
      } catch (error) {
        recordError(error);
      }
    });

    connection.on("BroadcastMessage", (payload) => {
      countReceived();
      log(`Broadcast received: ${d.safeJson(payload)}`);
    });

    connection.on("DiagnosticsEvent", (event) => {
      if (event.eventType === "error") {
        state.lastError = event.message;
      }
      log(`Server event ${event.eventType}: ${event.message}`);
      updateStatus();
    });

    connection.onclose((error) => {
      const elapsed = state.connectedAt ? (Date.now() - state.connectedAt.getTime()) / 1000 : 0;
      state.connection = null;
      stopTimers();

      if (error) {
        recordError(error);
      }

      log(`Connection closed after ${Math.round(elapsed)} seconds.`);

      if (elapsed >= 12 && elapsed <= 18) {
        const warning = "Connection closed around 15 seconds. Possible Azure Application Gateway/backend timeout, idle timeout, keepalive issue or WebSocket upgrade problem.";
        state.lastError = warning;
        log(`WARNING: ${warning}`);
      }

      updateStatus();
    });
  }

  async function sendMessage() {
    const connection = requireConnection();
    const message = elements.testMessage.value || "";
    const started = performance.now();

    countSent();
    log(`Echo send: ${message}`);
    const result = await connection.invoke("Echo", message);
    const elapsed = Math.round(performance.now() - started);
    countReceived();
    log(`Echo result in ${elapsed} ms:\n${d.safeJson(result)}`);
    return { durationMs: elapsed, ok: true, result };
  }

  async function runFullTest() {
    return window.FullTestRunner.run({
      d,
      elements,
      methods: { connect, disconnect, invokePing, log, recordError, resetCounters, sendMessage, testNegotiate },
      state
    });
  }

  async function invokePing() {
    const connection = requireConnection();
    const started = performance.now();

    countSent();
    d.setText("lastPingValue", d.formatTime(new Date()));
    const result = await connection.invoke("Ping");
    const elapsed = Math.round(performance.now() - started);
    countReceived();
    d.setText("lastPongValue", d.formatTime(result.serverTimestamp));
    log(`Ping roundtrip ${elapsed} ms:\n${d.safeJson(result)}`);
    return { durationMs: elapsed, ok: true, result };
  }

  async function disconnect(logWhenClosed = true, cancelFullTest = true) {
    if (cancelFullTest) {
      state.fullTestCancel = true;
    }

    window.clearInterval(state.interval);
    state.interval = null;

    if (!state.connection) {
      stopTimers();
      if (logWhenClosed) {
        log("No active connection.");
      }
      updateStatus();
      return { alreadyDisconnected: true, ok: true };
    }

    const connection = state.connection;
    state.connection = null;
    await connection.stop();
    stopTimers();

    if (logWhenClosed) {
      log("Disconnected.");
    }

    updateStatus();
    return { ok: true };
  }

  function signalROptions(hubUrl) {
    const headers = {};
    const auth = authOptions(headers, hubUrl);
    const options = {
      withCredentials: auth.credentials === "include"
    };

    if (Object.keys(headers).length > 0) {
      options.headers = headers;
    }

    if (auth.accessTokenFactory) {
      options.accessTokenFactory = auth.accessTokenFactory;
    }

    const transport = transportValue();
    if (transport !== null) {
      options.transport = transport;
    }

    return options;
  }

  function authOptions(headers, hubUrl) {
    const authMode = elements.authMode.value;

    if (authMode === "bearer") {
      const token = elements.bearerToken.value.trim();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      return {
        credentials: "include",
        accessTokenFactory: token ? () => token : undefined
      };
    }

    if (authMode === "cookie") {
      applyCookieIfPossible(hubUrl);
      return { credentials: "include" };
    }

    return { credentials: "same-origin" };
  }

  function applyCookieIfPossible(hubUrl) {
    const cookie = elements.cookieValue.value.trim();
    if (!cookie) {
      return;
    }

    if (hubUrl.origin !== window.location.origin) {
      log("Cookie mode uses browser-managed cookies for cross-origin targets; JavaScript cannot set a Cookie header for another origin.");
      return;
    }

    document.cookie = `${cookie}; path=/; SameSite=Lax`;
  }

  function transportValue() {
    switch (elements.transportMode.value) {
      case "webSockets":
        return signalR.HttpTransportType.WebSockets;
      case "serverSentEvents":
        return signalR.HttpTransportType.ServerSentEvents;
      case "longPolling":
        return signalR.HttpTransportType.LongPolling;
      default:
        return null;
    }
  }

  function transportLabel() { return elements.transportMode.options[elements.transportMode.selectedIndex].text; }

  function authLabel() { return elements.authMode.options[elements.authMode.selectedIndex].text; }

  function requireConnection() {
    if (!state.connection || state.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("SignalR connection is not connected.");
    }

    return state.connection;
  }

  function updateStatus() {
    const connection = state.connection;
    const runtime = state.connectedAt ? (Date.now() - state.connectedAt.getTime()) / 1000 : 0;

    d.setText("stateValue", connection ? connection.state : "Disconnected");
    d.setText("transportValue", `${transportLabel()} / ${authLabel()}`);
    d.setText("connectionIdValue", connection?.connectionId || "-");
    d.setText("runtimeValue", d.formatDuration(runtime));
    d.setText("sentValue", state.sent);
    d.setText("receivedValue", state.received);
    d.setText("lastErrorValue", state.lastError);
  }

  function startRuntimeTimer() {
    window.clearInterval(state.runtimeTimer);
    state.runtimeTimer = window.setInterval(updateStatus, 1000);
  }

  function stopTimers() {
    window.clearInterval(state.interval);
    window.clearInterval(state.runtimeTimer);
    state.interval = null;
    state.runtimeTimer = null;
    state.connectedAt = null;
  }

  function countSent() { state.sent += 1; updateStatus(); }

  function countReceived() { state.received += 1; updateStatus(); }

  function resetCounters() {
    state.sent = 0;
    state.received = 0;
    state.lastError = "-";
    updateStatus();
  }

  function recordError(error) {
    const message = error?.message || String(error);
    state.lastError = message;
    log(`ERROR: ${message}`);
    updateStatus();
  }

  function clearLog() {
    elements.log.textContent = "";
    state.log.count = 0;
    d.setText("logCount", "0 entries");
  }

})();
