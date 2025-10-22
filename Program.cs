using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using System;
using System.Net.Http;

var builder = WebAssemblyHostBuilder.CreateDefault(args);


builder.RootComponents.Add<global::PhantomAirInvite.App>("#app");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
await builder.Build().RunAsync();
