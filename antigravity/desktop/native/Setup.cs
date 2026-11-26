using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

internal static class Setup
{
    private const string Title = "Antigravity Usage Monitor";

    [STAThread]
    private static int Main(string[] args)
    {
        bool quiet = Array.Exists(args, arg => string.Equals(arg, "/quiet", StringComparison.OrdinalIgnoreCase));
        string staging = Path.Combine(Path.GetTempPath(), "antigravity-usage-monitor-" + Guid.NewGuid().ToString("N"));
        try
        {
            string runtime = FindRuntime();
            if (runtime == null)
                throw new InvalidOperationException("Open Antigravity Desktop once, then run setup again. A local Node.js 24 or newer also works.");
            Directory.CreateDirectory(staging);
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("UsageMonitor.zip"))
            using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                archive.ExtractToDirectory(staging);

            string script = Path.Combine(staging, "desktop", "install-plugin.js");
            RunNode(runtime, "\"" + script + "\" --prebuilt", 30000);
            if (!quiet)
                MessageBox.Show("Usage Monitor is installed. Reopen Antigravity and open a conversation.", Title,
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            if (!quiet) MessageBox.Show(error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            if (Directory.Exists(staging)) Directory.Delete(staging, true);
        }
    }

    private static string FindRuntime()
    {
        foreach (string candidate in RuntimeCandidates())
        {
            if (!File.Exists(candidate)) continue;
            try
            {
                int version;
                string output = RunNode(candidate, "-p \"process.versions.node.split('.')[0]\"", 5000);
                if (int.TryParse(output, out version) && version >= 24) return candidate;
            }
            catch (Win32Exception) { }
            catch (InvalidOperationException) { }
            catch (TimeoutException) { }
        }
        return null;
    }

    private static IEnumerable<string> RuntimeCandidates()
    {
        foreach (Process process in Process.GetProcessesByName("Antigravity"))
        {
            using (process)
            {
                string executable;
                try { executable = process.MainModule.FileName; }
                catch (Win32Exception) { continue; }
                catch (InvalidOperationException) { continue; }
                if (string.Equals(Path.GetFileName(executable), "Antigravity.exe", StringComparison.OrdinalIgnoreCase))
                {
                    yield return executable;
                    break;
                }
            }
        }
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs", "antigravity", "Antigravity.exe");
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Antigravity", "Antigravity.exe");
        foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            string directory = entry.Trim().Trim('"');
            if (Path.IsPathRooted(directory)) yield return Path.Combine(directory, "node.exe");
        }
    }

    private static string RunNode(string executable, string arguments, int timeout)
    {
        var start = new ProcessStartInfo(executable, arguments);
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        if (string.Equals(Path.GetFileName(executable), "Antigravity.exe", StringComparison.OrdinalIgnoreCase))
            start.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
        using (Process child = Process.Start(start))
        {
            var output = child.StandardOutput.ReadToEndAsync();
            var error = child.StandardError.ReadToEndAsync();
            if (!child.WaitForExit(timeout))
            {
                if (!child.HasExited) child.Kill();
                child.WaitForExit();
                throw new TimeoutException("The installation runtime timed out.");
            }
            if (child.ExitCode != 0)
            {
                string message = error.Result.Trim();
                throw new InvalidOperationException(message.Length == 0 ? "The installation runtime returned an error." : message);
            }
            return output.Result.Trim();
        }
    }
}
