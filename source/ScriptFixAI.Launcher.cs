using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class ScriptFixAILauncher
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var host = new BorderlessHost();
        Application.Run(host);
    }
}

internal sealed class BorderlessHost : Form
{
    private const int GWL_STYLE = -16;
    private const int WM_NCHITTEST = 0x0084;
    private const int WM_NCLBUTTONDOWN = 0x00A1;
    private const int HTCAPTION = 2;
    private const int SW_MINIMIZE = 6;
    private const int SW_RESTORE = 9;
    private const int SW_MAXIMIZE = 3;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const int WS_CAPTION = 0x00C00000;
    private const int WS_THICKFRAME = 0x00040000;
    private const int WS_BORDER = 0x00800000;
    private const int WS_DLGFRAME = 0x00400000;
    private const int BORDER_STYLES = WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME;

    private readonly string token;
    private readonly string appTitle;
    private readonly TcpListener listener;
    private readonly Process edgeProcess;
    private readonly System.Windows.Forms.Timer windowTimer;
    private IntPtr appWindow = IntPtr.Zero;
    private bool closing;

    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int command);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool IsZoomed(IntPtr hWnd);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int message, IntPtr wParam, IntPtr lParam);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, int message, IntPtr wParam, IntPtr lParam);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr data);
    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr data);

    public BorderlessHost()
    {
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        Opacity = 0;
        WindowState = FormWindowState.Minimized;
        Show();
        Hide();

        string folder = AppDomain.CurrentDomain.BaseDirectory;
        string page = Path.Combine(folder, "index.html");
        string assets = Path.Combine(folder, "source");
        string edge = FindEdge();
        if (!File.Exists(page) || !File.Exists(Path.Combine(assets, "styles.css")) || edge == null)
        {
            MessageBox.Show(!File.Exists(page) || !File.Exists(Path.Combine(assets, "styles.css"))
                ? "ScriptFix AI could not find its files. Keep index.html and the source folder beside ScriptFixAI.exe."
                : "Microsoft Edge is needed to open this borderless app.", "ScriptFix AI",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.Exit(1);
        }

        byte[] random = new byte[24];
        using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(random);
        token = BitConverter.ToString(random).Replace("-", "").ToLowerInvariant();
        appTitle = "ScriptFix AI · " + token.Substring(token.Length - 8);
        string versionPath = Path.Combine(assets, "version.txt");
        string version = File.Exists(versionPath) ? File.ReadAllText(versionPath).Trim() : "1.0.0";
        if (String.IsNullOrWhiteSpace(version)) version = "1.0.0";

        listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var server = new Thread(() => ServeRequests()) { IsBackground = true, Name = "ScriptFix window-control bridge" };
        server.Start();

        string pageUrl = new Uri(page).AbsoluteUri + "#bridge=" + port + "&token=" + token + "&version=" + Uri.EscapeDataString(version);
        edgeProcess = Process.Start(new ProcessStartInfo(edge, "--app=\"" + pageUrl + "\"") { UseShellExecute = false });

        windowTimer = new System.Windows.Forms.Timer { Interval = 350 };
        windowTimer.Tick += (sender, args) => FindAndStyleAppWindow();
        windowTimer.Start();
    }

    private static string FindEdge()
    {
        string[] paths = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe")
        };
        foreach (string path in paths) if (File.Exists(path)) return path;
        return null;
    }

    private void FindAndStyleAppWindow()
    {
        if (closing) return;
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hwnd, IntPtr data)
        {
            var title = new StringBuilder(256);
            GetWindowText(hwnd, title, title.Capacity);
            if (title.ToString().StartsWith(appTitle, StringComparison.OrdinalIgnoreCase))
            {
                found = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (found != IntPtr.Zero)
        {
            if (found != appWindow)
            {
                appWindow = found;
                ShowWindow(appWindow, SW_RESTORE);
            }
            int style = GetWindowLong(appWindow, GWL_STYLE);
            if ((style & BORDER_STYLES) != 0)
            {
                SetWindowLong(appWindow, GWL_STYLE, style & ~BORDER_STYLES);
                SetWindowPos(appWindow, IntPtr.Zero, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
            }
        }
        if (found == IntPtr.Zero && appWindow != IntPtr.Zero)
        {
            closing = true;
            windowTimer.Stop();
            listener.Stop();
            Close();
        }
    }

    private void ServeRequests()
    {
        while (!closing)
        {
            TcpClient client = null;
            try
            {
                client = listener.AcceptTcpClient();
                using (client)
                {
                    NetworkStream stream = client.GetStream();
                    stream.ReadTimeout = 30000;
                    string headerText = ReadHttpHeaders(stream);
                    string[] lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    string[] request = lines[0].Split(' ');
                    string method = request.Length > 0 ? request[0] : "";
                    string path = request.Length > 1 ? request[1] : "/";
                    int contentLength = 0;
                    foreach (string line in lines)
                    {
                        if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                            Int32.TryParse(line.Substring("Content-Length:".Length).Trim(), out contentLength);
                    }
                    if (contentLength < 0 || contentLength > 1024 * 1024)
                    {
                        WriteHttpResponse(stream, 413, Encoding.UTF8.GetBytes("Request too large."), "text/plain; charset=utf-8");
                        continue;
                    }
                    byte[] requestBody = new byte[contentLength];
                    int received = 0;
                    while (received < requestBody.Length)
                    {
                        int count = stream.Read(requestBody, received, requestBody.Length - received);
                        if (count == 0) throw new EndOfStreamException("Request body ended early.");
                        received += count;
                    }

                    var uri = new Uri("http://127.0.0.1" + path);
                    string supplied = System.Web.HttpUtility.ParseQueryString(uri.Query).Get("token");
                    if (!String.Equals(supplied, token, StringComparison.Ordinal))
                    {
                        WriteHttpResponse(stream, 403, Encoding.UTF8.GetBytes("Forbidden."), "text/plain; charset=utf-8");
                        continue;
                    }
                    if (method == "OPTIONS")
                    {
                        WriteHttpResponse(stream, 204, new byte[0], "text/plain; charset=utf-8");
                        continue;
                    }
                    if (method == "GET" && uri.AbsolutePath == "/window")
                    {
                        string action = System.Web.HttpUtility.ParseQueryString(uri.Query).Get("action");
                        BeginInvoke((Action)(() => ApplyWindowAction(action)));
                        WriteHttpResponse(stream, 200, Encoding.UTF8.GetBytes("ok"), "text/plain; charset=utf-8");
                        continue;
                    }
                    if (method == "POST" && uri.AbsolutePath == "/chat")
                    {
                        int status;
                        byte[] result = ProxyLocalChat(requestBody, out status);
                        WriteHttpResponse(stream, status, result, "application/json; charset=utf-8");
                        continue;
                    }
                    WriteHttpResponse(stream, 404, Encoding.UTF8.GetBytes("Not found."), "text/plain; charset=utf-8");
                }
            }
            catch (SocketException) { if (!closing) Thread.Sleep(100); }
            catch (ObjectDisposedException) { return; }
            catch { if (client != null) client.Close(); }
        }
    }

    private static string ReadHttpHeaders(NetworkStream stream)
    {
        var header = new MemoryStream();
        int state = 0;
        while (header.Length < 16384)
        {
            int value = stream.ReadByte();
            if (value < 0) throw new EndOfStreamException("Request ended before its headers.");
            header.WriteByte((byte)value);
            if ((state == 0 || state == 2) && value == '\r') state++;
            else if ((state == 1 || state == 3) && value == '\n') state++;
            else state = value == '\r' ? 1 : 0;
            if (state == 4) return Encoding.ASCII.GetString(header.ToArray());
        }
        throw new InvalidDataException("Request headers are too large.");
    }

    private static void WriteHttpResponse(NetworkStream stream, int status, byte[] body, string contentType)
    {
        string reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 413 ? "Payload Too Large" : status == 502 ? "Bad Gateway" : "Error";
        string headers = "HTTP/1.1 " + status + " " + reason + "\r\n" +
            "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
            "Access-Control-Allow-Headers: content-type, authorization\r\nAccess-Control-Allow-Private-Network: true\r\n" +
            "Access-Control-Expose-Headers: x-request-id\r\nContent-Type: " + contentType + "\r\n" +
            "Content-Length: " + body.Length + "\r\nConnection: close\r\n\r\n";
        byte[] head = Encoding.ASCII.GetBytes(headers);
        stream.Write(head, 0, head.Length);
        if (body.Length > 0) stream.Write(body, 0, body.Length);
        stream.Flush();
    }

    private static byte[] ProxyLocalChat(byte[] body, out int status)
    {
        try
        {
            EnsureOllamaRunning();
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:11434/v1/chat/completions");
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = 600000;
            request.ReadWriteTimeout = 600000;
            request.ContentLength = body.Length;
            using (Stream stream = request.GetRequestStream()) stream.Write(body, 0, body.Length);
            using (var response = (HttpWebResponse)request.GetResponse())
            using (Stream responseStream = response.GetResponseStream())
            using (var output = new MemoryStream())
            {
                responseStream.CopyTo(output);
                status = (int)response.StatusCode;
                return output.ToArray();
            }
        }
        catch (WebException ex)
        {
            var response = ex.Response as HttpWebResponse;
            if (response != null)
            {
                using (response)
                using (Stream stream = response.GetResponseStream())
                using (var output = new MemoryStream())
                {
                    stream.CopyTo(output);
                    status = (int)response.StatusCode;
                    return output.ToArray();
                }
            }
            status = 502;
            string message = "Ollama is installed but its local server could not be reached. " + ex.Message;
            return Encoding.UTF8.GetBytes("{\"error\":{\"message\":\"" + message.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\"type\":\"local_runtime_error\"}}");
        }
        catch (Exception ex)
        {
            status = 502;
            string message = ex.Message;
            return Encoding.UTF8.GetBytes("{\"error\":{\"message\":\"" + message.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\"type\":\"local_runtime_error\"}}");
        }
    }

    private static void EnsureOllamaRunning()
    {
        const string url = "http://127.0.0.1:11434/api/tags";
        try
        {
            var check = (HttpWebRequest)WebRequest.Create(url);
            check.Method = "GET"; check.Timeout = 1200;
            using (check.GetResponse()) return;
        }
        catch { }

        string ollama = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Ollama", "ollama.exe");
        if (!File.Exists(ollama)) throw new FileNotFoundException("Ollama is not installed at the expected location.", ollama);
        Process.Start(new ProcessStartInfo(ollama, "serve") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
        Exception last = null;
        for (int i = 0; i < 30; i++)
        {
            Thread.Sleep(500);
            try
            {
                var check = (HttpWebRequest)WebRequest.Create(url);
                check.Method = "GET"; check.Timeout = 1000;
                using (check.GetResponse()) return;
            }
            catch (Exception ex) { last = ex; }
        }
        throw new InvalidOperationException("Ollama did not start its local server. " + (last == null ? "" : last.Message));
    }

    private void ApplyWindowAction(string action)
    {
        if (closing || appWindow == IntPtr.Zero) return;
        if (action == "minimize") ShowWindow(appWindow, SW_MINIMIZE);
        else if (action == "maximize") ShowWindow(appWindow, IsZoomed(appWindow) ? SW_RESTORE : SW_MAXIMIZE);
        else if (action == "drag") { ReleaseCapture(); SendMessage(appWindow, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero); }
        else if (action == "close")
        {
            closing = true;
            PostMessage(appWindow, 0x0010, IntPtr.Zero, IntPtr.Zero);
            listener.Stop();
            windowTimer.Stop();
            Close();
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        closing = true;
        if (listener != null) listener.Stop();
        if (edgeProcess != null && !edgeProcess.HasExited) { try { edgeProcess.Close(); } catch { } }
        base.OnFormClosed(e);
    }
}
