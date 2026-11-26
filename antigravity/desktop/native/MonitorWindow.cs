using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Shapes;
using Forms = System.Windows.Forms;

internal sealed class MonitorWindow : Window
{
    private const int BarWidth = 340;
    private const int BarHeight = 32;
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);

    private readonly StreamWriter output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
    private readonly Border panel = new Border { CornerRadius = new CornerRadius(7), BorderThickness = new Thickness(1), Margin = new Thickness(1) };
    private readonly Grid strip = new Grid { Margin = new Thickness(5, 0, 3, 0), ClipToBounds = true };
    private readonly Canvas grip = new Canvas { Width = 7, Height = 13, Margin = new Thickness(0, 0, 4, 0) };
    private readonly Grid identity = new Grid { VerticalAlignment = VerticalAlignment.Center, ClipToBounds = true };
    private readonly TextBlock model = new TextBlock { FontSize = 11.5, TextTrimming = TextTrimming.CharacterEllipsis };
    private readonly TextBlock effort = new TextBlock { FontSize = 10, VerticalAlignment = VerticalAlignment.Center };
    private readonly Border effortBadge = new Border { Margin = new Thickness(5, 0, 3, 0), Padding = new Thickness(4, 1, 4, 1),
        CornerRadius = new CornerRadius(4), VerticalAlignment = VerticalAlignment.Center, Visibility = Visibility.Collapsed };
    private readonly Border metricArea = new Border { ClipToBounds = true };
    private readonly StackPanel metrics = new StackPanel { Orientation = Orientation.Horizontal };
    private readonly List<double> metricWidths = new List<double>();
    private readonly Button foldButton, restoreButton;
    private Brush ink, muted, accent, soft;
    private Dictionary<string, object> labels = new Dictionary<string, object>();
    private Dictionary<string, object> latest;
    private IntPtr handle;
    private bool stopping, dragging, folded, docked = true;

    internal MonitorWindow(bool reveal)
    {
        Title = "Antigravity Usage Monitor";
        Width = BarWidth;
        Height = BarHeight;
        MinWidth = 1;
        MinHeight = 1;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Opacity = 0;
        ShowInTaskbar = false;
        ShowActivated = false;
        FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
        UseLayoutRounding = true;
        TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
        foldButton = Arrow(false, () => Send("folded", true));
        restoreButton = Arrow(true, () => Send("folded", false));
        restoreButton.Width = Double.NaN;
        restoreButton.Height = Double.NaN;
        BuildStrip();
        ApplyTheme(new Dictionary<string, object>());
        SourceInitialized += delegate { handle = new WindowInteropHelper(this).Handle; };
        Loaded += delegate { Start(reveal); };
        strip.SizeChanged += (sender, args) => identity.MaxWidth = Math.Max(0, args.NewSize.Width - foldButton.Width);
        metricArea.SizeChanged += (sender, args) => FitMetrics(args.NewSize.Width);
        DpiChanged += delegate { Render(); };
        Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e) {
            if (!stopping) { e.Cancel = true; Send("folded", true); }
        };
    }

    private void Start(bool reveal)
    {
        ThreadPool.QueueUserWorkItem(delegate {
            try {
                using (var input = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8)) {
                    string line;
                    while ((line = input.ReadLine()) != null) {
                        var message = Json.Decode(line);
                        Dispatcher.BeginInvoke(new Action(() => Receive(message)));
                    }
                }
            } catch (IOException) { }
            finally { Dispatcher.BeginInvoke(new Action(Stop)); }
        });
        var screen = Forms.Screen.FromHandle(handle).WorkingArea;
        bool dark = false;
        using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
            if (key != null) dark = Convert.ToInt32(key.GetValue("AppsUseLightTheme", 1)) == 0;
        Send(new { method = "ready", data = new { pid = Process.GetCurrentProcess().Id, scale = Scale(), reveal,
            locale = CultureInfo.CurrentUICulture.Name, systemDark = dark,
            workArea = new { x = screen.X, y = screen.Y, width = screen.Width, height = screen.Height } } });
    }

    private void Stop()
    {
        if (stopping) return;
        stopping = true;
        Close();
    }

    private void Receive(Dictionary<string, object> message)
    {
        var data = Json.Map(Json.Get(message, "data"));
        switch (Json.Text(message, "event")) {
            case "theme":
                labels = Json.Map(Json.Get(data, "labels"));
                ApplyTheme(Json.Map(Json.Get(data, "colors")));
                break;
            case "snapshot": latest = data; Render(); break;
            case "window": ApplyWindow(data); break;
            case "quit": Stop(); break;
        }
    }

    private void Send(string method, object value = null) { Send(new { method, value }); }

    private void Send(object value)
    {
        if (!stopping) try { output.WriteLine(Json.Encode(value)); } catch (IOException) { Stop(); }
    }

    internal void Reveal() { Send("show"); }

    private double Scale()
    {
        try { return GetDpiForWindow(handle) / 96.0; }
        catch (EntryPointNotFoundException) { return PresentationSource.FromVisual(this).CompositionTarget.TransformToDevice.M11; }
    }

    private void BuildStrip()
    {
        strip.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        strip.ColumnDefinitions.Add(new ColumnDefinition());
        strip.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        identity.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        identity.ColumnDefinitions.Add(new ColumnDefinition());
        identity.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        identity.Children.Add(grip);
        Grid.SetColumn(model, 1);
        model.VerticalAlignment = VerticalAlignment.Center;
        identity.Children.Add(model);
        effortBadge.Child = effort;
        Grid.SetColumn(effortBadge, 2);
        identity.Children.Add(effortBadge);
        strip.Children.Add(identity);
        metrics.HorizontalAlignment = HorizontalAlignment.Center;
        metrics.VerticalAlignment = VerticalAlignment.Center;
        metricArea.Child = metrics;
        Grid.SetColumn(metricArea, 1);
        strip.Children.Add(metricArea);
        Grid.SetColumn(foldButton, 2);
        strip.Children.Add(foldButton);
        panel.Child = strip;
        Content = panel;
        panel.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e) {
            var item = e.OriginalSource as DependencyObject;
            while (item != null) {
                if (item is Button) return;
                item = item is Visual ? VisualTreeHelper.GetParent(item) : LogicalTreeHelper.GetParent(item);
            }
            if (folded) return;
            dragging = true;
            try { DragMove(); }
            finally {
                dragging = false;
                NativeRect bounds;
                if (GetWindowRect(handle, out bounds)) Send(new { method = "dragged", data = new {
                    scale = Scale(), bounds = new { x = bounds.Left, y = bounds.Top,
                        width = bounds.Right - bounds.Left, height = bounds.Bottom - bounds.Top }
                } });
            }
        };
    }

    private Button Arrow(bool left, Action action)
    {
        var glyph = new System.Windows.Shapes.Path {
            Data = Geometry.Parse(left ? "M6,1 L1,6 L6,11" : "M1,1 L6,6 L1,11"),
            StrokeThickness = 1.3, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round,
            StrokeLineJoin = PenLineJoin.Round, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
        };
        var button = new Button { Width = 22, Height = 24, Background = Brushes.Transparent, BorderThickness = new Thickness(), Content = glyph };
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
        var content = new FrameworkElementFactory(typeof(ContentPresenter));
        content.SetValue(HorizontalAlignmentProperty, HorizontalAlignment.Center);
        content.SetValue(VerticalAlignmentProperty, VerticalAlignment.Center);
        border.AppendChild(content);
        button.Template = new ControlTemplate(typeof(Button)) { VisualTree = border };
        button.Click += delegate { action(); };
        button.MouseEnter += delegate { button.Background = soft; };
        button.MouseLeave += delegate { button.Background = Brushes.Transparent; };
        return button;
    }

    private static Brush Color(Dictionary<string, object> colors, string name, string fallback)
    {
        return (Brush)new BrushConverter().ConvertFromString(Json.Text(colors, name, fallback));
    }

    private void ApplyTheme(Dictionary<string, object> colors)
    {
        var surface = Color(colors, "surface", "#f8f9fc").Clone();
        surface.Opacity = 0.89;
        panel.Background = surface;
        panel.BorderBrush = Color(colors, "line", "#dce1ea");
        ink = Color(colors, "text", "#21242b");
        muted = Color(colors, "muted", "#525b6b");
        accent = Color(colors, "accentText", "#3459ac");
        soft = Color(colors, "accentSoft", "#edf2ff");
        model.Foreground = ink;
        effort.Foreground = accent;
        effortBadge.Background = soft;
        grip.Children.Clear();
        foreach (double x in new[] { 0.5, 4.0 }) foreach (double y in new[] { 2.0, 6.0, 10.0 }) {
            var dot = new Ellipse { Width = 1.4, Height = 1.4, Fill = muted };
            Canvas.SetLeft(dot, x);
            Canvas.SetTop(dot, y);
            grip.Children.Add(dot);
        }
        ((System.Windows.Shapes.Path)foldButton.Content).Stroke = muted;
        ((System.Windows.Shapes.Path)restoreButton.Content).Stroke = muted;
        foldButton.ToolTip = T("foldStrip", "Collapse bar");
        restoreButton.ToolTip = T("expandStrip", "Restore bar");
        AutomationProperties.SetName(foldButton, Convert.ToString(foldButton.ToolTip));
        AutomationProperties.SetName(restoreButton, Convert.ToString(restoreButton.ToolTip));
        BuildMenu();
        Render();
    }

    private string T(string name, string fallback) { return Json.Text(labels, name, fallback); }

    private void BuildMenu()
    {
        var menu = new ContextMenu();
        Action<string, Action> add = (label, action) => {
            var item = new MenuItem { Header = label };
            item.Click += delegate { action(); };
            menu.Items.Add(item);
        };
        add(T("showStrip", "Show usage bar"), Reveal);
        add(T("dockTitlebar", "Center in the Antigravity title bar"), () => Send("docked", true));
        if (docked) add(T("detach", "Detach"), () => Send("docked", false));
        add(T("refresh", "Refresh"), () => Send("refresh"));
        menu.Items.Add(new Separator());
        add(T("quit", "Quit"), () => Send("quit"));
        panel.ContextMenu = menu;
    }

    private void Render()
    {
        if (latest == null || folded) return;
        model.Text = Json.Text(latest, "title");
        model.ToolTip = model.Text;
        effort.Text = Json.Text(latest, "effort");
        effortBadge.Visibility = effort.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        metrics.Children.Clear();
        metricWidths.Clear();
        var measure = new Size(Double.PositiveInfinity, BarHeight);
        var values = Json.Get(latest, "metrics") as IEnumerable;
        foreach (var item in (values ?? new object[0]).Cast<object>().Select(Json.Map)) {
            var metric = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(7, 0, 7, 0),
                ToolTip = Json.Text(item, "description") };
            string label = Json.Text(item, "label");
            if (label.Length > 0) metric.Children.Add(new TextBlock { Text = label, FontSize = 11, Foreground = muted,
                Margin = new Thickness(0, 0, 3, 0), VerticalAlignment = VerticalAlignment.Center });
            metric.Children.Add(new TextBlock { Text = Json.Text(item, "value"), FontSize = 11.5, FontWeight = FontWeights.SemiBold,
                Foreground = Json.Text(item, "kind") == "cache" ? accent : ink, VerticalAlignment = VerticalAlignment.Center });
            metrics.Children.Add(metric);
            metric.Measure(measure);
            metricWidths.Add(metric.DesiredSize.Width);
        }
        FitMetrics(metricArea.ActualWidth);
    }

    private void FitMetrics(double remaining)
    {
        if (folded) return;
        for (int i = 0; i < metricWidths.Count; i++) {
            double measured = metricWidths[i];
            bool fits = measured > 0 && measured <= remaining;
            metrics.Children[i].Visibility = fits ? Visibility.Visible : Visibility.Collapsed;
            remaining = fits ? remaining - measured : 0;
        }
    }

    private void ApplyWindow(Dictionary<string, object> data)
    {
        bool wasFolded = folded;
        bool wasDocked = docked;
        folded = Json.Flag(data, "folded");
        docked = Json.Flag(data, "docked");
        panel.Child = folded ? (UIElement)restoreButton : strip;
        if (!dragging) {
            var bounds = Json.Map(Json.Get(data, "bounds"));
            SetWindowPos(handle, Json.Flag(data, "topmost") ? new IntPtr(-1) : new IntPtr(-2),
                (int)Json.Number(bounds, "x"), (int)Json.Number(bounds, "y"),
                (int)Json.Number(bounds, "width", BarWidth), (int)Json.Number(bounds, "height", BarHeight), 0x0010);
        }
        if (Json.Flag(data, "visible")) { if (!IsVisible) Show(); Opacity = 1; }
        else if (IsVisible && !dragging) Hide();
        if (wasDocked != docked) BuildMenu();
        if (wasFolded && !folded) Render();
    }
}
