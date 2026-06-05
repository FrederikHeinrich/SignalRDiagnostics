(function () {
  const elements = {
    applyBearer: document.getElementById("applyBearerButton"),
    applyCookie: document.getElementById("applyCookieButton"),
    authMode: document.getElementById("authMode"),
    bearerAudience: document.getElementById("bearerAudience"),
    bearerIssuer: document.getElementById("bearerIssuer"),
    bearerLifetime: document.getElementById("bearerLifetimeMinutes"),
    bearerOutput: document.getElementById("generatedBearerToken"),
    bearerRoles: document.getElementById("bearerRoles"),
    bearerScope: document.getElementById("bearerScope"),
    bearerSubject: document.getElementById("bearerSubject"),
    bearerToken: document.getElementById("bearerToken"),
    buildCookie: document.getElementById("buildCookieButton"),
    cookieDomain: document.getElementById("cookieBuilderDomain"),
    cookieHeaderOutput: document.getElementById("builtCookieInput"),
    cookieHttpOnly: document.getElementById("cookieBuilderHttpOnly"),
    cookieInput: document.getElementById("cookieValue"),
    cookieMaxAge: document.getElementById("cookieBuilderMaxAge"),
    cookieName: document.getElementById("cookieBuilderName"),
    cookiePath: document.getElementById("cookieBuilderPath"),
    cookieSameSite: document.getElementById("cookieBuilderSameSite"),
    cookieSecure: document.getElementById("cookieBuilderSecure"),
    cookieSetOutput: document.getElementById("builtSetCookie"),
    cookieValue: document.getElementById("cookieBuilderValue"),
    copyBearer: document.getElementById("copyBearerButton"),
    copyCookie: document.getElementById("copyCookieButton"),
    format: document.getElementById("bearerTokenFormat"),
    generateBearer: document.getElementById("generateBearerButton"),
    status: document.getElementById("authToolsStatus")
  };

  if (!elements.generateBearer || !elements.buildCookie) {
    return;
  }

  elements.generateBearer.addEventListener("click", () => writeBearer(generateBearerToken()));
  elements.applyBearer.addEventListener("click", applyBearerToken);
  elements.copyBearer.addEventListener("click", () => copyText(elements.bearerOutput.value, "Bearer token copied."));
  elements.buildCookie.addEventListener("click", () => writeCookie(buildCookie()));
  elements.applyCookie.addEventListener("click", applyCookie);
  elements.copyCookie.addEventListener("click", () => copyText(elements.cookieHeaderOutput.value, "Cookie input value copied."));

  writeBearer(generateBearerToken());
  writeCookie(buildCookie());
  setStatus("Ready");

  function generateBearerToken() {
    if (elements.format.value === "random") {
      return `diag_${randomBase64Url(32)}`;
    }

    const now = Math.floor(Date.now() / 1000);
    const lifetime = positiveNumber(elements.bearerLifetime.value, 60);
    const roles = splitCsv(elements.bearerRoles.value);
    const payload = compactObject({
      aud: elements.bearerAudience.value.trim(),
      exp: now + lifetime * 60,
      iat: now,
      iss: elements.bearerIssuer.value.trim(),
      jti: crypto.randomUUID(),
      nbf: now,
      roles: roles.length ? roles : undefined,
      scope: elements.bearerScope.value.trim(),
      sub: elements.bearerSubject.value.trim()
    });
    const alg = elements.format.value === "jwt-none" ? "none" : "HS256";
    const signature = alg === "none" ? "" : randomBase64Url(32);

    return [
      base64UrlJson({ alg, typ: "JWT" }),
      base64UrlJson(payload),
      signature
    ].join(".");
  }

  function applyBearerToken() {
    const token = elements.bearerOutput.value.trim() || generateBearerToken();
    elements.bearerToken.value = token;
    elements.authMode.value = "bearer";
    dispatch(elements.bearerToken, "input");
    dispatch(elements.authMode, "change");
    setStatus("Bearer token applied.");
  }

  function buildCookie() {
    const name = safeCookieName(elements.cookieName.value);
    const value = safeCookieValue(elements.cookieValue.value);

    if (!name) {
      throw new Error("Cookie name is required.");
    }

    const pair = `${name}=${value}`;
    const attributes = [
      attribute("Path", elements.cookiePath.value.trim()),
      attribute("Domain", elements.cookieDomain.value.trim()),
      attribute("Max-Age", positiveNumber(elements.cookieMaxAge.value, 3600)),
      attribute("SameSite", elements.cookieSameSite.value),
      elements.cookieSecure.checked ? "Secure" : "",
      elements.cookieHttpOnly.checked ? "HttpOnly" : ""
    ].filter(Boolean);

    return {
      browserCookie: [pair, ...attributes.filter((item) => item !== "HttpOnly")].join("; "),
      inputValue: pair,
      setCookie: [pair, ...attributes].join("; ")
    };
  }

  function applyCookie() {
    const cookie = buildCookie();
    writeCookie(cookie);
    elements.cookieInput.value = cookie.inputValue;
    elements.authMode.value = "cookie";
    document.cookie = cookie.browserCookie;
    dispatch(elements.cookieInput, "input");
    dispatch(elements.authMode, "change");
    setStatus("Cookie applied to input and current origin.");
  }

  function writeBearer(token) {
    elements.bearerOutput.value = token;
    setStatus("Bearer token generated.");
  }

  function writeCookie(cookie) {
    elements.cookieHeaderOutput.value = cookie.inputValue;
    elements.cookieSetOutput.value = cookie.setCookie;
    setStatus("Cookie built.");
  }

  async function copyText(value, message) {
    if (!value) {
      setStatus("Nothing to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setStatus(message);
    } catch {
      setStatus("Copy blocked by browser; use manual selection.");
    }
  }

  function base64UrlJson(value) {
    return base64Url(new TextEncoder().encode(JSON.stringify(value)));
  }

  function base64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function randomBase64Url(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== undefined));
  }

  function splitCsv(value) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function attribute(name, value) {
    return value ? `${name}=${value}` : "";
  }

  function safeCookieName(value) {
    return value.trim().replace(/[()<>@,;:\\"\/\[\]?={} \t]/g, "");
  }

  function safeCookieValue(value) {
    return encodeURIComponent(value.trim().replace(/[;\r\n]/g, ""));
  }

  function dispatch(element, type) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }
})();
