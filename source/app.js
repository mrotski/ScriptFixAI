(() => {
  const $ = (id) => document.getElementById(id);
  const promptBox = $('prompt'), messages = $('messages'), scroll = $('chatScroll');
  const dialog = $('settingsDialog');
  const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const DEFAULT_MODEL = 'gpt-4.1-mini';
  const DEFAULT_PUTER_MODEL = 'gpt-5-nano';
  const DEFAULT_LOCAL_MODEL = 'llama3.2';
  const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions';
  let attachedFile = null, busy = false, activeChat = null;
  let savedChats = [];
  try { savedChats = JSON.parse(localStorage.getItem('scriptfix.chats') || '[]'); if (!Array.isArray(savedChats)) savedChats = []; }
  catch { savedChats = []; }

  const bridgeOptions = new URLSearchParams(location.hash.slice(1));
  const bridgePort = bridgeOptions.get('bridge'), bridgeKey = bridgeOptions.get('token');
  const localFileApp = location.protocol === 'file:' || !!bridgeKey;
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
  const requestedVersion = bridgeOptions.get('version');
  if (requestedVersion) versionLabel.textContent = `v${requestedVersion}`;
  else if (location.protocol === 'http:' || location.protocol === 'https:') {
    fetch('source/version.txt', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Version file not found');
      return response.text();
    }).then(version => { versionLabel.textContent = `v${version.trim()}`; }).catch(() => {});
  }
  if (bridgeKey) document.title = `ScriptFix AI · ${bridgeKey.slice(-8)}`;
  function controlWindow(action) {
    if (!bridgePort || !bridgeKey) { showToast('Window controls are available from ScriptFixAI.exe.'); return; }
    fetch(`http://127.0.0.1:${bridgePort}/window?action=${encodeURIComponent(action)}&token=${encodeURIComponent(bridgeKey)}`)
      .catch(() => showToast('Could not reach the app window controls.'));
  }
  $('minimizeWindow').addEventListener('click', () => controlWindow('minimize'));
  $('maximizeWindow').addEventListener('click', () => controlWindow('maximize'));
  $('closeWindow').addEventListener('click', () => controlWindow('close'));
  document.querySelector('.topbar').addEventListener('pointerdown', event => {
    if (event.button === 0 && !event.target.closest('button, a')) controlWindow('drag');
  });

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
  }
  function showToast(text) {
    const toast = $('toast'); toast.textContent = text; toast.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
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
    return activeChat || (activeChat = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: 'New conversation', updatedAt: Date.now(), messages: [] });
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
    syncProviderSettings();
    dialog.showModal();
    setTimeout(() => (cfg.provider === 'cloud' ? $('apiKey') : $('model')).focus(), 50);
  }
  $('settingsButton').addEventListener('click', openSettings);
  $('apiKeyButton').addEventListener('click', openSettings);
  $('provider').addEventListener('change', syncProviderSettings);
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
  $('newChat').addEventListener('click', () => {
    activeChat = null; localStorage.removeItem('scriptfix.activeChat');
    messages.replaceChildren(); $('welcome').hidden = false; promptBox.value = ''; attachedFile = null; $('fileLabel').textContent = ''; renderChatHistory(); promptBox.focus();
  });
  $('clearHistory').addEventListener('click', () => {
    if (!savedChats.length || !confirm('Delete all saved chats from this browser?')) return;
    savedChats = []; activeChat = null; localStorage.removeItem('scriptfix.chats'); localStorage.removeItem('scriptfix.activeChat');
    messages.replaceChildren(); $('welcome').hidden = false; renderChatHistory(); showToast('Saved chats cleared.');
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
  const savedActiveId = localStorage.getItem('scriptfix.activeChat');
  if (savedActiveId && savedChats.some(chat => chat.id === savedActiveId)) openChat(savedActiveId);

  async function send() {
    if (busy) return;
    const userText = promptBox.value.trim();
    if (!userText && !attachedFile) { showToast('Write a message or attach a script first.'); promptBox.focus(); return; }
    const cfg = loadSettings();
    if (cfg.provider === 'cloud' && !cfg.key) { openSettings(); showToast('Add your API key to get started.'); return; }
    const fileForRequest = attachedFile;
    const displayText = [userText, fileForRequest ? `📎 ${fileForRequest.name}` : ''].filter(Boolean).join('\n');
    const system = 'You are ScriptFix AI, a careful and friendly programming assistant. Help users debug, explain, and improve code. When suggesting a corrected script, include a complete runnable version in a fenced code block with the language label. Explain the important changes briefly. Preserve the user’s intent. Call out assumptions and potentially destructive behavior. Never claim to have executed code unless you actually did.';
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
      const endpoint = local && bridgePort
        ? `http://127.0.0.1:${bridgePort}/chat?token=${encodeURIComponent(bridgeKey)}`
        : local ? DEFAULT_LOCAL_ENDPOINT : cfg.endpoint;
      const headers = { 'Content-Type': 'application/json' };
      if (!local) headers.Authorization = `Bearer ${cfg.key}`;
      const response = await fetch(endpoint, {
        method: 'POST', headers,
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
          ? `I couldn’t reach Ollama on this computer. Make sure Ollama is installed, that your model (${cfg.localModel}) is available, and try again. The app can start Ollama’s local server automatically.\n\n${error.message}`
          : cfg.provider === 'puter'
          ? `I couldn’t connect to Puter Cloud. Check your internet connection, allow the Puter sign-in window if prompted, and try again. If your account has reached its usage limit, check Puter account settings.\n\n${error.message}`
          : `I couldn’t connect to the AI service. Check your network connection, API endpoint, and whether the provider allows requests from a browser (CORS).\n\n${error.message}`);
      }
    } finally { busy = false; $('sendButton').disabled = false; promptBox.focus(); }
  }
})();
