namespace SignalRDiagnostics.Models;

public sealed class ClientConnection
{
    public required string ConnectionId { get; init; }

    public string ClientId { get; set; } = "";

    public string Role { get; set; } = "unknown";

    public string Status { get; set; } = "connected";

    public DateTimeOffset ConnectedSince { get; init; }

    public DateTimeOffset LastSeen { get; set; }

    public DateTimeOffset? LastPing { get; set; }

    public DateTimeOffset? LastPong { get; set; }

    public DateTimeOffset? DisconnectedAt { get; set; }

    public long MessagesSent { get; set; }

    public long MessagesReceived { get; set; }

    public string? UserAgent { get; set; }

    public string? TransportMode { get; set; }

    public string? AuthMode { get; set; }

    public string? PageUrl { get; set; }

    public ClientConnectionDto ToDto(DateTimeOffset now)
    {
        return new ClientConnectionDto(
            ClientId,
            ConnectionId,
            Role,
            ConnectedSince,
            LastSeen,
            LastPing,
            LastPong,
            Status,
            Math.Max(0, (now - ConnectedSince).TotalSeconds),
            MessagesSent,
            MessagesReceived,
            UserAgent,
            TransportMode,
            AuthMode,
            PageUrl);
    }
}

public sealed record ClientConnectionDto(
    string ClientId,
    string ConnectionId,
    string Role,
    DateTimeOffset ConnectedSince,
    DateTimeOffset LastSeen,
    DateTimeOffset? LastPing,
    DateTimeOffset? LastPong,
    string Status,
    double SessionDurationSeconds,
    long MessagesSent,
    long MessagesReceived,
    string? UserAgent,
    string? TransportMode,
    string? AuthMode,
    string? PageUrl);
