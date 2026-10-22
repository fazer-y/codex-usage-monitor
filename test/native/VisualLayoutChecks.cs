using System;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;

internal static class VisualLayoutChecks
{
    [STAThread]
    private static int Main()
    {
        try {
            var window = new MonitorWindow("unused", new string[0]);
            var type = typeof(MonitorWindow);
            foreach (string name in new[] { "dockButton", "expandButton", "foldButton", "restoreButton", "refreshButton" }) {
                var button = (Button)type.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(window);
                button.Width = 32; button.Height = 34;
                button.Measure(new Size(32, 34)); button.Arrange(new Rect(0, 0, 32, 34)); button.UpdateLayout();
                var glyph = (Viewbox)button.Content;
                var canvas = glyph.Child as Canvas;
                if (canvas == null || canvas.Width != 24 || canvas.Height != 24) throw new Exception("Icon canvas changed: " + name);
                var geometry = ((System.Windows.Shapes.Path)canvas.Children[0]).Data.Bounds;
                var center = new Point(geometry.X + geometry.Width / 2, geometry.Y + geometry.Height / 2);
                var normal = canvas.TransformToAncestor(button).Transform(center);
                glyph.RenderTransformOrigin = new Point(0.5, 0.5); glyph.RenderTransform = new RotateTransform(180);
                var rotated = canvas.TransformToAncestor(button).Transform(center);
                if (Math.Abs(normal.X - rotated.X) > 0.1 || Math.Abs(normal.Y - rotated.Y) > 0.1)
                    throw new Exception("Icon moved after rotation: " + name);
                if (Math.Abs(normal.X - button.ActualWidth / 2) > 0.6 || Math.Abs(normal.Y - button.ActualHeight / 2) > 0.6)
                    throw new Exception("Icon is off center: " + name);
            }
            var scroller = (ScrollViewer)type.GetMethod("CreateDetailsScroller", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(window, null);
            scroller.Content = new Border { Height = 500 };
            scroller.Measure(new Size(120, 100)); scroller.Arrange(new Rect(0, 0, 120, 100)); scroller.UpdateLayout();
            var bar = (ScrollBar)scroller.Template.FindName("PART_VerticalScrollBar", scroller);
            if (bar.ActualWidth != 5 || bar.Maximum != 400) throw new Exception("Thin scrollbar dimensions changed.");
            scroller.ScrollToVerticalOffset(80); scroller.UpdateLayout();
            if (scroller.VerticalOffset != 80) throw new Exception("Details scrolling failed.");
            type.GetField("stopping", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(window, true);
            window.Close();
            Console.WriteLine("Icon centering, rotation stability, thin scrollbar, and scrolling passed.");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            return 1;
        }
    }
}
