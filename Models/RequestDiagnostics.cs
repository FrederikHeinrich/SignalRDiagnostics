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
    IReadOnlyList<NameValueDiagnostic> QueryParameters);

public sealed record NameValueDiagnostic(string Name, string Value);
