using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

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
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int length);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    private static volatile bool running = true;

    private static bool IsCodex(IntPtr window)
    {
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
            return file.IndexOf("\\OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) >= 0
                && (file.EndsWith("\\app\\Codex.exe", StringComparison.OrdinalIgnoreCase)
                    || file.EndsWith("\\app\\ChatGPT.exe", StringComparison.OrdinalIgnoreCase));
        }
        finally { CloseHandle(process); }
    }

    private static IntPtr FindCodex()
    {
        IntPtr selected = IntPtr.Zero;
        long largest = 0;
        EnumWindows(delegate(IntPtr window, IntPtr parameter)
        {
            Rect rect;
            if (IsWindowVisible(window) && GetWindow(window, 4) == IntPtr.Zero
                && IsCodex(window) && GetWindowRect(window, out rect))
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
        while (running)
        {
            IntPtr foreground = GetForegroundWindow();
            if (foreground != previousForeground)
            {
                previousForeground = foreground;
                if (foreground != IntPtr.Zero && foreground != host && GetWindow(foreground, 4) == IntPtr.Zero && IsCodex(foreground)) host = foreground;
            }
            if ((!IsWindow(host) || !IsWindowVisible(host)) && clock.ElapsedMilliseconds - lastSearch >= 1000)
            {
                host = FindCodex();
                lastSearch = clock.ElapsedMilliseconds;
            }
            uint foregroundPid;
            GetWindowThreadProcessId(foreground, out foregroundPid);
            Rect rect;
            string value;
            if (host != IntPtr.Zero && GetWindowRect(host, out rect))
            {
                uint pid;
                GetWindowThreadProcessId(host, out pid);
                value = "{\"found\":true,\"pid\":" + pid + ",\"handle\":\"" + host.ToInt64()
                    + "\",\"foregroundPid\":" + foregroundPid + ",\"active\":" + (foreground == host ? "true" : "false")
                    + ",\"minimized\":" + (IsIconic(host) ? "true" : "false")
                    + ",\"x\":" + rect.Left + ",\"y\":" + rect.Top + ",\"width\":" + (rect.Right - rect.Left)
                    + ",\"height\":" + (rect.Bottom - rect.Top) + "}";
            }
            else value = "{\"found\":false,\"foregroundPid\":" + foregroundPid + "}";
            if (value != previous) { Console.WriteLine(value); Console.Out.Flush(); previous = value; }
            Thread.Sleep(33);
        }
    }
}
