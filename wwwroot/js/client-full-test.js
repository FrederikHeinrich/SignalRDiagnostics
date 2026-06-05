(function () {
  const transports = [
    { label: "Auto", value: "auto" },
    { label: "WebSockets", value: "webSockets" },
    { label: "ServerSentEvents", value: "serverSentEvents" },
    { label: "LongPolling", value: "longPolling" }
  ];
  const authModes = [
    { label: "None", value: "none" },
    { label: "Cookie", value: "cookie" },
    { label: "Bearer", value: "bearer" }
  ];

  async function run(context) {
    const { d, elements: form, methods, state } = context;
    const session = createSession(d, form);
    const original = snapshotControls(form);
    const report = window.FullTestReport;
    report.renderRunning(session);
    state.fullTestCancel = false;
    ensureCredentials(form);

    try {
      for (const scenario of session.scenarios) {
        if (state.fullTestCancel) {
          break;
        }

        await runScenario({ form, methods, scenario, session, state });
        report.renderRunning(session);
      }

      session.cancelled = state.fullTestCancel;
      methods.log(session.cancelled ? "Full test matrix cancelled." : "Full test matrix completed.");
    } catch (error) {
      session.errors.push(error?.message || String(error));
      methods.recordError(error);
    } finally {
      session.endedAt = new Date();
      session.counters = report.summarizeCounters(session.scenarios);

      try {
        if (state.connection) {
          await methods.disconnect(true, false);
        }
      } catch (error) {
        session.errors.push(`Disconnect failed: ${error?.message || String(error)}`);
      }

      restoreControls(form, original);
      report.renderComplete(session);
    }
  }

  async function runScenario(context) {
    const { form, methods, scenario, session, state } = context;
    const startedAt = new Date();
    methods.resetCounters();
    applyScenario(form, scenario);
    methods.log(`Full test scenario ${scenario.index}/${session.scenarios.length}: ${scenario.transportLabel} + ${scenario.authLabel}`);

    try {
      await methods.disconnect(false, false);
      scenario.negotiate = await safeStep("negotiate", scenario, methods, () => methods.testNegotiate());
      scenario.connection = await safeStep("connect", scenario, methods, () => methods.connect());

      if (scenario.connection?.ok && !state.fullTestCancel) {
        scenario.echo = await safeStep("echo", scenario, methods, () => methods.sendMessage());
        await runScenarioPings({ methods, scenario, state });
      }
    } finally {
      scenario.endedAt = new Date();
      scenario.durationSeconds = Math.round((scenario.endedAt - startedAt) / 1000);
      scenario.counters = { received: state.received, sent: state.sent };
      if (state.lastError && state.lastError !== "-") {
        scenario.warnings.push(state.lastError);
      }

      try {
        if (state.connection) {
          await methods.disconnect(false, false);
        }
      } catch (error) {
        scenario.errors.push(`Disconnect failed: ${error?.message || String(error)}`);
      }

      scenario.status = statusForScenario(scenario, state.fullTestCancel);
    }
  }

  async function runScenarioPings(context) {
    const { methods, scenario, state } = context;
    const endAt = Date.now() + scenario.holdSeconds * 1000;
    scenario.pings.push(await safeStep("ping", scenario, methods, () => methods.invokePing()));

    while (!state.fullTestCancel && Date.now() < endAt) {
      const remaining = endAt - Date.now();
      await delay(Math.min(scenario.pingIntervalSeconds * 1000, remaining));
      if (!state.fullTestCancel && Date.now() < endAt) {
        scenario.pings.push(await safeStep("ping", scenario, methods, () => methods.invokePing()));
      }
    }
  }

  async function safeStep(stepName, scenario, methods, action) {
    try {
      const result = await action();
      if (!result?.ok) {
        scenario.errors.push(`${stepName}: ${result?.error || "not ok"}`);
      }

      return result;
    } catch (error) {
      const message = error?.message || String(error);
      scenario.errors.push(`${stepName}: ${message}`);
      methods.recordError(error);
      return { error: message, ok: false };
    }
  }

  function createSession(d, form) {
    const durationSeconds = d.numberValue(form.durationSeconds, 60);
    const pingIntervalSeconds = d.numberValue(form.pingIntervalSeconds, 5);
    const scenarios = createScenarios(durationSeconds, pingIntervalSeconds);

    return {
      cancelled: false,
      config: {
        baseUrl: form.baseUrl.value,
        durationSeconds,
        hubPath: form.hubPath.value,
        pingIntervalSeconds,
        scenarioCount: scenarios.length,
        testMessage: form.testMessage.value
      },
      counters: { received: 0, sent: 0 },
      endedAt: null,
      errors: [],
      id: crypto.randomUUID(),
      scenarios,
      startedAt: new Date()
    };
  }

  function createScenarios(durationSeconds, pingIntervalSeconds) {
    const count = transports.length * authModes.length;
    const holdSeconds = Math.max(1, Math.round(durationSeconds / count));
    let index = 1;

    return transports.flatMap((transport) => authModes.map((auth) => ({
      authLabel: auth.label,
      authValue: auth.value,
      connection: null,
      counters: { received: 0, sent: 0 },
      durationSeconds: 0,
      echo: null,
      endedAt: null,
      errors: [],
      holdSeconds,
      index: index++,
      negotiate: null,
      pingIntervalSeconds,
      pings: [],
      status: "Pending",
      transportLabel: transport.label,
      transportValue: transport.value,
      warnings: []
    })));
  }

  function ensureCredentials(form) {
    if (!form.cookieValue.value.trim()) {
      form.cookieValue.value = document.getElementById("builtCookieInput")?.value.trim() || "DiagCookie=diagnostic-cookie";
    }

    if (!form.bearerToken.value.trim()) {
      form.bearerToken.value = document.getElementById("generatedBearerToken")?.value.trim() || `diag_${crypto.randomUUID().replaceAll("-", "")}`;
    }

    dispatch(form.cookieValue, "input");
    dispatch(form.bearerToken, "input");
  }

  function applyScenario(form, scenario) {
    form.transportMode.value = scenario.transportValue;
    form.authMode.value = scenario.authValue;
    dispatch(form.transportMode, "change");
    dispatch(form.authMode, "change");
  }

  function snapshotControls(form) {
    return {
      authMode: form.authMode.value,
      bearerToken: form.bearerToken.value,
      cookieValue: form.cookieValue.value,
      transportMode: form.transportMode.value
    };
  }

  function restoreControls(form, original) {
    form.transportMode.value = original.transportMode;
    form.authMode.value = original.authMode;
    form.cookieValue.value = original.cookieValue;
    form.bearerToken.value = original.bearerToken;
    dispatch(form.transportMode, "change");
    dispatch(form.authMode, "change");
    dispatch(form.cookieValue, "input");
    dispatch(form.bearerToken, "input");
  }

  function statusForScenario(scenario, cancelled) {
    if (cancelled) {
      return "Cancelled";
    }

    const pingStats = window.FullTestReport.summarizePings(scenario.pings);
    if (scenario.errors.length > 0 || !scenario.negotiate?.ok || !scenario.connection?.ok || !scenario.echo?.ok) {
      return "Failed";
    }

    return pingStats.count > 0 ? "Passed" : "Warning";
  }

  function dispatch(element, type) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  window.FullTestRunner = { run };
})();
