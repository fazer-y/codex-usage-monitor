using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class WindowObserver
{
    private delegate bool EnumWindowProc(IntPtr window, IntPtr parameter);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int length);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    private static volatile bool running = true;

    private static bool IsAntigravity(IntPtr window)
    {
        var className = new StringBuilder(64);
        GetClassName(window, className, className.Capacity);
        if (!String.Equals(className.ToString(), "Chrome_WidgetWin_1", StringComparison.Ordinal)) return false;
        uint pid;
        GetWindowThreadProcessId(window, out pid);
        IntPtr process = OpenProcess(0x1000, false, pid);
        if (process == IntPtr.Zero) return false;
        try
        {
            int length = 2048;
            var image = new StringBuilder(length);
            if (!QueryFullProcessImageName(process, 0, image, ref length)) return false;
            string file = image.ToString();
            return file.EndsWith("\\Antigravity.exe", StringComparison.OrdinalIgnoreCase)
                && System.IO.File.Exists(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(file), "resources", "bin", "language_server.exe"));
        }
        finally { CloseHandle(process); }
    }

    private static IntPtr FindAntigravity()
    {
        IntPtr selected = IntPtr.Zero;
        long largest = 0;
        EnumWindows(delegate(IntPtr window, IntPtr parameter)
        {
            Rect rect;
            if (IsWindowVisible(window) && GetWindow(window, 4) == IntPtr.Zero
                && IsAntigravity(window) && GetWindowRect(window, out rect))
            {
                long area = (long)(rect.Right - rect.Left) * (rect.Bottom - rect.Top);
                if (area > largest) { selected = window; largest = area; }
            }
            return true;
        }, IntPtr.Zero);
        return selected;
    }

    private static void Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
        catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
        ThreadPool.QueueUserWorkItem(delegate
        {
            try { while (Console.ReadLine() != null) { } } catch { }
            running = false;
        });
        IntPtr host = IntPtr.Zero;
        IntPtr previousForeground = IntPtr.Zero;
        string previous = null;
        long lastSearch = -1000;
        var clock = Stopwatch.StartNew();
        var title = new StringBuilder(512);
        var serializer = new JavaScriptSerializer();
        while (running)
        {
            IntPtr foreground = GetForegroundWindow();
            if (foreground != previousForeground)
            {
                previousForeground = foreground;
                if (foreground != IntPtr.Zero && foreground != host && GetWindow(foreground, 4) == IntPtr.Zero && IsAntigravity(foreground)) host = foreground;
            }
            if ((!IsWindow(host) || !IsWindowVisible(host)) && clock.ElapsedMilliseconds - lastSearch >= 1000)
            {
                host = FindAntigravity();
                lastSearch = clock.ElapsedMilliseconds;
            }
            uint foregroundPid;
            GetWindowThreadProcessId(foreground, out foregroundPid);
            Rect rect;
            string value;
            if (host != IntPtr.Zero && IsWindowVisible(host) && GetWindowRect(host, out rect))
            {
                uint pid;
                GetWindowThreadProcessId(host, out pid);
                var monitor = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
                GetMonitorInfo(MonitorFromWindow(host, 2), ref monitor);
                uint dpi = 96; try { dpi = GetDpiForWindow(host); } catch (EntryPointNotFoundException) { }
                title.Clear();
                GetWindowText(host, title, title.Capacity);
                value = "{\"found\":true,\"pid\":" + pid + ",\"handle\":\"" + host.ToInt64()
                    + "\",\"foregroundPid\":" + foregroundPid + ",\"active\":" + (foreground == host ? "true" : "false")
                    + ",\"title\":" + serializer.Serialize(title.ToString())
                    + ",\"minimized\":" + (IsIconic(host) ? "true" : "false")
                    + ",\"x\":" + rect.Left + ",\"y\":" + rect.Top + ",\"width\":" + (rect.Right - rect.Left)
                    + ",\"height\":" + (rect.Bottom - rect.Top) + ",\"scale\":" + (dpi / 96.0).ToString(System.Globalization.CultureInfo.InvariantCulture)
                    + ",\"workArea\":{\"x\":" + monitor.Work.Left + ",\"y\":" + monitor.Work.Top
                    + ",\"width\":" + (monitor.Work.Right - monitor.Work.Left) + ",\"height\":" + (monitor.Work.Bottom - monitor.Work.Top) + "}}";
            }
            else value = "{\"found\":false,\"foregroundPid\":" + foregroundPid + "}";
            if (value != previous) { Console.WriteLine(value); Console.Out.Flush(); previous = value; }
            Thread.Sleep(100);
        }
    }
}
