namespace SignalRDiagnostics.Models;

public sealed class ClientInfo
{
    public string? ClientId { get; set; }

    public string? Role { get; set; }

    public string? PageUrl { get; set; }

    public string? UserAgent { get; set; }

    public string? TransportMode { get; set; }

    public string? AuthMode { get; set; }
}
