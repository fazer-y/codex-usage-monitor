using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using Microsoft.Win32;

internal static class NativeLauncher
{
    internal static readonly string Executable = Assembly.GetExecutingAssembly().Location;
    internal static readonly string UserData = Environment.GetEnvironmentVariable("CODEX_USAGE_MONITOR_USER_DATA")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Codex Usage Monitor");
    private static string source;
    internal static string Source { get { return source ?? (source = FindSource()); } }

    [STAThread]
    private static int Main(string[] args)
    {
        bool cli = args.Contains("--mcp") || args.Contains("--setup") || args.Contains("--remove") || args.Contains("--check-runtime") || args.Contains("--stop-installed");
        try {
            if (args.Contains("--stop-installed")) {
                int index = Array.IndexOf(args, "--stop-installed");
                string target = Path.GetFullPath(Path.Combine(args[index + 1], "Codex Usage Monitor.exe"));
                foreach (var process in Process.GetProcessesByName("Codex Usage Monitor")) {
                    using (process) try {
                        if (String.Equals(process.MainModule.FileName, target, StringComparison.OrdinalIgnoreCase)) {
                            process.Kill(); process.WaitForExit(5000);
                        }
                    } catch (InvalidOperationException) { }
                }
                return 0;
            }
            string node = FindNode();
            if (args.Contains("--check-runtime")) { Console.WriteLine(Json.Encode(new { node = node })); return 0; }
            if (cli) {
                string script = args.Contains("--mcp") ? "mcp-server.js" : "codex-integration.js";
                var childArgs = new List<string> { Path.Combine(Source, "desktop", script) };
                if (args.Contains("--remove")) childArgs.Add("--remove");
                using (var child = Process.Start(NodeProcess(node, childArgs))) {
                    Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream).ContinueWith(task => {
                        try { child.StandardInput.Close(); } catch (InvalidOperationException) { } catch (IOException) { }
                    });
                    Task output = Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput());
                    Task error = Pump(child.StandardError.BaseStream, Console.OpenStandardError());
                    child.WaitForExit(); Task.WaitAll(output, error);
                    return child.ExitCode;
                }
            }
            bool created;
            string identity = "Local\\CodexUsageMonitor-" + System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
            using (var mutex = new Mutex(true, identity, out created))
            using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, identity + "-show")) {
                if (!created) { if (!args.Contains("--managed")) show.Set(); return 0; }
                var app = new Application();
                var window = new MonitorWindow(node, args);
                var waiter = ThreadPool.RegisterWaitForSingleObject(show, delegate {
                    window.Dispatcher.BeginInvoke(new Action(window.Reveal));
                }, null, Timeout.Infinite, false);
                try { app.Run(window); }
                finally { waiter.Unregister(null); mutex.ReleaseMutex(); }
            }
            return 0;
        } catch (Exception error) {
            if (cli) Console.Error.WriteLine(error.Message);
            else MessageBox.Show(error.Message, "Codex Usage Monitor", MessageBoxButton.OK, MessageBoxImage.Error);
            return 1;
        }
    }

    private static async Task Pump(Stream source, Stream target)
    {
        var buffer = new byte[16384];
        int count;
        while ((count = await source.ReadAsync(buffer, 0, buffer.Length)) > 0) {
            await target.WriteAsync(buffer, 0, count);
            await target.FlushAsync();
        }
    }

    private static string FindSource()
    {
        string root = Path.GetDirectoryName(Executable);
        string installed = Path.Combine(root, "app");
        if (File.Exists(Path.Combine(installed, "desktop", "native-main.js"))) return installed;
        for (var directory = new DirectoryInfo(root); directory != null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "desktop", "native-main.js"))) return directory.FullName;
        throw new FileNotFoundException("The statistics backend was not found. Run the installer again.");
    }

    private static bool SupportedNode(string file)
    {
        if (String.IsNullOrEmpty(file) || !File.Exists(file)) return false;
        try {
            using (var child = Process.Start(new ProcessStartInfo(file, "--version") {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
            })) {
                if (!child.WaitForExit(3000)) { child.Kill(); return false; }
                string version = child.StandardOutput.ReadToEnd().Trim().TrimStart('v');
                Version value;
                return Version.TryParse(version, out value) && (value.Major > 24 || value.Major == 24 && value.Minor >= 5);
            }
        } catch { return false; }
    }

    internal static string FindNode()
    {
        string cached = Path.Combine(UserData, "node-path.txt");
        var candidates = new List<string>();
        candidates.Add(Environment.GetEnvironmentVariable("CODEX_USAGE_MONITOR_NODE"));
        try { candidates.Add(File.ReadAllText(cached).Trim()); } catch (IOException) { }
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            if (!String.IsNullOrWhiteSpace(directory)) candidates.Add(Path.Combine(directory.Trim('"'), "node.exe"));
        string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string cache = Path.Combine(profile, ".cache", "codex-runtimes");
        if (Directory.Exists(cache)) foreach (string directory in Directory.GetDirectories(cache))
            candidates.Add(Path.Combine(directory, "dependencies", "node", "bin", "node.exe"));
        string runtimes = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenAI", "Codex", "runtimes", "cua_node");
        if (Directory.Exists(runtimes)) foreach (string directory in Directory.GetDirectories(runtimes)) {
            candidates.Add(Path.Combine(directory, "bin", "node.exe"));
            candidates.Add(Path.Combine(directory, "node.exe"));
        }
        foreach (string candidate in candidates.Where(value => !String.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase)) {
            if (!SupportedNode(candidate)) continue;
            Directory.CreateDirectory(UserData); File.WriteAllText(cached, candidate, new UTF8Encoding(false));
            return candidate;
        }
        throw new InvalidOperationException("Node.js 24.5 or later is required. Install it from https://nodejs.org/ and reopen Codex Usage Monitor.");
    }

    internal static string Quote(string value)
    {
        return "\"" + System.Text.RegularExpressions.Regex.Replace(value, "(\\\\*)\"", "$1$1\\\"")
            .TrimEnd('\\') + new string('\\', value.Reverse().TakeWhile(c => c == '\\').Count() * 2) + "\"";
    }

    internal static ProcessStartInfo NodeProcess(string node, IEnumerable<string> args)
    {
        var info = new ProcessStartInfo(node, String.Join(" ", new string[] { "--use-env-proxy" }.Concat(args).Select(Quote))) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = Source,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        info.EnvironmentVariables["CODEX_USAGE_MONITOR_EXECUTABLE"] = Executable;
        info.EnvironmentVariables["CODEX_USAGE_MONITOR_USER_DATA"] = UserData;
        if (String.IsNullOrEmpty(info.EnvironmentVariables["HTTPS_PROXY"])) {
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings")) {
                if (key != null && Convert.ToInt32(key.GetValue("ProxyEnable", 0)) == 1) {
                    string proxy = Convert.ToString(key.GetValue("ProxyServer", ""));
                    if (proxy.Contains("=")) proxy = proxy.Split(';').FirstOrDefault(value => value.StartsWith("https=", StringComparison.OrdinalIgnoreCase)) ?? proxy.Split(';')[0];
                    if (proxy.Contains("=")) proxy = proxy.Substring(proxy.IndexOf('=') + 1);
                    if (!String.IsNullOrWhiteSpace(proxy)) {
                        info.EnvironmentVariables["HTTPS_PROXY"] = proxy.Contains("://") ? proxy : "http://" + proxy;
                        info.EnvironmentVariables["HTTP_PROXY"] = info.EnvironmentVariables["HTTPS_PROXY"];
                    }
                }
            }
        }
        return info;
    }
}

internal static class Json
{
    private static readonly ThreadLocal<JavaScriptSerializer> Serializer = new ThreadLocal<JavaScriptSerializer>(() => new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 });
    internal static Dictionary<string, object> Decode(string value) { return Serializer.Value.Deserialize<Dictionary<string, object>>(value); }
    internal static string Encode(object value) { return Serializer.Value.Serialize(value); }
    internal static Dictionary<string, object> Map(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
    internal static object Get(Dictionary<string, object> data, string key) { object value; return data.TryGetValue(key, out value) ? value : null; }
    internal static string Text(Dictionary<string, object> data, string key, string fallback = "") { return Convert.ToString(Get(data, key)) ?? fallback; }
    internal static double Number(Dictionary<string, object> data, string key, double fallback = 0) { object value = Get(data, key); return value == null ? fallback : Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture); }
    internal static bool Flag(Dictionary<string, object> data, string key) { return Get(data, key) is bool && (bool)Get(data, key); }
}
