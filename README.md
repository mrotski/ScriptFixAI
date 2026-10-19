# ScriptFix AI

A small, editable coding assistant with a frosted-glass chat interface. ScriptFix AI 2.0 supports fixing code, creating code, and talking about code.

Version 2.1 adds live replies, multi-file project attachments, AI code-change review, safe JavaScript snippet runs, friendly model guidance, prompt presets, and saved-chat search/export.

## Run the app

Double-click `ScriptFix AI.exe` to use the local Ollama model and saved chat history. Keep `index.html` and the `source` folder beside it. The launcher opens a borderless Microsoft Edge app window with custom minimize, maximize, close, and drag controls in the page header.

## Use local AI

ScriptFix defaults to the local `llama3.2` model through Ollama. Ollama and this model are present on this computer, and the launcher starts Ollama's local server automatically when you send a message. The local model runs on your computer and does not need an API key or API credits.

Recent chats are listed in the sidebar and stored in this browser on this computer. Chats include their conversation context so they can be reopened and continued. Use **Clear** above the list to remove the saved history.

## Chat modes

Choose **Fix code** to diagnose or improve existing code, **Create code** to build something new, or **Talk about code** to ask questions, understand a script, learn a concept, or compare approaches. Each saved chat keeps its chosen mode.

## Use keyless cloud AI

On a hosted website, choose **Puter Cloud — no API key**. It uses the lightweight `gpt-5-nano` model by default. Puter may ask you to sign in; usage is handled under your Puter account limits and terms. Messages and attached code are sent to Puter for processing. The packaged desktop app runs from a local file and hides this option because Puter requires a website origin.

## Connect a cloud AI model

Open AI settings, choose **OpenAI-compatible API**, enter an API key, choose a model by its friendly name, and save. The default endpoint is OpenAI's chat-completions endpoint, and the default model is `gpt-4.1-mini`. The key is stored in the browser's local storage; code you send is processed by the API provider you configure. Puter Cloud also loads a friendly picker of the models available to the signed-in account.

## Tweak it

- `index.html` — layout and interface text
- `source/styles.css` — colors, spacing, and glass effects
- `source/app.js` — chat behavior and API request
- `source/desktop/Program.cs` — source for the small Windows app launcher, including its 2.0 version metadata
- `source/version.txt` — displayed app version; edit this file to change the version shown in the app and hosted website
- `source/versioninfo.txt` — release notes shown in Settings

The launcher expects Microsoft Edge. Puter Cloud needs an internet connection and loads its JavaScript SDK from Puter. The OpenAI-compatible API option makes browser requests directly, so its service must permit browser requests (CORS).
