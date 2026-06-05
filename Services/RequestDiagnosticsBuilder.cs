using SignalRDiagnostics.Models;

namespace SignalRDiagnostics.Services;

public static class RequestDiagnosticsBuilder
{
    private const int MaxValueLength = 180;

    private static readonly StringComparer NameComparer = StringComparer.OrdinalIgnoreCase;

    private static readonly HashSet<string> SensitiveHeaders = new(NameComparer)
    {
        "Authorization",
        "Cookie",
        "Proxy-Authorization",
        "Set-Cookie",
        "X-Api-Key",
        "X-Auth-Token",
        "X-CSRF-Token",
        "X-XSRF-Token",
        "Sec-WebSocket-Key"
    };

    private static readonly HashSet<string> SensitiveQueryParameters = new(NameComparer)
    {
        "access_token",
        "code",
        "connectionToken",
        "id",
        "token"
    };

    public static RequestDiagnostics? From(HttpContext? httpContext)
    {
        if (httpContext is null)
        {
            return null;
        }

        var request = httpContext.Request;

        return new RequestDiagnostics(
            request.Method,
            request.Scheme,
            request.Host.ToString(),
            request.PathBase.ToString(),
            request.Path.ToString(),
            request.QueryString.HasValue
                ? $"[present; {request.Query.Count} parameter(s)]"
                : "",
            httpContext.Connection.RemoteIpAddress?.ToString(),
            request.Headers["User-Agent"].ToString(),
            request.Headers
                .OrderBy(header => header.Key, NameComparer)
                .Select(header => HeaderValue(header.Key, header.Value.ToString(), request.Cookies.Count))
                .ToArray(),
            request.Cookies
                .OrderBy(cookie => cookie.Key, NameComparer)
                .Select(cookie => new NameValueDiagnostic(cookie.Key, Redacted(cookie.Value)))
                .ToArray(),
            request.Query
                .OrderBy(parameter => parameter.Key, NameComparer)
                .Select(parameter => QueryValue(parameter.Key, parameter.Value.ToString()))
                .ToArray());
    }

    private static NameValueDiagnostic HeaderValue(string name, string value, int cookieCount)
    {
        if (NameComparer.Equals(name, "Cookie"))
        {
            return new NameValueDiagnostic(name, $"[redacted; {cookieCount} cookie(s)]");
        }

        if (NameComparer.Equals(name, "Authorization") && value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return new NameValueDiagnostic(name, $"Bearer {Redacted(value[7..])}");
        }

        return new NameValueDiagnostic(name, SensitiveHeaders.Contains(name) ? Redacted(value) : TrimValue(value));
    }

    private static NameValueDiagnostic QueryValue(string name, string value)
    {
        return new NameValueDiagnostic(name, SensitiveQueryParameters.Contains(name) ? Redacted(value) : TrimValue(value));
    }

    private static string Redacted(string? value)
    {
        return $"[redacted; length {Clean(value).Length}]";
    }

    private static string TrimValue(string? value)
    {
        var clean = Clean(value);
        return clean.Length <= MaxValueLength
            ? clean
            : $"{clean[..MaxValueLength]}... ({clean.Length} chars)";
    }

    private static string Clean(string? value)
    {
        return (value ?? "")
            .ReplaceLineEndings(" ")
            .Trim();
    }
}
