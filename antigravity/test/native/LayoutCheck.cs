using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;

internal static class LayoutCheck
{
    [STAThread]
    private static int Main(string[] args)
    {
        try {
            var window = new MonitorWindow(false);
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
            var type = typeof(MonitorWindow);
            type.GetField("latest", flags).SetValue(window, Json.Decode(File.ReadAllText(args[0])));
            type.GetMethod("Render", flags).Invoke(window, null);
            var fit = type.GetMethod("FitMetrics", flags);
            var model = (TextBlock)type.GetField("model", flags).GetValue(window);
            var effort = (TextBlock)type.GetField("effort", flags).GetValue(window);
            var badge = (Border)type.GetField("effortBadge", flags).GetValue(window);
            var metricArea = (Border)type.GetField("metricArea", flags).GetValue(window);
            var panel = (Border)window.Content;
            var metrics = (StackPanel)type.GetField("metrics", flags).GetValue(window);
            var counts = new int[4];
            var widths = new double[] { 340, 468, 740, 340 };
            for (int i = 0; i < widths.Length; i++) {
                panel.Measure(new Size(widths[i], 32));
                panel.Arrange(new Rect(0, 0, widths[i], 32));
                fit.Invoke(window, new object[] { metricArea.ActualWidth });
                var shown = metrics.Children.Cast<UIElement>().Select(item => item.Visibility == Visibility.Visible).ToArray();
                counts[i] = shown.Count(value => value);
                if (shown.Skip(counts[i]).Any(value => value)) throw new Exception("Metrics left their priority order.");
                double modelWidth = model.ActualWidth;
                model.Measure(new Size(Double.PositiveInfinity, 32));
                if (model.Text != "Gemini 4 Neon" || model.DesiredSize.Width > modelWidth + 1
                    || effort.Text != "High" || badge.Visibility != Visibility.Visible) {
                    throw new Exception("The full model or effort was hidden.");
                }
            }
            Console.WriteLine("Visible metrics at 340, 468, 740, and 340 DIPs: " + String.Join(", ", counts));
            if (counts[0] < 2 || counts[1] <= counts[0] || counts[2] <= counts[1] || counts[3] != counts[0]) {
                throw new Exception("Metric visibility did not follow the available width.");
            }
            type.GetField("stopping", flags).SetValue(window, true);
            window.Close();
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
