# ScriptFix AI

ScriptFix AI is a browser based coding assistant for debugging, creating, and understanding code. Its interface uses a quiet glass inspired look and keeps chat history in the browser on the current device.

## Open ScriptFix

Serve this folder as a website, for example with GitHub Pages, then open its `index.html`. A hosted page is needed for reliable provider access and release note loading; opening the file directly does not provide the same browser origin.

## Choose an AI provider

- **Puter Cloud** works without adding an API key. Puter may ask you to sign in, and its available models and usage depend on your Puter account.
- **OpenAI compatible API** lets you enter an API key, endpoint, and model in AI settings. The key is saved in this browser's local storage. Your provider must allow requests from a browser (CORS).

Messages and attached code are sent to the provider you choose. Do not include secrets in code you send to an AI service.

## Web features

- Fix code, create code, and talk about programming in separate chat modes.
- Attach several small project files and review suggested changes against the attached version before applying them to the saved chat copy. Download a separate fixed copy or undo an applied change.
- Save reusable instructions in Settings → Prompt library.
- Search, export, back up, and import saved chats. Chat backups are JSON files; Markdown export is for reading and sharing.
- Track a personal API budget estimate in Settings → Usage from your budget and token usage returned by the API. Puter users can view the monthly allowance reported by Puter when it is available. Neither view is a complete live account billing page.
- Read release notes from `source/versioninfo.txt` and change the displayed version in `source/version.txt`.

Chats, prompts, and settings stay in this browser's local storage. They are not synced between devices. Use the chat backup controls to move saved conversations.

## Edit the project

- `index.html` — page layout and interface text
- `source/styles.css` — colors, spacing, and glass effects
- `source/app.js` — chat behavior and provider requests
- `source/logo.svg` — app logo
- `source/version.txt` — displayed version
- `source/versioninfo.txt` — release notes shown in Settings
