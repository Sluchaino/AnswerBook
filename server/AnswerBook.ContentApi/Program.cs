using System.Text.RegularExpressions;

var builder = WebApplication.CreateBuilder(args);
var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["https://localhost", "http://localhost", "http://localhost:5173", "http://127.0.0.1:5173"];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(origins).WithMethods("GET", "HEAD").AllowAnyHeader()));
var app = builder.Build();
app.UseCors();
var root = Path.GetFullPath(builder.Configuration["ContentDirectory"]
    ?? Path.Combine(app.Environment.ContentRootPath, "content"));

app.MapGet("/health", () => Results.Ok(new { status = "ok", catalogReady = File.Exists(Path.Combine(root, "catalog.json")) }));
app.MapMethods("/api/catalog", ["GET", "HEAD"], (HttpContext context) =>
{
    var path = Path.Combine(root, "catalog.json");
    context.Response.Headers.CacheControl = "no-cache";
    return File.Exists(path) ? Results.File(path, "application/json; charset=utf-8")
        : Results.Problem("Course catalog has not been published.", statusCode: 503);
});
app.MapMethods("/api/courses/{file}", ["GET", "HEAD"], (HttpContext context, string file) =>
{
    if (!Regex.IsMatch(file, @"^[a-z0-9][a-z0-9-]{0,119}-v[1-9][0-9]*-[a-f0-9]{64}\.json$"))
        return Results.NotFound();
    var path = Path.Combine(root, "courses", file);
    if (!File.Exists(path)) return Results.NotFound();
    context.Response.Headers.CacheControl = "public,max-age=31536000,immutable";
    return Results.File(path, "application/json; charset=utf-8", enableRangeProcessing: true);
});
app.MapAuthoring();
app.Run();
