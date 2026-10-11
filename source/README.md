# ScriptFix AI

A small, editable code-fixing assistant with a frosted-glass chat interface.

## Windows app

Run `ScriptFix AI.exe` from the project folder. Keep `index.html` and the `source` folder beside it. The app opens in a custom borderless window, starts its private local web server, and offers local Ollama plus an OpenAI-compatible cloud API. If Ollama is missing, the app starts the verified Ollama setup helper. It installs Ollama for your Windows account at `%LOCALAPPDATA%\ScriptFixAI\Ollama`; model downloads are separate and can be several gigabytes. The app uses the Microsoft Edge WebView2 Runtime. If it is missing, install the Evergreen Runtime from Microsoft's [WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/).

## Browser version

Double-click `Open in Browser.cmd` to open the web version locally. It offers cloud providers only; local Ollama is available in the Windows app. You can also host `index.html` and the `source` folder on GitHub Pages. The browser version works with Puter Cloud and OpenAI-compatible APIs.

## Local AI

The Windows app runs local models through Ollama. AI settings includes a searchable starter shelf to download and select coding models. You can also install Ollama separately by double-clicking `source\Install Ollama.cmd`. The helper downloads the official installer, verifies its signature belongs to Ollama Inc., and installs without administrator access. The local model runs on your computer and does not need API keys or credits.

New chats offer **Fix code** and **Create code** modes. Create Code focuses the assistant on producing small, runnable pieces of code; each saved chat remembers its mode.

Recent chats are listed in the sidebar and stored in this browser on this computer. Chats include their conversation context so they can be reopened and continued. Use **Clear** above the list to remove the saved history.

## Use keyless cloud AI

Choose **Puter Cloud — no API key** on a hosted website or localhost address. It uses the lightweight `gpt-5-nano` model by default. Puter may ask you to sign in; usage is handled under your Puter account limits and terms. Messages and attached code are sent to Puter for processing.

## Connect a cloud AI model

Settings are grouped into **AI provider**, **Appearance**, and **Privacy & data** categories. Toggle dark mode in Appearance; the choice is saved in this browser.

Open AI settings, choose **OpenAI-compatible API**, enter an API key, choose a model, and save. The default endpoint is OpenAI's chat-completions endpoint, and the default model is `gpt-4.1-mini`. The key is stored in the browser's local storage; code you send is processed by the API provider you configure.

## Tweak it

- `index.html` — layout and interface text
- `ScriptFix AI.exe` — borderless Windows app
- `Open in Browser.cmd` — starts the local browser version
- `source/serve.ps1` — small localhost web server used by the browser shortcut
- `source/Install Ollama.cmd` and `source/InstallOllama.ps1` — per-user Ollama setup helper
- `source/desktop/Program.cs` — editable Windows app host source
- `source/desktop/runtime` — Microsoft WebView2 libraries used by the app
- `source/styles.css` — colors, spacing, and glass effects
- `source/app.js` — chat behavior and API request
- `source/logo.svg` — custom vector logo, rendered consistently across operating systems
- `source/app-icon.ico` — browser favicon
- `source/version.txt` — displayed app version; edit this file to change the version shown in the app and hosted website

Puter Cloud needs an internet connection and loads its JavaScript SDK from Puter. The OpenAI-compatible API option makes browser requests directly, so its service must permit browser requests (CORS).
