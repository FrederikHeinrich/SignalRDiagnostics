using System.Text.Json;
using SignalRDiagnostics.Models;

namespace SignalRDiagnostics.Services;

public static class RequestExpectationReader
{
    public const string DiagnosticsHeaderName = "X-SignalR-Diagnostics";
    public const string DiagnosticsProbeHeaderName = "X-SignalR-Diagnostics-Probe";

    private static readonly StringComparer NameComparer = StringComparer.OrdinalIgnoreCase;

    public static ClientRequestExpectation? From(HttpRequest request)
    {
        var queryExpectation = FromQuery(request);
        var headerExpectation = FromHeader(request);

        if (queryExpectation is null && headerExpectation is null)
        {
            return null;
        }

        var sources = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        AddValues(sources, queryExpectation?.Sources);
        AddValues(sources, headerExpectation?.Sources);

        return new ClientRequestExpectation(
            FirstValue(queryExpectation?.TraceId, headerExpectation?.TraceId),
            FirstValue(queryExpectation?.Stage, headerExpectation?.Stage),
            FirstValue(queryExpectation?.AuthMode, headerExpectation?.AuthMode),
            FirstValue(queryExpectation?.TransportMode, headerExpectation?.TransportMode),
            FirstValue(queryExpectation?.ClientOrigin, headerExpectation?.ClientOrigin),
            FirstValue(queryExpectation?.TargetOrigin, headerExpectation?.TargetOrigin),
            queryExpectation?.ExpectBearerCredential == true || headerExpectation?.ExpectBearerCredential == true,
            queryExpectation?.ExpectAuthorizationHeader == true || headerExpectation?.ExpectAuthorizationHeader == true,
            queryExpectation?.ExpectAccessTokenQuery == true || headerExpectation?.ExpectAccessTokenQuery == true,
            queryExpectation?.ExpectDiagnosticHeader == true || headerExpectation?.ExpectDiagnosticHeader == true,
            FirstValue(queryExpectation?.CookieWriteMode, headerExpectation?.CookieWriteMode),
            UnionValues(queryExpectation?.ExpectedCookieNames, headerExpectation?.ExpectedCookieNames),
            sources.ToArray());
    }

    private static ClientRequestExpectation? FromQuery(HttpRequest request)
    {
        if (!request.Query.ContainsKey("diagTraceId"))
        {
            return null;
        }

        return new ClientRequestExpectation(
            QueryValue(request, "diagTraceId"),
            QueryValue(request, "diagStage"),
            QueryValue(request, "diagAuthMode"),
            QueryValue(request, "diagTransportMode"),
            QueryValue(request, "diagClientOrigin"),
            QueryValue(request, "diagTargetOrigin"),
            QueryBool(request, "diagExpectBearer"),
            QueryBool(request, "diagExpectAuthorization"),
            QueryBool(request, "diagExpectAccessToken"),
            QueryBool(request, "diagExpectDiagnosticHeader"),
            QueryValue(request, "diagCookieWriteMode"),
            SplitList(QueryValue(request, "diagExpectedCookieNames")),
            new[] { "query" });
    }

    private static ClientRequestExpectation? FromHeader(HttpRequest request)
    {
        var encoded = request.Headers[DiagnosticsHeaderName].ToString();
        if (string.IsNullOrWhiteSpace(encoded))
        {
            return null;
        }

        try
        {
            var header = JsonSerializer.Deserialize<HeaderExpectation>(
                System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(encoded)),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (header is null || string.IsNullOrWhiteSpace(header.TraceId))
            {
                return null;
            }

            return new ClientRequestExpectation(
                Clean(header.TraceId),
                Clean(header.Stage),
                Clean(header.AuthMode),
                Clean(header.TransportMode),
                Clean(header.ClientOrigin),
                Clean(header.TargetOrigin),
                header.ExpectBearerCredential,
                header.ExpectAuthorizationHeader,
                header.ExpectAccessTokenQuery,
                header.ExpectDiagnosticHeader,
                Clean(header.CookieWriteMode),
                header.ExpectedCookieNames.Select(Clean).Where(value => value.Length > 0).Distinct(NameComparer).ToArray(),
                new[] { "header" });
        }
        catch
        {
            return null;
        }
    }

    private static string QueryValue(HttpRequest request, string name)
    {
        return Clean(request.Query[name].ToString());
    }

    private static bool QueryBool(HttpRequest request, string name)
    {
        return bool.TryParse(request.Query[name].ToString(), out var value) && value;
    }

    private static IReadOnlyList<string> SplitList(string value)
    {
        return value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(item => item.Length > 0)
            .Distinct(NameComparer)
            .ToArray();
    }

    private static IReadOnlyList<string> UnionValues(IReadOnlyList<string>? first, IReadOnlyList<string>? second)
    {
        var values = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        AddValues(values, first);
        AddValues(values, second);
        return values.ToArray();
    }

    private static void AddValues(ISet<string> target, IEnumerable<string>? values)
    {
        foreach (var value in values?.Select(Clean).Where(value => value.Length > 0) ?? [])
        {
            target.Add(value);
        }
    }

    private static string FirstValue(params string?[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";
    }

    private static string Clean(string? value)
    {
        return (value ?? "")
            .ReplaceLineEndings(" ")
            .Trim();
    }

    private sealed class HeaderExpectation
    {
        public string? TraceId { get; set; }

        public string? Stage { get; set; }

        public string? AuthMode { get; set; }

        public string? TransportMode { get; set; }

        public string? ClientOrigin { get; set; }

        public string? TargetOrigin { get; set; }

        public bool ExpectBearerCredential { get; set; }

        public bool ExpectAuthorizationHeader { get; set; }

        public bool ExpectAccessTokenQuery { get; set; }

        public bool ExpectDiagnosticHeader { get; set; }

        public string? CookieWriteMode { get; set; }

        public string[] ExpectedCookieNames { get; set; } = [];
    }
}
