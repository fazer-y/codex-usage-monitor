using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;

internal static class NativeLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool sidecar = args.Contains("--sidecar");
        try {
            bool created;
            string identity = @"Local\AntigravityUsageMonitor-" + System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
            using (var mutex = new Mutex(true, identity, out created))
            using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, identity + "-show")) {
                if (!created) {
                    if (!sidecar) { show.Set(); return 0; }
                    // The previous overlay may still be releasing its pipe during a Sidecar reload.
                    try {
                        if (!mutex.WaitOne(5000)) {
                            Console.Error.WriteLine("The previous usage bar is still running.");
                            return 1;
                        }
                    } catch (AbandonedMutexException) { }
                }
                try {
                    var app = new Application();
                    var window = new MonitorWindow(args.Contains("--show"));
                    var waiter = ThreadPool.RegisterWaitForSingleObject(show, delegate {
                        window.Dispatcher.BeginInvoke(new Action(window.Reveal));
                    }, null, Timeout.Infinite, false);
                    try { app.Run(window); }
                    finally { waiter.Unregister(null); }
                } finally { mutex.ReleaseMutex(); }
            }
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}

internal static class Json
{
    private static readonly ThreadLocal<JavaScriptSerializer> Serializer = new ThreadLocal<JavaScriptSerializer>(
        () => new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 });
    internal static Dictionary<string, object> Decode(string value) { return Serializer.Value.Deserialize<Dictionary<string, object>>(value); }
    internal static string Encode(object value) { return Serializer.Value.Serialize(value); }
    internal static Dictionary<string, object> Map(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
    internal static object Get(Dictionary<string, object> data, string key) { object value; return data.TryGetValue(key, out value) ? value : null; }
    internal static string Text(Dictionary<string, object> data, string key, string fallback = "") { object value = Get(data, key); return value == null ? fallback : Convert.ToString(value); }
    internal static double Number(Dictionary<string, object> data, string key, double fallback = 0) { object value = Get(data, key); return value == null ? fallback : Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture); }
    internal static bool Flag(Dictionary<string, object> data, string key) { return Get(data, key) is bool && (bool)Get(data, key); }
}
