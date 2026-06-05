using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.SignalR;
using SignalRDiagnostics.Hubs;
using SignalRDiagnostics.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
        | ForwardedHeaders.XForwardedProto
        | ForwardedHeaders.XForwardedHost;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("DiagnosticsCors", policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddSingleton<ConnectionTracker>();
builder.Services.AddHostedService<ServerDiagnosticsWorker>();
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.KeepAliveInterval = TimeSpan.FromSeconds(5);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(20);
    options.HandshakeTimeout = TimeSpan.FromSeconds(15);
    options.MaximumReceiveMessageSize = 128 * 1024;
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseStaticFiles();
app.UseCors("DiagnosticsCors");

app.MapGet("/", () => Results.Redirect("client"));
app.MapGet("/client", () => HtmlPage(app, "client.html"));
app.MapGet("/monitor", () => HtmlPage(app, "monitor.html"));
app.MapGet("/testHub/negotiate", async (
    HttpContext context,
    ConnectionTracker tracker,
    IHubContext<TestHub> hubContext) =>
{
    var requestDiagnostics = RequestDiagnosticsBuilder.From(context);
    var hubEvent = tracker.RecordHttpRequest(
        "negotiate",
        context.TraceIdentifier,
        requestDiagnostics?.RemoteIpAddress ?? "http-client",
        "Diagnostic negotiate requested",
        requestDiagnostics);

    await hubContext.Clients.Group(HubGroups.Monitors).SendAsync("ServerEvent", hubEvent);
    await hubContext.Clients.Group(HubGroups.Monitors).SendAsync("MonitorUpdate", tracker.GetSnapshot());

    return Results.Json(new
    {
        diagnosticOnly = true,
        negotiateVersion = context.Request.Query["negotiateVersion"].ToString(),
        connectionId = Guid.NewGuid().ToString("N"),
        url = $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}/testHub",
        availableTransports = new[]
        {
            new
            {
                transport = "WebSockets",
                transferFormats = new[] { "Text", "Binary" }
            },
            new
            {
                transport = "ServerSentEvents",
                transferFormats = new[] { "Text" }
            },
            new
            {
                transport = "LongPolling",
                transferFormats = new[] { "Text", "Binary" }
            }
        }
    });
}).RequireCors("DiagnosticsCors");
app.MapHub<TestHub>("/testHub").RequireCors("DiagnosticsCors");

app.MapGet("/api/health", (ConnectionTracker tracker) =>
{
    var snapshot = tracker.GetSnapshot();

    return Results.Json(new
    {
        status = "ok",
        time = DateTimeOffset.UtcNow,
        activeConnections = snapshot.CurrentConnections,
        totalConnections = snapshot.TotalConnections,
        totalDisconnects = snapshot.TotalDisconnects
    });
});

app.Run();

static IResult HtmlPage(WebApplication app, string fileName)
{
    var webRoot = app.Environment.WebRootPath
        ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
    var path = Path.Combine(webRoot, fileName);

    return File.Exists(path)
        ? Results.File(path, "text/html; charset=utf-8")
        : Results.NotFound($"{fileName} was not found.");
}
