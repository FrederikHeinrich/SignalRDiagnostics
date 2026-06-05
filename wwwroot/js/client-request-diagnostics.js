(function () {
  function create(options) {
    const cookieNames = parseCookieNames(options.cookieValue);
    const hasBearer = options.authMode === "bearer" && options.bearerToken.trim().length > 0;
    const wantsCookies = options.authMode === "cookie";

    return {
      authMode: options.authMode,
      clientOrigin: window.location.origin,
      cookieWriteMode: cookieWriteMode(options.hubUrl, wantsCookies, cookieNames),
      expectAccessTokenQuery: options.stage === "connect" && hasBearer,
      expectAuthorizationHeader: hasBearer && expectsAuthorizationHeader(options),
      expectBearerCredential: hasBearer,
      expectDiagnosticHeader: true,
      expectedCookieNames: wantsCookies ? cookieNames : [],
      stage: options.stage,
      targetOrigin: options.hubUrl.origin,
      traceId: crypto.randomUUID(),
      transportMode: options.transportMode
    };
  }

  function applyToUrl(url, diagnostics) {
    const params = {
      diagAuthMode: diagnostics.authMode,
      diagClientOrigin: diagnostics.clientOrigin,
      diagCookieWriteMode: diagnostics.cookieWriteMode,
      diagExpectAccessToken: diagnostics.expectAccessTokenQuery,
      diagExpectAuthorization: diagnostics.expectAuthorizationHeader,
      diagExpectBearer: diagnostics.expectBearerCredential,
      diagExpectDiagnosticHeader: diagnostics.expectDiagnosticHeader,
      diagExpectedCookieNames: diagnostics.expectedCookieNames.join(","),
      diagProbe: "client",
      diagStage: diagnostics.stage,
      diagTargetOrigin: diagnostics.targetOrigin,
      diagTraceId: diagnostics.traceId,
      diagTransportMode: diagnostics.transportMode
    };

    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  function applyToHeaders(headers, diagnostics) {
    headers["X-SignalR-Diagnostics"] = window.btoa(JSON.stringify(diagnostics));
    headers["X-SignalR-Diagnostics-Probe"] = diagnostics.traceId;
  }

  function summary(diagnostics) {
    const cookies = diagnostics.expectedCookieNames.length
      ? diagnostics.expectedCookieNames.join(", ")
      : "-";

    return [
      `Trace id: ${diagnostics.traceId}`,
      `Expected bearer credential: ${diagnostics.expectBearerCredential ? "yes" : "no"}`,
      `Expected Authorization header: ${diagnostics.expectAuthorizationHeader ? "yes" : "no"}`,
      `Expected cookies: ${cookies}`,
      `Cookie mode: ${diagnostics.cookieWriteMode}`
    ].join("\n");
  }

  function parseCookieNames(value) {
    const attributes = new Set(["domain", "expires", "httponly", "max-age", "partitioned", "path", "priority", "samesite", "secure"]);

    return [...new Set(value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split("=")[0].trim())
      .filter((name) => name && !attributes.has(name.toLowerCase())))];
  }

  function cookieWriteMode(hubUrl, wantsCookies, cookieNames) {
    if (!wantsCookies) {
      return "none";
    }

    if (cookieNames.length === 0) {
      return "browser-managed";
    }

    return hubUrl.origin === window.location.origin
      ? "same-origin-input-cookie"
      : "cross-origin-browser-managed-only";
  }

  function expectsAuthorizationHeader(options) {
    return options.stage === "negotiate" || options.transportMode === "LongPolling only";
  }

  window.ClientRequestDiagnostics = {
    applyToHeaders,
    applyToUrl,
    create,
    summary
  };
})();
