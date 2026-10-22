using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Automation;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

internal sealed class MonitorWindow : Window
{
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    private Process backend;
    private StreamWriter input;
    private IntPtr handle;
    private bool stopping, dragging, expanded, folded, docked = true, detailsBelow = true;
    private Brush surface, ink, muted, accent, line, soft;
    private Dictionary<string, object> colors = new Dictionary<string, object>();
    private Dictionary<string, object> labels = new Dictionary<string, object>();
    private Dictionary<string, object> latest;
    private readonly Border panel = new Border();
    private readonly Grid layout = new Grid();
    private readonly Grid strip = new Grid();
    private readonly StackPanel model = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
    private readonly StackPanel metrics = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
    private readonly StackPanel actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
    private readonly StackPanel rows = new StackPanel();
    private readonly Border details = new Border();
    private readonly TextBlock title = new TextBlock(), effort = new TextBlock(), conversation = new TextBlock(), footer = new TextBlock(), cost = new TextBlock();
    private readonly Border effortBadge = new Border();
    private readonly List<Metric> metricItems = new List<Metric>();
    private FrameworkElement bolt, status;
    private Button dockButton, expandButton, foldButton, restoreButton, refreshButton;
    private string lastDetails = "";
    private readonly DispatcherTimer elapsedTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };

    internal MonitorWindow(string node, string[] args)
    {
        Title = "Codex Usage Monitor";
        Width = 760; Height = 40; MinWidth = 1; MinHeight = 1;
        WindowStyle = WindowStyle.None; ResizeMode = ResizeMode.NoResize;
        AllowsTransparency = true; Background = Brushes.Transparent; ShowInTaskbar = false; ShowActivated = false;
        FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI"); FontSize = 11;
        UseLayoutRounding = true; SnapsToDevicePixels = true;
        TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
        SetColors(); BuildControls();
        SourceInitialized += delegate {
            handle = new WindowInteropHelper(this).Handle;
        };
        Loaded += delegate { StartBackend(node, args); };
        Activated += delegate { Send("focus", true); };
        Deactivated += delegate { Send("focus", false); };
        SizeChanged += delegate { AdaptMetrics(); };
        Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e) {
            if (!stopping) { e.Cancel = true; Send("folded", true); }
        };
        Closed += delegate { elapsedTimer.Stop(); if (backend != null && !backend.HasExited) { try { backend.StandardInput.Close(); if (!backend.WaitForExit(4000)) backend.Kill(); } catch (InvalidOperationException) { } } };
        elapsedTimer.Tick += delegate { UpdateElapsed(); };
        elapsedTimer.Start();
    }

    private void StartBackend(string node, string[] args)
    {
        var childArgs = new List<string> { System.IO.Path.Combine(NativeLauncher.Source, "desktop", "native-main.js") };
        childArgs.AddRange(args.Where(value => value == "--managed" || value == "--show"));
        backend = new Process { StartInfo = NativeLauncher.NodeProcess(node, childArgs), EnableRaisingEvents = true };
        backend.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
            if (e.Data == null || e.Data.Length > 4 * 1024 * 1024) return;
            try { var value = Json.Decode(e.Data); Dispatcher.BeginInvoke(new Action(() => Receive(value))); }
            catch (ArgumentException) { }
        };
        backend.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) {
            if (String.IsNullOrWhiteSpace(e.Data)) return;
            try { Directory.CreateDirectory(NativeLauncher.UserData); File.AppendAllText(System.IO.Path.Combine(NativeLauncher.UserData, "native.log"), DateTime.UtcNow.ToString("o") + " " + e.Data + Environment.NewLine); } catch (IOException) { }
        };
        backend.Exited += delegate { Dispatcher.BeginInvoke(new Action(() => { stopping = true; Close(); })); };
        backend.Start(); input = backend.StandardInput; input.AutoFlush = true;
        backend.BeginOutputReadLine(); backend.BeginErrorReadLine();
        double scale = Scale();
        var screen = Forms.Screen.FromHandle(handle).WorkingArea;
        bool systemDark = false;
        using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
            if (key != null) systemDark = Convert.ToInt32(key.GetValue("AppsUseLightTheme", 1)) == 0;
        Send(new { method = "ready", data = new { pid = Process.GetCurrentProcess().Id, scale = scale,
            locale = CultureInfo.CurrentUICulture.Name, systemDark = systemDark,
            workArea = new { x = screen.X, y = screen.Y, width = screen.Width, height = screen.Height } } });
    }

    private double Scale() { try { return GetDpiForWindow(handle) / 96.0; } catch (EntryPointNotFoundException) { return PresentationSource.FromVisual(this).CompositionTarget.TransformToDevice.M11; } }
    private void Send(string method, object value = null) { Send(new { method = method, value = value }); }
    private void Send(object value) { if (input != null && !stopping) try { input.WriteLine(Json.Encode(value)); } catch (IOException) { } catch (ObjectDisposedException) { } }
    private string T(string key, string fallback) { string value = Json.Text(labels, key); return value.Length == 0 ? fallback : value; }

    internal void Reveal()
    {
        Send("show"); Show(); Activate();
    }

    private void Receive(Dictionary<string, object> value)
    {
        var data = Json.Map(Json.Get(value, "data"));
        switch (Json.Text(value, "event")) {
            case "theme":
                colors = Json.Map(Json.Get(data, "colors")); labels = Json.Map(Json.Get(data, "labels"));
                SetColors(); ApplyColors(); BuildContextMenu(); if (latest != null) Render(latest); break;
            case "snapshot": latest = data; if (!folded) Render(data); break;
            case "window": ApplyWindow(data); break;
            case "quit": stopping = true; Close(); break;
        }
    }

    private Brush Color(string key, string fallback)
    {
        string value = Json.Text(colors, key); if (value.Length == 0) value = fallback;
        if (value.Length == 9) value = "#" + value.Substring(7, 2) + value.Substring(1, 6);
        return (Brush)new BrushConverter().ConvertFromString(value);
    }

    private void SetColors()
    {
        surface = Color("surfaceFill", "#fafced"); ink = Color("text", "#3f453b"); muted = Color("muted", "#90978a");
        accent = Color("accentText", "#798d38"); line = Color("line", "#e6ebd2"); soft = Color("accentSoft", "#eef2db");
    }

    private void BuildControls()
    {
        panel.CornerRadius = new CornerRadius(9); panel.BorderThickness = new Thickness(1); panel.Margin = new Thickness(2);
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(34) });
        layout.RowDefinitions.Add(new RowDefinition());
        strip.Margin = new Thickness(7, 0, 7, 0);
        strip.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); strip.ColumnDefinitions.Add(new ColumnDefinition()); strip.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var grip = new Canvas { Width = 8, Height = 16, Margin = new Thickness(0, 0, 5, 0) };
        foreach (double x in new double[] { 1, 5 }) foreach (double y in new double[] { 2, 7, 12 }) {
            var dot = new Ellipse { Width = 2, Height = 2, Fill = muted }; Canvas.SetLeft(dot, x); Canvas.SetTop(dot, y); grip.Children.Add(dot);
        }
        model.Children.Add(grip);
        status = new Ellipse { Width = 5, Height = 5, Fill = accent, Margin = new Thickness(0, 0, 5, 0), VerticalAlignment = VerticalAlignment.Center }; model.Children.Add(status);
        title.FontSize = 10; title.VerticalAlignment = VerticalAlignment.Center; title.Text = "Waiting for a conversation"; title.Margin = new Thickness(0, 0, 5, 0); model.Children.Add(title);
        effort.FontSize = 9; effortBadge.CornerRadius = new CornerRadius(4); effortBadge.Padding = new Thickness(4, 1, 4, 1); effortBadge.Child = effort; effortBadge.Visibility = Visibility.Collapsed; model.Children.Add(effortBadge);
        bolt = Glyph("M13,2 L4,14 L11,14 L10,22 L20,10 L13,10 Z", accent, 12, 14); bolt.Margin = new Thickness(5, 0, 0, 0); bolt.Visibility = Visibility.Collapsed; model.Children.Add(bolt);
        metrics.HorizontalAlignment = HorizontalAlignment.Center; Grid.SetColumn(metrics, 1);
        dockButton = Button("M16,9 L16,4 L17,3 L7,3 L8,4 L8,9 L5,12 L5,14 L19,14 L19,12 Z M12,14 L12,21", () => Send("docked", !docked));
        expandButton = Button("M7,10 L12,15 L17,10", () => Send("expanded"));
        foldButton = Button("M9,6 L15,12 L9,18", () => Send("folded", true));
        actions.Children.Add(dockButton); actions.Children.Add(expandButton); actions.Children.Add(foldButton); Grid.SetColumn(actions, 2);
        strip.Children.Add(model); strip.Children.Add(metrics); strip.Children.Add(actions);
        restoreButton = Button("M15,6 L9,12 L15,18", () => Send("folded", false)); restoreButton.Width = Double.NaN; restoreButton.Height = Double.NaN;
        var body = new DockPanel { Margin = new Thickness(13, 10, 13, 8) };
        var header = new DockPanel { Margin = new Thickness(0, 0, 0, 7) };
        refreshButton = Button("M20,7 L20,12 L15,12 M4,17 L4,12 L9,12 M5.6,7 A7,7 0 0 1 17.2,6 L20,9 M4,15 L6.8,18 A7,7 0 0 0 18.4,17", () => Send("refresh"));
        DockPanel.SetDock(refreshButton, Dock.Right); header.Children.Add(refreshButton);
        conversation.FontSize = 12; conversation.FontWeight = FontWeights.SemiBold; conversation.TextTrimming = TextTrimming.CharacterEllipsis; conversation.VerticalAlignment = VerticalAlignment.Center; header.Children.Add(conversation);
        DockPanel.SetDock(header, Dock.Top); body.Children.Add(header);
        var bottom = new StackPanel { Margin = new Thickness(0, 8, 0, 0) }; cost.FontSize = 10; footer.FontSize = 10; footer.TextWrapping = TextWrapping.Wrap; bottom.Children.Add(cost); bottom.Children.Add(footer);
        DockPanel.SetDock(bottom, Dock.Bottom); body.Children.Add(bottom);
        body.Children.Add(new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = rows });
        details.Child = body; details.Visibility = Visibility.Collapsed;
        Grid.SetRow(details, 1); layout.Children.Add(strip); layout.Children.Add(details); panel.Child = layout; Content = panel;
        panel.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e) {
            if (expanded && IsWithin(e.OriginalSource as DependencyObject, details)) return;
            DependencyObject item = e.OriginalSource as DependencyObject;
            while (item != null) { if (item is Button || item is TextBox) return; item = FindParentElement(item); }
            dragging = true;
            try { DragMove(); } finally {
                dragging = false; NativeRect bounds; GetWindowRect(handle, out bounds);
                Send(new { method = "dragged", data = new { scale = Scale(), bounds = new { x = bounds.Left, y = bounds.Top, width = bounds.Right - bounds.Left, height = bounds.Bottom - bounds.Top } } });
            }
        };
        ApplyColors();
    }

    private static DependencyObject FindParentElement(DependencyObject value) { return value is Visual || value is System.Windows.Media.Media3D.Visual3D ? VisualTreeHelper.GetParent(value) : LogicalTreeHelper.GetParent(value); }
    private static bool IsWithin(DependencyObject item, DependencyObject container) { while (item != null) { if (item == container) return true; item = FindParentElement(item); } return false; }
    private static FrameworkElement Glyph(string geometry, Brush brush, double width, double height)
    {
        return new Viewbox { Width = width, Height = height, Child = new System.Windows.Shapes.Path { Data = Geometry.Parse(geometry), Stroke = brush, StrokeThickness = 1.6, StrokeLineJoin = PenLineJoin.Round, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round } };
    }
    private Button Button(string geometry, Action action)
    {
        var button = new Button { Width = 22, Height = 24, Padding = new Thickness(3), BorderThickness = new Thickness(), Background = Brushes.Transparent, Content = Glyph(geometry, muted, 14, 14) };
        var template = new ControlTemplate(typeof(Button));
        var border = new FrameworkElementFactory(typeof(Border)); border.SetValue(Border.CornerRadiusProperty, new CornerRadius(5)); border.SetValue(Border.BackgroundProperty, Brushes.Transparent);
        border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
        var presenter = new FrameworkElementFactory(typeof(ContentPresenter)); presenter.SetValue(HorizontalAlignmentProperty, HorizontalAlignment.Center); presenter.SetValue(VerticalAlignmentProperty, VerticalAlignment.Center); border.AppendChild(presenter); template.VisualTree = border;
        button.MouseEnter += delegate { button.Background = soft; }; button.MouseLeave += delegate { button.Background = Brushes.Transparent; };
        button.Template = template; button.Click += delegate { action(); }; return button;
    }

    private void ApplyColors()
    {
        panel.Background = surface; panel.BorderBrush = line; title.Foreground = ink; effort.Foreground = accent; effortBadge.Background = soft;
        conversation.Foreground = ink; footer.Foreground = muted; cost.Foreground = muted;
        details.BorderBrush = line; details.BorderThickness = detailsBelow ? new Thickness(0, 1, 0, 0) : new Thickness(0, 0, 0, 1);
        SetGlyphColor(bolt, accent); foreach (Button button in new[] { dockButton, expandButton, foldButton, restoreButton, refreshButton }) if (button != null) SetGlyphColor(button.Content as FrameworkElement, button == dockButton && docked ? accent : muted);
        dockButton.ToolTip = T(docked ? "detach" : "dockTitlebar", "Dock"); expandButton.ToolTip = T(expanded ? "collapseDetails" : "expandDetails", "Details");
        foldButton.ToolTip = T("foldStrip", "Fold strip"); restoreButton.ToolTip = T("expandStrip", "Expand strip"); refreshButton.ToolTip = T("refresh", "Refresh"); bolt.ToolTip = T("fastMode", "Fast mode enabled");
        AutomationProperties.SetName(dockButton, Convert.ToString(dockButton.ToolTip)); AutomationProperties.SetName(expandButton, Convert.ToString(expandButton.ToolTip)); AutomationProperties.SetName(foldButton, Convert.ToString(foldButton.ToolTip)); AutomationProperties.SetName(restoreButton, Convert.ToString(restoreButton.ToolTip));
    }
    private static void SetGlyphColor(FrameworkElement glyph, Brush color) { var view = glyph as Viewbox; if (view != null) ((System.Windows.Shapes.Path)view.Child).Stroke = color; }

    private void Render(Dictionary<string, object> value)
    {
        if (folded) return;
        title.Text = Json.Text(value, "title"); title.ToolTip = title.Text;
        string level = Json.Text(value, "subtitle"); effort.Text = level.Length > 0 ? Char.ToUpperInvariant(level[0]) + level.Substring(1) : "";
        if (level == "xhigh") effort.Text = "XHigh";
        effortBadge.Visibility = level.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        bolt.Visibility = Json.Flag(value, "fastMode") ? Visibility.Visible : Visibility.Collapsed;
        ((Ellipse)status).Fill = Json.Text(value, "status") == "ready" ? accent : muted;
        var values = (Json.Get(value, "metrics") as IEnumerable) ?? new object[0];
        var list = values.Cast<object>().Select(Json.Map).ToList();
        if (metricItems.Count != list.Count || metricItems.Where((item, index) => item.Kind != Json.Text(list[index], "kind")).Any()) {
            metrics.Children.Clear(); metricItems.Clear();
            foreach (var item in list) { var metric = new Metric(Json.Text(item, "kind")); metricItems.Add(metric); metrics.Children.Add(metric.Panel); }
        }
        for (int index = 0; index < list.Count; index++) {
            var item = list[index]; var metric = metricItems[index];
            metric.Name.Text = Json.Text(item, "label"); metric.Name.Foreground = muted; metric.Name.Margin = new Thickness(0, 0, metric.Name.Text.Length == 0 ? 0 : 4, 0);
            metric.Value.Text = Json.Text(item, "value"); metric.Value.Foreground = metric.Kind == "cache" ? accent : ink; metric.Panel.ToolTip = Json.Text(item, "description");
        }
        AdaptMetrics(); if (expanded) RenderDetails();
    }

    private void RenderDetails()
    {
        if (latest == null) return;
        string signature = Json.Encode(new object[] { Json.Get(latest, "conversationTitle"), Json.Get(latest, "rows"), Json.Get(latest, "cost"), Json.Get(latest, "footer"), Json.Encode(colors) });
        if (signature == lastDetails) return; lastDetails = signature;
        conversation.Text = Json.Text(latest, "conversationTitle", "Current conversation"); cost.Text = Json.Text(latest, "cost"); footer.Text = Json.Text(latest, "footer"); rows.Children.Clear();
        foreach (object item in (Json.Get(latest, "rows") as IEnumerable) ?? new object[0]) {
            var data = Json.Map(item); var row = new Grid { Margin = new Thickness(0, 4, 0, 4) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(78) }); row.ColumnDefinitions.Add(new ColumnDefinition());
            row.Children.Add(new TextBlock { Text = Json.Text(data, "label"), Foreground = muted, TextWrapping = TextWrapping.Wrap });
            var text = new TextBlock { Text = Json.Text(data, "value"), Foreground = ink, TextWrapping = TextWrapping.Wrap }; Grid.SetColumn(text, 1); row.Children.Add(text); rows.Children.Add(row);
        }
    }

    private void AdaptMetrics()
    {
        if (folded) return;
        model.Measure(new Size(Double.PositiveInfinity, 34));
        double budget = Math.Max(0, ActualWidth - model.DesiredSize.Width - 92), used = 0; bool full = false;
        foreach (var item in metricItems) {
            item.Panel.Visibility = Visibility.Visible; item.Panel.Measure(new Size(Double.PositiveInfinity, 34));
            used += item.Panel.DesiredSize.Width; full = full || used > budget;
            item.Panel.Visibility = full ? Visibility.Collapsed : Visibility.Visible;
        }
    }

    private void ApplyWindow(Dictionary<string, object> data)
    {
        bool wasFolded = folded; folded = Json.Flag(data, "folded"); expanded = Json.Flag(data, "expanded"); docked = Json.Flag(data, "docked"); detailsBelow = Json.Flag(data, "detailsBelow");
        panel.Child = folded ? (UIElement)restoreButton : layout;
        details.Visibility = expanded && !folded ? Visibility.Visible : Visibility.Collapsed;
        Grid.SetRow(strip, detailsBelow ? 0 : 1); Grid.SetRow(details, detailsBelow ? 1 : 0);
        layout.RowDefinitions[0].Height = detailsBelow ? new GridLength(34) : new GridLength(1, GridUnitType.Star);
        layout.RowDefinitions[1].Height = detailsBelow ? new GridLength(1, GridUnitType.Star) : new GridLength(34);
        expandButton.RenderTransformOrigin = new Point(0.5, 0.5); expandButton.RenderTransform = new RotateTransform(expanded == detailsBelow ? 180 : 0);
        if (!dragging) {
            var bounds = Json.Map(Json.Get(data, "bounds"));
            SetWindowPos(handle, Json.Flag(data, "topmost") ? new IntPtr(-1) : new IntPtr(-2),
                (int)Json.Number(bounds, "x"), (int)Json.Number(bounds, "y"), (int)Json.Number(bounds, "width", 760), (int)Json.Number(bounds, "height", 40), 0x0010);
        }
        if (Json.Flag(data, "visible")) { if (!IsVisible) Show(); } else if (IsVisible && !dragging) Hide();
        ApplyColors(); if (wasFolded && !folded && latest != null) Render(latest); if (expanded) RenderDetails();
    }

    private void UpdateElapsed()
    {
        if (folded || latest == null) return;
        DateTimeOffset started;
        if (!DateTimeOffset.TryParse(Json.Text(latest, "activeTurnStartedAt"), out started)) return;
        var item = metricItems.FirstOrDefault(metric => metric.Kind == "elapsed"); if (item == null) return;
        var duration = DateTimeOffset.UtcNow - started; if (duration.TotalSeconds < 0) return;
        item.Value.Text = duration.TotalHours >= 1 ? ((int)duration.TotalHours) + "h" + duration.Minutes.ToString("00") + "m"
            : duration.TotalMinutes >= 1 ? ((int)duration.TotalMinutes) + "m" + duration.Seconds.ToString("00") + "s" : duration.TotalSeconds.ToString("0") + "s";
    }

    private void BuildContextMenu()
    {
        var menu = new ContextMenu();
        Action<string, Action> add = (label, action) => { var item = new MenuItem { Header = label }; item.Click += delegate { action(); }; menu.Items.Add(item); };
        add(T("showStrip", "Show statistics strip"), Reveal);
        add(T("dockTitlebar", "Center in the Codex titlebar"), () => Send("docked", true));
        add(T("refresh", "Refresh"), () => Send("refresh"));
        menu.Items.Add(new Separator()); add(T("quit", "Quit"), () => Send("quit"));
        panel.ContextMenu = menu;
    }

    private sealed class Metric
    {
        internal readonly string Kind;
        internal readonly StackPanel Panel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(7, 0, 7, 0) };
        internal readonly TextBlock Name = new TextBlock { FontSize = 10, VerticalAlignment = VerticalAlignment.Center };
        internal readonly TextBlock Value = new TextBlock { FontSize = 11, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center };
        internal Metric(string kind) { Kind = kind; Panel.Children.Add(Name); Panel.Children.Add(Value); }
    }
}
