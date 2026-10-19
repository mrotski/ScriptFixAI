using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("ScriptFix AI")]
[assembly: AssemblyProduct("ScriptFix AI")]
[assembly: AssemblyVersion("2.1.0.0")]
[assembly: AssemblyFileVersion("2.1.0.0")]
[assembly: AssemblyInformationalVersion("2.1.0")]

namespace ScriptFixAI.Desktop
{
    internal static class Program
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetDllDirectory(string path);

        [STAThread]
        private static void Main()
        {
            string appDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string runtimeDirectory = Path.Combine(appDirectory, "source", "desktop", "runtime");
            SetDllDirectory(runtimeDirectory);
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs args)
            {
                string file = Path.Combine(runtimeDirectory, new AssemblyName(args.Name).Name + ".dll");
                return File.Exists(file) ? Assembly.LoadFrom(file) : null;
            };
            Assembly.LoadFrom(Path.Combine(runtimeDirectory, "Microsoft.Web.WebView2.Core.dll"));
            Assembly.LoadFrom(Path.Combine(runtimeDirectory, "Microsoft.Web.WebView2.WinForms.dll"));

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainWindow(appDirectory));
        }
    }

    internal sealed class MainWindow : Form
    {
        private const int WmNcLButtonDown = 0x00A1;
        private const int HtCaption = 2;
        private readonly string appDirectory;
        private readonly WebView2 browser;
        private Process localServer;
        private const int WmNcHitTest = 0x0084;

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr handle, int message, int wParam, int lParam);

        internal MainWindow(string directory)
        {
            appDirectory = directory;
            Text = "ScriptFix AI";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.None;
            MinimumSize = new Size(820, 620);
            Size = new Size(1180, 850);
            BackColor = Color.FromArgb(145, 149, 156);

            string iconPath = Path.Combine(appDirectory, "source", "app-icon.ico");
            if (File.Exists(iconPath)) Icon = new Icon(iconPath);

            browser = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
            Controls.Add(browser);
            Shown += async delegate { await StartAppAsync(); };
            FormClosed += delegate { StopLocalServer(); };
        }

        private async System.Threading.Tasks.Task StartAppAsync()
        {
            try
            {
                string pageUrl = StartLocalServer();
                string userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ScriptFixAI", "WebView2");
                Directory.CreateDirectory(userData);
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userData, null);
                await browser.EnsureCoreWebView2Async(environment);
                browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
                browser.CoreWebView2.WebMessageReceived += HandleWebMessage;
                browser.CoreWebView2.NavigationStarting += HandleNavigationStarting;
                browser.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args)
                {
                    args.Handled = true;
                    try { Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true }); }
                    catch { }
                };
                browser.CoreWebView2.Navigate(pageUrl + "?desktop=1");
            }
            catch (Exception error)
            {
                MessageBox.Show("ScriptFix AI could not open its app window.\n\n" + error.Message,
                    "ScriptFix AI", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        private string StartLocalServer()
        {
            string script = Path.Combine(appDirectory, "source", "serve.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("The ScriptFix app files are missing.", script);
            string readyFile = Path.Combine(Path.GetTempPath(), "ScriptFixAI-" + Guid.NewGuid().ToString("N") + ".url");
            ProcessStartInfo start = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\" -Desktop -ReadyFile \"" + readyFile + "\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            localServer = Process.Start(start);
            DateTime limit = DateTime.UtcNow.AddSeconds(12);
            while (DateTime.UtcNow < limit)
            {
                if (localServer.HasExited) throw new InvalidOperationException("The local app server stopped unexpectedly.");
                if (File.Exists(readyFile))
                {
                    string address = File.ReadAllText(readyFile).Trim().TrimEnd('/');
                    File.Delete(readyFile);
                    if (address.StartsWith("http://127.0.0.1:", StringComparison.OrdinalIgnoreCase)) return address;
                    throw new InvalidOperationException("The local app server returned an unexpected address.");
                }
                Thread.Sleep(100);
            }
            throw new TimeoutException("The local app server did not start in time.");
        }

        private void HandleWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs eventArgs)
        {
            string message;
            try { message = eventArgs.TryGetWebMessageAsString(); }
            catch { return; }

            if (message == "window:minimize") WindowState = FormWindowState.Minimized;
            else if (message == "window:maximize")
                WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
            else if (message == "window:close") Close();
            else if (message == "window:drag")
            {
                ReleaseCapture();
                SendMessage(Handle, WmNcLButtonDown, HtCaption, 0);
            }
        }

        private void HandleNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs eventArgs)
        {
            Uri uri;
            if (Uri.TryCreate(eventArgs.Uri, UriKind.Absolute, out uri) &&
                (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) &&
                !uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase))
            {
                eventArgs.Cancel = true;
                try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
                catch { }
            }
        }

        private void StopLocalServer()
        {
            if (localServer == null) return;
            try { if (!localServer.HasExited) { localServer.Kill(); localServer.WaitForExit(2000); } }
            catch { }
            localServer.Dispose();
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == WmNcHitTest && WindowState == FormWindowState.Normal)
            {
                base.WndProc(ref message);
                long packed = message.LParam.ToInt64();
                int screenX = unchecked((short)(packed & 0xffff));
                int screenY = unchecked((short)((packed >> 16) & 0xffff));
                Point point = PointToClient(new Point(screenX, screenY));
                int border = 7;
                bool left = point.X <= border;
                bool right = point.X >= ClientSize.Width - border;
                bool top = point.Y <= border;
                bool bottom = point.Y >= ClientSize.Height - border;
                if (top && left) message.Result = (IntPtr)13;
                else if (top && right) message.Result = (IntPtr)14;
                else if (bottom && left) message.Result = (IntPtr)16;
                else if (bottom && right) message.Result = (IntPtr)17;
                else if (left) message.Result = (IntPtr)10;
                else if (right) message.Result = (IntPtr)11;
                else if (top) message.Result = (IntPtr)12;
                else if (bottom) message.Result = (IntPtr)15;
                return;
            }
            base.WndProc(ref message);
        }
    }
}
