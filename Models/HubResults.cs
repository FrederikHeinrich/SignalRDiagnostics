namespace SignalRDiagnostics.Models;

public sealed record PingResult(
    string ConnectionId,
    DateTimeOffset ServerTimestamp,
    string Message);

public sealed record PongResult(
    string ConnectionId,
    DateTimeOffset ServerTimestamp,
    string? ClientTimestamp,
    string Message);

public sealed record EchoResult(
    string ConnectionId,
    string Message,
    DateTimeOffset ServerTimestamp);

public sealed record BroadcastResult(
    string ConnectionId,
    string Message,
    int RecipientCount,
    DateTimeOffset ServerTimestamp);
