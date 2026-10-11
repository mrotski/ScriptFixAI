(() => {
  const $ = (id) => document.getElementById(id);
  const promptBox = $('prompt'), messages = $('messages'), scroll = $('chatScroll');
  const dialog = $('settingsDialog');
  const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const DEFAULT_MODEL = 'gpt-4.1-mini';
  const DEFAULT_PUTER_MODEL = 'gpt-5-nano';
  const DEFAULT_LOCAL_MODEL = 'llama3.2';
  const LOCAL_MODEL_CATALOG = [
    { name: 'qwen2.5-coder:1.5b', label: 'Qwen 2.5 Coder · small, good for modest computers' },
    { name: 'qwen2.5-coder:3b', label: 'Qwen 2.5 Coder · balanced starter' },
    { name: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder · stronger, needs more memory' },
    { name: 'llama3.2:3b', label: 'Llama 3.2 · general purpose, balanced starter' },
    { name: 'deepseek-coder-v2:lite', label: 'DeepSeek Coder V2 Lite · coding focused' }
  ];
  const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions';
  let attachedFile = null, busy = false, activeChat = null, selectedMode = 'fix';
  const modePrompts = {
    fix: [
      ['Find a bug', 'Help me find and fix the bug in this code.'],
      ['Review my code', 'Review this code, explain potential problems, and suggest an improved version.'],
      ['Explain a script', 'Explain what this script does, step by step.']
    ],
    create: [
      ['Make a Python tool', 'Create a small, complete Python utility for a task I describe. Ask me what it should do.'],
      ['Build a JS feature', 'Help me create a small JavaScript feature. Ask what it should do, then provide working code.'],
      ['Create a web component', 'Help me build a simple HTML and CSS component. Ask what I have in mind.']
    ]
  };
  let savedChats = [];
  try { savedChats = JSON.parse(localStorage.getItem('scriptfix.chats') || '[]'); if (!Array.isArray(savedChats)) savedChats = []; }
  catch { savedChats = []; }

  const localFileApp = location.protocol === 'file:';
  let puterSdkReady = Promise.resolve();
  if (localFileApp) {
    $('provider').querySelector('option[value="puter"]')?.remove();
    if (localStorage.getItem('scriptfix.provider') === 'puter') localStorage.setItem('scriptfix.provider', 'local');
  } else {
    puterSdkReady = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.onload = resolve;
      script.onerror = resolve;
      document.head.append(script);
    });
  }
  const versionLabel = $('appVersion');
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    fetch('source/version.txt', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Version file not found');
      return response.text();
    }).then(version => { versionLabel.textContent = `v${version.trim()}`; }).catch(() => {});
  }
  function loadSettings() {
    return {
      provider: localStorage.getItem('scriptfix.provider') || 'local',
      key: localStorage.getItem('scriptfix.key') || '',
      endpoint: localStorage.getItem('scriptfix.endpoint') || DEFAULT_ENDPOINT,
      model: localStorage.getItem('scriptfix.model') || DEFAULT_MODEL,
      puterModel: localStorage.getItem('scriptfix.puterModel') || DEFAULT_PUTER_MODEL,
      localModel: localStorage.getItem('scriptfix.localModel') || DEFAULT_LOCAL_MODEL
    };
  }
  function syncProviderSettings() {
    const provider = $('provider').value;
    const local = provider === 'local';
    const puter = provider === 'puter';
    const localRunner = local && location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port !== '11434';
    document.querySelectorAll('.cloud-setting').forEach(element => { element.hidden = local || puter; });
    $('apiKeyLabel').hidden = local || puter;
    $('localNote').hidden = !local;
    $('puterNote').hidden = !puter;
    if (local) {
      $('model').value = localStorage.getItem('scriptfix.localModel') || DEFAULT_LOCAL_MODEL;
      $('endpoint').value = DEFAULT_LOCAL_ENDPOINT;
    } else if (puter) {
      $('model').value = localStorage.getItem('scriptfix.puterModel') || DEFAULT_PUTER_MODEL;
      $('endpoint').value = DEFAULT_ENDPOINT;
    } else {
      $('model').value = localStorage.getItem('scriptfix.model') || DEFAULT_MODEL;
      $('endpoint').value = localStorage.getItem('scriptfix.endpoint') || DEFAULT_ENDPOINT;
    }
    $('modelShelf').hidden = !localRunner;
    $('localNote').textContent = localRunner
      ? 'Use the model shelf below to install Ollama and download a local coding model. These downloads stay on this computer.'
      : 'This hosted page can connect to Ollama already installed on your computer, but it cannot install software. Run the included Ollama helper once and allow browser access to your local network.';
  }
  async function refreshModelShelf() {
    const search = $('modelSearch');
    const select = $('modelCatalog');
    const query = search.value.trim().toLowerCase();
    const matches = LOCAL_MODEL_CATALOG.filter(model => `${model.name} ${model.label}`.toLowerCase().includes(query));
    select.replaceChildren(...matches.map(model => { const option = document.createElement('option'); option.value = model.name; option.textContent = model.label; return option; }));
    if (!matches.length) { $('modelStatus').textContent = 'No matching suggestions. Clear the search to browse supported models.'; return; }
    $('modelStatus').textContent = 'Checking your installed models…';
    try {
      const response = await fetch('/local-models', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Could not connect to Ollama.');
      $('installOllama').hidden = true;
      const installed = new Set((data.models || []).map(model => model.name));
      const selected = select.value;
      select.querySelectorAll('option').forEach(option => { if (installed.has(option.value)) option.textContent += ' · installed'; });
      if (selected) select.value = selected;
      $('modelStatus').textContent = `${installed.size} model${installed.size === 1 ? '' : 's'} installed. Choose one and download it; the first download may take a while.`;
    } catch (error) { $('installOllama').hidden = false; $('modelStatus').textContent = `Ollama isn’t ready yet. ${error.message}`; }
  }
  function showToast(text) {
    const toast = $('toast'); toast.textContent = text; toast.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
  function setChatMode(mode) {
    selectedMode = mode === 'create' ? 'create' : 'fix';
    promptBox.placeholder = selectedMode === 'create' ? 'Tell me what you want to do…' : 'Tell me what’s going wrong…';
    promptBox.setAttribute('aria-label', selectedMode === 'create' ? 'Describe what you want to create with ScriptFix AI' : 'Message ScriptFix AI about your code');
    document.querySelectorAll('.mode-choice').forEach(button => {
      const selected = button.dataset.mode === selectedMode;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('welcomeDescription').textContent = selectedMode === 'create'
      ? 'Choose a mode, then describe the small piece of code you want to make.'
      : 'Choose a mode, then paste your code or describe what went wrong.';
    document.querySelectorAll('.suggestion').forEach((button, index) => {
      const [label, prompt] = modePrompts[selectedMode][index];
      button.querySelector('span').textContent = label;
      button.dataset.prompt = prompt;
    });
  }
  function applyTheme() {
    const dark = localStorage.getItem('scriptfix.theme') === 'dark';
    document.body.classList.toggle('dark-mode', dark);
    const toggle = $('darkModeToggle');
    if (toggle) toggle.checked = dark;
  }
  function setSettingsCategory(category) {
    document.querySelectorAll('[data-settings-tab]').forEach(button => {
      const active = button.dataset.settingsTab === category;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-settings-page]').forEach(page => {
      const active = page.dataset.settingsPage === category;
      page.hidden = !active;
      page.classList.toggle('active', active);
    });
  }
  function persistChats() {
    if (!activeChat || !activeChat.messages.length) return;
    activeChat.updatedAt = Date.now();
    savedChats = savedChats.filter(chat => chat.id !== activeChat.id);
    savedChats.unshift(activeChat);
    savedChats = savedChats.slice(0, 12);
    localStorage.setItem('scriptfix.activeChat', activeChat.id);
    try { localStorage.setItem('scriptfix.chats', JSON.stringify(savedChats)); }
    catch { showToast('Chat history storage is full. Start a new conversation to save more.'); }
    renderChatHistory();
  }
  function renderChatHistory() {
    const list = $('chatHistory'); list.replaceChildren();
    const ordered = [...savedChats].sort((a, b) => b.updatedAt - a.updatedAt);
    ordered.forEach(chat => {
      const row = document.createElement('div'); row.className = `history-row${activeChat && activeChat.id === chat.id ? ' active' : ''}`;
      const open = document.createElement('button'); open.className = 'history-open'; open.title = chat.title; open.textContent = chat.title || 'New conversation';
      open.addEventListener('click', () => openChat(chat.id));
      const remove = document.createElement('button'); remove.className = 'history-remove'; remove.title = 'Delete saved chat'; remove.setAttribute('aria-label', `Delete ${chat.title || 'saved chat'}`); remove.textContent = '×';
      remove.addEventListener('click', event => { event.stopPropagation(); deleteChat(chat.id); });
      row.append(open, remove); list.append(row);
    });
  }
  function openChat(id) {
    const chat = savedChats.find(item => item.id === id); if (!chat) return;
    activeChat = chat; localStorage.setItem('scriptfix.activeChat', id);
    setChatMode(chat.mode || 'fix');
    messages.replaceChildren();
    $('welcome').hidden = chat.messages.length > 0;
    chat.messages.forEach(message => addMessage(message.role, message.display || message.content, false, true));
    renderChatHistory(); scrollToBottom();
  }
  function deleteChat(id) {
    savedChats = savedChats.filter(chat => chat.id !== id);
    if (activeChat && activeChat.id === id) {
      activeChat = null; localStorage.removeItem('scriptfix.activeChat');
      messages.replaceChildren(); $('welcome').hidden = false;
    }
    localStorage.setItem('scriptfix.chats', JSON.stringify(savedChats)); renderChatHistory();
  }
  function beginChat() {
    return activeChat || (activeChat = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: 'New conversation', mode: selectedMode, updatedAt: Date.now(), messages: [] });
  }
  function scrollToBottom() { requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }
  function addMessage(role, content, isTyping = false, skipSave = false, savedContent = content) {
    $('welcome').hidden = true;
    const row = document.createElement('div'); row.className = `message ${role}`;
    if (role === 'assistant') {
      const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = '✳'; row.append(avatar);
    }
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    if (isTyping) {
      bubble.innerHTML = '<div class="typing" aria-label="Thinking"><i></i><i></i><i></i></div>';
    } else if (role === 'assistant') {
      renderAssistant(bubble, content);
    } else {
      bubble.textContent = content;
    }
    row.append(bubble); messages.append(row); scrollToBottom();
    if (!isTyping && !skipSave) {
      const chat = beginChat();
      chat.messages.push({ role, content: savedContent, display: content });
      if (role === 'user' && chat.title === 'New conversation') {
        chat.title = (content || 'New conversation').replace(/\s+/g, ' ').trim().slice(0, 34) || 'New conversation';
      }
      persistChats();
    }
    return row;
  }
  function renderAssistant(bubble, content) {
    const parts = String(content).split(/```([^\n`]*)\n([\s\S]*?)```/g);
    const container = document.createElement('div'); container.className = 'assistant-content';
    for (let i = 0; i < parts.length; i += 3) {
      const text = parts[i];
      if (text && text.trim()) {
        const p = document.createElement('p');
        const billingUrl = 'https://platform.openai.com/settings/organization/billing/';
        const parts = text.trim().split(billingUrl);
        parts.forEach((part, index) => {
          if (part) p.append(document.createTextNode(part));
          if (index < parts.length - 1) {
            const link = document.createElement('a'); link.href = billingUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.className = 'api-link'; link.textContent = billingUrl; p.append(link);
          }
        });
        container.append(p);
      }
      if (i + 2 < parts.length) {
        const lang = parts[i + 1].trim() || 'code'; const code = parts[i + 2].replace(/\n$/, '');
        const wrap = document.createElement('div'); wrap.className = 'code-wrap';
        const header = document.createElement('div'); header.className = 'code-header';
        const title = document.createElement('span'); title.textContent = lang;
        const copy = document.createElement('button'); copy.className = 'copy-code'; copy.textContent = 'Copy code';
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied!'; setTimeout(() => copy.textContent = 'Copy code', 1300); } catch { showToast('Could not access clipboard.'); } });
        header.append(title, copy); const pre = document.createElement('pre'); pre.className = 'code-body'; pre.textContent = code;
        wrap.append(header, pre); container.append(wrap);
      }
    }
    if (!container.childElementCount) { const p = document.createElement('p'); p.textContent = content; container.append(p); }
    bubble.append(container);
  }
  function openSettings() {
    const cfg = loadSettings(); $('apiKey').value = cfg.key; $('provider').value = cfg.provider;
    setSettingsCategory('provider');
    applyTheme();
    syncProviderSettings();
    dialog.showModal();
    if (!$('modelShelf').hidden) refreshModelShelf();
    setTimeout(() => (cfg.provider === 'cloud' ? $('apiKey') : $('model')).focus(), 50);
  }
  $('settingsButton').addEventListener('click', openSettings);
  $('apiKeyButton').addEventListener('click', openSettings);
  document.querySelectorAll('[data-settings-tab]').forEach(button => button.addEventListener('click', () => setSettingsCategory(button.dataset.settingsTab)));
  $('darkModeToggle').addEventListener('change', () => {
    localStorage.setItem('scriptfix.theme', $('darkModeToggle').checked ? 'dark' : 'light');
    applyTheme();
  });
  $('provider').addEventListener('change', syncProviderSettings);
  $('modelSearch').addEventListener('input', refreshModelShelf);
  $('modelCatalog').addEventListener('change', () => { $('model').value = $('modelCatalog').value; });
  $('installOllama').addEventListener('click', async () => {
    const button = $('installOllama'); button.disabled = true; button.textContent = 'Opening setup…';
    try {
      const response = await fetch('/install-ollama', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Could not start setup (${response.status}).`);
      $('modelStatus').textContent = 'Follow the setup window. ScriptFix will connect automatically when Ollama is ready.';
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const check = await fetch('/local-models', { cache: 'no-store' });
        if (check.ok) { await refreshModelShelf(); showToast('Ollama is ready. Choose a model to download.'); return; }
      }
      $('modelStatus').textContent = 'Setup is taking longer than expected. When its window says Ollama is installed, select this shelf again to reconnect.';
    } catch (error) { $('modelStatus').textContent = `Couldn’t start the Ollama setup helper. ${error.message}`; }
    finally { button.disabled = false; button.textContent = 'Install Ollama automatically'; }
  });
  $('installModel').addEventListener('click', async () => {
    const model = $('modelCatalog').value;
    if (!model) return;
    const button = $('installModel'); button.disabled = true; button.textContent = 'Downloading…';
    $('modelStatus').textContent = `Downloading ${model}. Keep ScriptFix open; the first download may take several minutes.`;
    try {
      const response = await fetch('/install-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Download failed (${response.status}).`);
      $('model').value = model; localStorage.setItem('scriptfix.localModel', model);
      $('modelStatus').textContent = `${model} is ready. It’s now selected for local chats.`;
      showToast('Model downloaded and selected.');
      await refreshModelShelf();
    } catch (error) { $('modelStatus').textContent = `Couldn’t download ${model}. ${error.message}`; }
    finally { button.disabled = false; button.textContent = 'Download'; }
  });
  $('saveSettings').addEventListener('click', () => {
    const provider = $('provider').value;
    const endpoint = $('endpoint').value.trim() || DEFAULT_ENDPOINT;
    if (provider === 'cloud') {
      try { new URL(endpoint); } catch { showToast('Please enter a valid API endpoint.'); return; }
      localStorage.setItem('scriptfix.key', $('apiKey').value.trim());
      localStorage.setItem('scriptfix.endpoint', endpoint);
      localStorage.setItem('scriptfix.model', $('model').value.trim() || DEFAULT_MODEL);
    } else if (provider === 'puter') {
      localStorage.setItem('scriptfix.puterModel', $('model').value.trim() || DEFAULT_PUTER_MODEL);
    } else {
      localStorage.setItem('scriptfix.localModel', $('model').value.trim() || DEFAULT_LOCAL_MODEL);
    }
    localStorage.setItem('scriptfix.provider', provider);
    dialog.close(); showToast('Settings saved on this device.');
  });
  $('clearKey').addEventListener('click', () => { localStorage.removeItem('scriptfix.key'); $('apiKey').value = ''; showToast('Saved API key cleared.'); });
  document.querySelectorAll('.mode-choice').forEach(button => button.addEventListener('click', () => setChatMode(button.dataset.mode)));
  $('newChat').addEventListener('click', () => {
    activeChat = null; localStorage.removeItem('scriptfix.activeChat');
    setChatMode('fix');
    messages.replaceChildren(); $('welcome').hidden = false; promptBox.value = ''; attachedFile = null; $('fileLabel').textContent = ''; renderChatHistory(); promptBox.focus();
  });
  $('clearHistory').addEventListener('click', () => {
    if (!savedChats.length || !confirm('Delete all saved chats from this browser?')) return;
    savedChats = []; activeChat = null; localStorage.removeItem('scriptfix.chats'); localStorage.removeItem('scriptfix.activeChat');
    messages.replaceChildren(); $('welcome').hidden = false; setChatMode('fix'); renderChatHistory(); showToast('Saved chats cleared.');
  });
  $('attachButton').addEventListener('click', () => $('fileInput').click());
  $('uploadSide').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const maxBytes = 500 * 1024;
    if (file.size > maxBytes) { showToast('That file is over 500 KB. Please choose a smaller script.'); event.target.value = ''; return; }
    attachedFile = { name: file.name, text: await file.text() };
    $('fileLabel').textContent = `↳ ${file.name}`;
    showToast(`${file.name} attached.`);
  });
  document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => { promptBox.value = button.dataset.prompt; promptBox.focus(); promptBox.dispatchEvent(new Event('input')); }));
  promptBox.addEventListener('input', () => { promptBox.style.height = 'auto'; promptBox.style.height = `${Math.min(promptBox.scrollHeight, 125)}px`; });
  promptBox.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } });
  $('sendButton').addEventListener('click', send);
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('newChat').click(); } });
  renderChatHistory();
  setChatMode('fix');
  applyTheme();
  const savedActiveId = localStorage.getItem('scriptfix.activeChat');
  if (savedActiveId && savedChats.some(chat => chat.id === savedActiveId)) openChat(savedActiveId);

  async function send() {
    if (busy) return;
    const userText = promptBox.value.trim();
    if (!userText && !attachedFile) { showToast('Write a message or attach a script first.'); promptBox.focus(); return; }
    const cfg = loadSettings();
    if (localFileApp) { showToast('Open ScriptFix AI from a local web server or hosted website to connect to an AI service.'); return; }
    if (cfg.provider === 'cloud' && !cfg.key) { openSettings(); showToast('Add your API key to get started.'); return; }
    const fileForRequest = attachedFile;
    const displayText = [userText, fileForRequest ? `📎 ${fileForRequest.name}` : ''].filter(Boolean).join('\n');
    const system = activeChat?.mode === 'create'
      ? 'You are ScriptFix AI in Create Code mode, a careful and friendly programming assistant. Help the user create small, useful pieces of code from their ideas. If an essential requirement is unclear, ask one concise question; otherwise make reasonable assumptions and state them. Provide complete, runnable code in a fenced code block with the correct language label, include brief usage instructions, and avoid unnecessary dependencies. Explain important choices and never claim to have executed code unless you actually did.'
      : 'You are ScriptFix AI in Fix Code mode, a careful and friendly programming assistant. Help users debug, explain, and improve code. When suggesting a corrected script, include a complete runnable version in a fenced code block with the language label. Explain the important changes briefly. Preserve the user’s intent. Call out assumptions and potentially destructive behavior. Never claim to have executed code unless you actually did.';
    let userContent = userText || 'Please inspect this script for bugs and suggest a corrected version.';
    if (fileForRequest) userContent += `\n\nAttached file: ${fileForRequest.name}\n\n\`\`\`${fileForRequest.name.split('.').pop()}\n${fileForRequest.text}\n\`\`\``;
    addMessage('user', displayText, false, false, userContent);
    promptBox.value = ''; promptBox.style.height = 'auto'; attachedFile = null; $('fileLabel').textContent = ''; $('fileInput').value = '';
    busy = true; $('sendButton').disabled = true;
    const typingRow = addMessage('assistant', '', true);
    try {
      if (cfg.provider === 'puter') {
        await puterSdkReady;
        if (!window.puter?.ai?.chat) throw new Error('Puter Cloud could not load. Check your internet connection and reopen the app.');
        const result = await window.puter.ai.chat([
          { role: 'system', content: system },
          ...activeChat.messages.map(message => ({ role: message.role, content: message.content }))
        ], { model: cfg.puterModel || DEFAULT_PUTER_MODEL, normalize: true });
        const reply = result?.message?.content;
        if (!reply) throw new Error('Puter returned an empty response. Try again or choose another model in AI settings.');
        typingRow.remove(); addMessage('assistant', reply);
        return;
      }
      const local = cfg.provider === 'local';
      const localRunner = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port !== '11434';
      const endpoint = local ? (localRunner ? new URL('/local-chat', location.origin).href : DEFAULT_LOCAL_ENDPOINT) : cfg.endpoint;
      const headers = { 'Content-Type': 'application/json' };
      if (!local) headers.Authorization = `Bearer ${cfg.key}`;
      const response = await fetch(endpoint, {
        method: 'POST', headers,
        ...(local && !localRunner ? { targetAddressSpace: 'loopback' } : {}),
        body: JSON.stringify({ model: local ? cfg.localModel : cfg.model, messages: [{ role: 'system', content: system }, ...activeChat.messages.map(message => ({ role: message.role, content: message.content }))], temperature: 0.2 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = data.error || {};
        const apiMessage = apiError.message || `HTTP ${response.status}`;
        const apiCode = apiError.code || apiError.type || '';
        const requestId = response.headers.get('x-request-id') || 'not provided';
        const detail = new Error(`${local ? 'Local Ollama' : 'API'} ${response.status}${apiCode ? ` (${apiCode})` : ''}: ${apiMessage}\nRequest ID: ${requestId}`);
        detail.isApiResponse = true;
        if (apiCode === 'credit_balance_exhausted' || /no credits remaining|credit balance exhausted/i.test(apiMessage)) {
          detail.isCreditBalanceError = true;
        }
        throw detail;
      }
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error('The API returned an empty response. Check that your selected model supports chat completions.');
      typingRow.remove(); addMessage('assistant', reply);
    } catch (error) {
      typingRow.remove();
      if (error.isCreditBalanceError) {
        addMessage('assistant', `The API responded with a billing error: it reports that the selected organization has no available API credits. Your API key can still be valid; API billing is separate from a ChatGPT subscription.\n\nCheck the billing balance for the organization and project that own this key. If the balance is positive, review the organization or project spend limit and confirm that the key belongs to the selected project.\n\nBilling settings: https://platform.openai.com/settings/organization/billing/\n${error.message.split('\n').slice(1).join('\n')}`);
      } else if (error.isApiResponse) {
        addMessage('assistant', `The API received the request but rejected it. Check the API error details below, then verify the key, model, and the selected organization or project in AI settings.\n\n${error.message}`);
      } else {
        addMessage('assistant', cfg.provider === 'local'
          ? `I couldn’t reach Ollama on this computer. Make sure it is installed and that the model (${cfg.localModel}) is available. For the GitHub Pages version, run source\\Install Ollama.cmd once to allow this site in Ollama, then approve your browser’s local-network prompt if it appears.\n\n${error.message}`
          : cfg.provider === 'puter'
          ? `I couldn’t connect to Puter Cloud. Check your internet connection, allow the Puter sign-in window if prompted, and try again. If your account has reached its usage limit, check Puter account settings.\n\n${error.message}`
          : `I couldn’t connect to the AI service. Check your network connection, API endpoint, and whether the provider allows requests from a browser (CORS).\n\n${error.message}`);
      }
    } finally { busy = false; $('sendButton').disabled = false; promptBox.focus(); }
  }
})();
