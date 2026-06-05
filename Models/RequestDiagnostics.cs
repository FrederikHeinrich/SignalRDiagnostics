namespace SignalRDiagnostics.Models;

public sealed record RequestDiagnostics(
    string Method,
    string Scheme,
    string Host,
    string PathBase,
    string Path,
    string QueryString,
    string? RemoteIpAddress,
    string? UserAgent,
    IReadOnlyList<NameValueDiagnostic> Headers,
    IReadOnlyList<NameValueDiagnostic> Cookies,
    IReadOnlyList<NameValueDiagnostic> QueryParameters,
    ClientRequestExpectation? ClientExpectation,
    IReadOnlyList<string> MissingExpectations,
    IReadOnlyList<string> Warnings);

public sealed record NameValueDiagnostic(string Name, string Value);

public sealed record ClientRequestExpectation(
    string TraceId,
    string Stage,
    string AuthMode,
    string TransportMode,
    string ClientOrigin,
    string TargetOrigin,
    bool ExpectBearerCredential,
    bool ExpectAuthorizationHeader,
    bool ExpectAccessTokenQuery,
    bool ExpectDiagnosticHeader,
    string CookieWriteMode,
    IReadOnlyList<string> ExpectedCookieNames,
    IReadOnlyList<string> Sources);
