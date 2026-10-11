# ScriptFix AI

A small, editable code-fixing assistant with a frosted-glass chat interface.

## Run in a browser

Double-click `Open in Browser.cmd` to serve the app locally and open it in your browser. Keep the command window open while using ScriptFix AI; press Ctrl+C in that window to stop the local server. You can also host `index.html` and the `source` folder together on a website. Opening the HTML file directly is blocked by browser security for AI connections.

## Use local AI

ScriptFix uses local models through Ollama. On startup, `Open in Browser.cmd` checks for Ollama and starts the setup helper if it is missing. The helper downloads the official installer, verifies its signature belongs to Ollama Inc., and installs it for your Windows account at `%LOCALAPPDATA%\ScriptFixAI\Ollama` without administrator access. It also allows `https://mrotski.github.io` in Ollama's browser-origin settings. You can also choose **Install Ollama automatically** in AI settings or double-click `source\Install Ollama.cmd`. AI settings includes a searchable starter shelf to download and select coding models. Model downloads require an internet connection and can be several gigabytes; later chats run on your computer without API keys or credits. You can browse the full Ollama model library from the shelf. GitHub Pages cannot install Ollama itself; users must run the helper on their computer, and their browser may ask permission to access local network services.

New chats offer **Fix code** and **Create code** modes. Create Code focuses the assistant on producing small, runnable pieces of code; each saved chat remembers its mode.

Recent chats are listed in the sidebar and stored in this browser on this computer. Chats include their conversation context so they can be reopened and continued. Use **Clear** above the list to remove the saved history.

## Use keyless cloud AI

Choose **Puter Cloud — no API key** on a hosted website or localhost address. It uses the lightweight `gpt-5-nano` model by default. Puter may ask you to sign in; usage is handled under your Puter account limits and terms. Messages and attached code are sent to Puter for processing.

## Connect a cloud AI model

Settings are grouped into **AI provider**, **Appearance**, and **Privacy & data** categories. Toggle dark mode in Appearance; the choice is saved in this browser.

Open AI settings, choose **OpenAI-compatible API**, enter an API key, choose a model, and save. The default endpoint is OpenAI's chat-completions endpoint, and the default model is `gpt-4.1-mini`. The key is stored in the browser's local storage; code you send is processed by the API provider you configure.

## Tweak it

- `index.html` — layout and interface text
- `Open in Browser.cmd` — starts the local browser version
- `source/serve.ps1` — small localhost web server used by the browser shortcut
- `source/Install Ollama.cmd` and `source/InstallOllama.ps1` — per-user Ollama setup helper
- `source/styles.css` — colors, spacing, and glass effects
- `source/app.js` — chat behavior and API request
- `source/logo.svg` — custom vector logo, rendered consistently across operating systems
- `source/app-icon.ico` — browser favicon
- `source/version.txt` — displayed app version; edit this file to change the version shown in the app and hosted website

Puter Cloud needs an internet connection and loads its JavaScript SDK from Puter. The OpenAI-compatible API option makes browser requests directly, so its service must permit browser requests (CORS).
