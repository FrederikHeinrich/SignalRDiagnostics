using SignalRDiagnostics.Models;

namespace SignalRDiagnostics.Services;

public static class RequestExpectationComparer
{
    private static readonly StringComparer NameComparer = StringComparer.OrdinalIgnoreCase;

    public static (IReadOnlyList<string> Missing, IReadOnlyList<string> Warnings) Compare(
        ClientRequestExpectation? expectation,
        IReadOnlyList<NameValueDiagnostic> headers,
        IReadOnlyList<NameValueDiagnostic> cookies,
        IReadOnlyList<NameValueDiagnostic> queryParameters)
    {
        if (expectation is null)
        {
            return (Array.Empty<string>(), Array.Empty<string>());
        }

        var missing = new List<string>();
        var warnings = new List<string>();
        var hasAuthorization = ContainsName(headers, "Authorization");
        var hasAccessToken = ContainsName(queryParameters, "access_token");
        var hasDiagnosticsHeader = ContainsName(headers, RequestExpectationReader.DiagnosticsHeaderName);
        var hasDiagnosticsProbeHeader = ContainsName(headers, RequestExpectationReader.DiagnosticsProbeHeaderName);

        AddBearerFindings(expectation, hasAuthorization, hasAccessToken, missing);
        AddDiagnosticHeaderFindings(expectation, hasDiagnosticsHeader, hasDiagnosticsProbeHeader, missing);
        AddCookieFindings(expectation, cookies, missing, warnings);
        AddSourceWarnings(expectation, warnings);

        return (missing, warnings);
    }

    private static void AddBearerFindings(
        ClientRequestExpectation expectation,
        bool hasAuthorization,
        bool hasAccessToken,
        ICollection<string> missing)
    {
        if (expectation.ExpectBearerCredential && !hasAuthorization && !hasAccessToken)
        {
            missing.Add("Bearer credential was expected but neither Authorization header nor access_token query parameter arrived.");
        }

        if (expectation.ExpectAuthorizationHeader && !hasAuthorization)
        {
            missing.Add("Authorization header was expected but did not arrive.");
        }

        if (expectation.ExpectAccessTokenQuery && !hasAccessToken && !hasAuthorization)
        {
            missing.Add("Bearer access_token query parameter was expected for this transport but did not arrive.");
        }
    }

    private static void AddDiagnosticHeaderFindings(
        ClientRequestExpectation expectation,
        bool hasDiagnosticsHeader,
        bool hasDiagnosticsProbeHeader,
        ICollection<string> missing)
    {
        if (expectation.ExpectDiagnosticHeader && !hasDiagnosticsHeader && !hasDiagnosticsProbeHeader)
        {
            missing.Add("Diagnostic probe header was expected but did not arrive.");
        }
    }

    private static void AddCookieFindings(
        ClientRequestExpectation expectation,
        IReadOnlyList<NameValueDiagnostic> cookies,
        ICollection<string> missing,
        ICollection<string> warnings)
    {
        foreach (var cookieName in expectation.ExpectedCookieNames.Where(name => !ContainsName(cookies, name)))
        {
            missing.Add($"Cookie '{cookieName}' was expected but did not arrive.");
        }

        if (expectation.CookieWriteMode.Contains("cross-origin", StringComparison.OrdinalIgnoreCase))
        {
            warnings.Add("Cookie input was cross-origin; browsers cannot set Cookie headers for another origin from JavaScript.");
        }
    }

    private static void AddSourceWarnings(ClientRequestExpectation expectation, ICollection<string> warnings)
    {
        if (!expectation.Sources.Contains("header", StringComparer.OrdinalIgnoreCase))
        {
            warnings.Add("Diagnostic metadata header did not arrive; custom headers may be unsupported for the transport or stripped by a proxy/gateway.");
        }

        if (!expectation.Sources.Contains("query", StringComparer.OrdinalIgnoreCase))
        {
            warnings.Add("Diagnostic metadata query parameters did not arrive; query strings may be stripped or rewritten by routing.");
        }
    }

    private static bool ContainsName(IReadOnlyList<NameValueDiagnostic> items, string name)
    {
        return items.Any(item => NameComparer.Equals(item.Name, name));
    }
}
