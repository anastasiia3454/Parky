using Backend.Services;

// Der Server wird vorbereitet
var builder = WebApplication.CreateBuilder(args);

// Erlaubnis geben, dass die Webseite mit diesem Server reden darf (CORS)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowVercel", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
                {
                    // Lokale Entwicklung: localhost und 127.0.0.1 auf beliebigem Port (z. B. Live Server 5500, 5501)
                    if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                    {
                        if ((uri.Host == "localhost" || uri.Host == "127.0.0.1") &&
                            (uri.Scheme == "http" || uri.Scheme == "https"))
                        {
                            return true;
                        }
                    }
                    return origin == "https://parky-frontend.vercel.app";
                })
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Wichtige Werkzeuge anmelden: Internet-Verbindung (HTTP-Client) und Zwischenspeicher (Cache)
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

// Dem Server sagen, welche Controller und Arbeiter Services es gibt
builder.Services.AddControllers();
builder.Services.AddScoped<TransitService>();
builder.Services.AddScoped<TrafficService>();
builder.Services.AddScoped<ParkAndRideService>();

// Jetzt wird der Server zusammengebaut
var app = builder.Build();

// Regeln anwenden
app.UseCors("AllowVercel");
app.MapControllers();

//Der Server wird gestartet
app.Run();