(() => {
  const appAssetsUrl = new URL('.', document.currentScript.src);
  const $ = (id) => document.getElementById(id);
  const promptBox = $('prompt'), messages = $('messages'), scroll = $('chatScroll');
  const dialog = $('settingsDialog');
  const sidebarToggle = $('sidebarToggle');
  const appWindow = document.querySelector('.window');
  function setMobileSidebarOpen(open) {
    const isOpen = open && window.matchMedia('(max-width: 700px), (hover: none) and (pointer: coarse) and (max-width: 900px)').matches;
    appWindow.classList.toggle('sidebar-open', isOpen);
    sidebarToggle.setAttribute('aria-expanded', String(isOpen));
    sidebarToggle.setAttribute('aria-label', isOpen ? 'Close chat history' : 'Open chat history');
  }
  sidebarToggle.addEventListener('click', () => setMobileSidebarOpen(!appWindow.classList.contains('sidebar-open')));
  document.querySelector('.workspace').addEventListener('click', event => {
    if (event.target === event.currentTarget) setMobileSidebarOpen(false);
  });
  $('chatHistory').addEventListener('click', event => {
    if (event.target.closest('.history-open')) setMobileSidebarOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMobileSidebarOpen(false);
  });
  const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const MAX_SAVED_CHATS = 40;
  const DEVELOPER_ACCESS_CODE = '4985';
  const DEFAULT_MODEL = 'gpt-4.1-mini';
  const DEFAULT_PUTER_MODEL = 'gpt-5-nano';
  const OPENAI_MODEL_CHOICES = [
    { id: 'gpt-5.1', label: 'GPT-5.1 — best for coding and complex work' },
    { id: 'gpt-5', label: 'GPT-5 — capable reasoning and coding' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini — fast, capable everyday help' },
    { id: 'gpt-5-nano', label: 'GPT-5 Nano — fastest, lowest-cost option' },
    { id: 'gpt-4.1', label: 'GPT-4.1 — strong general-purpose model' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — fast and affordable' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano — lightweight tasks' }
  ];
  const PUTER_FALLBACK_MODEL_CHOICES = [
    { id: 'gpt-5-nano', label: 'GPT-5 Nano — fast, low-cost help' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — stronger coding help' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced writing and coding' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite — quick answers' }
  ];
  const MODEL_DETAILS = {
    'gpt-5.1': 'Best quality · Strong coding and complex reasoning · Higher usage',
    'gpt-5': 'High quality · Capable coding and reasoning · Moderate usage',
    'gpt-5-mini': 'Balanced · Fast everyday coding help · Lower usage',
    'gpt-5-nano': 'Fastest · Short focused tasks · Lowest usage',
    'gpt-4.1': 'Strong general-purpose work · Moderate speed',
    'gpt-4.1-mini': 'Fast and affordable · Great default for many tasks',
    'gpt-4.1-nano': 'Very fast · Best for smaller, simple tasks'
  };
  const DEFAULT_LOCAL_MODEL = 'llama3.2';
  const COMMON_API_RATES = {
    'gpt-4.1-mini': [0.4, 1.6],
    'gpt-5-nano': [0.05, 0.4]
  };
  const LOCAL_MODEL_CATALOG = [
    { name: 'qwen2.5-coder:1.5b', label: 'Qwen 2.5 Coder · small, good for modest computers' },
    { name: 'qwen2.5-coder:3b', label: 'Qwen 2.5 Coder · balanced starter' },
    { name: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder · stronger, needs more memory' },
    { name: 'llama3.2:3b', label: 'Llama 3.2 · general purpose, balanced starter' },
    { name: 'deepseek-coder-v2:lite', label: 'DeepSeek Coder V2 Lite · coding focused' }
  ];
  const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions';
  const desktopApp = new URLSearchParams(location.search).get('desktop') === '1' && Boolean(window.chrome?.webview);
  window.addEventListener('error', event => {
    const bootScreen = $('appBootScreen');
    const bootMessage = $('appBootMessage');
    if (bootScreen) bootScreen.hidden = false;
    if (bootMessage) bootMessage.textContent = `ScriptFix has crashed with message: ${event.message || 'an app script failed to load'}. Refreshing the website should help!.`;
  });
  window.addEventListener('unhandledrejection', event => {
    const bootScreen = $('appBootScreen');
    const bootMessage = $('appBootMessage');
    if (bootScreen) bootScreen.hidden = false;
    if (bootMessage) bootMessage.textContent = `ScriptFix has crashed with message: ${event.reason?.message || 'a startup request failed'}. Refreshing the website should help!.`;
  });
  let attachedFiles = [], busy = false, activeChat = null, selectedMode = 'fix';
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
    ],
    talk: [
      ['Explain this code', 'Explain what this code does, step by step, in plain language.'],
      ['Compare approaches', 'Help me compare approaches for solving a programming problem.'],
      ['Learn a concept', 'Teach me a programming concept with a small, clear example.']
    ]
  };
  let savedChats = [];
  try { savedChats = JSON.parse(localStorage.getItem('scriptfix.chats') || '[]'); if (!Array.isArray(savedChats)) savedChats = []; }
  catch { savedChats = []; }
  let customPrompts = [];
  try { customPrompts = JSON.parse(localStorage.getItem('scriptfix.customPrompts') || '[]'); if (!Array.isArray(customPrompts)) customPrompts = []; }
  catch { customPrompts = []; }
  let editingPromptId = '';

  const localFileApp = location.protocol === 'file:';
  let puterSdkReady = Promise.resolve();
  if (desktopApp) {
    $('provider').querySelector('option[value="puter"]')?.remove();
    if (localStorage.getItem('scriptfix.provider') === 'puter') localStorage.setItem('scriptfix.provider', 'local');
  } else {
    $('provider').querySelector('option[value="local"]')?.remove();
    if (localStorage.getItem('scriptfix.provider') === 'local') localStorage.setItem('scriptfix.provider', 'puter');
  }
  if (!localFileApp && !desktopApp) {
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
    fetch(new URL('version.txt', appAssetsUrl), { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Version file not found');
      return response.text();
    }).then(version => { versionLabel.textContent = `v${version.trim()}`; }).catch(() => {});
  }
  function loadSettings() {
    return {
      provider: localStorage.getItem('scriptfix.provider') || (desktopApp ? 'local' : 'puter'),
      key: localStorage.getItem('scriptfix.key') || '',
      endpoint: localStorage.getItem('scriptfix.endpoint') || DEFAULT_ENDPOINT,
      model: localStorage.getItem('scriptfix.model') || DEFAULT_MODEL,
      puterModel: localStorage.getItem('scriptfix.puterModel') || DEFAULT_PUTER_MODEL,
      localModel: localStorage.getItem('scriptfix.localModel') || DEFAULT_LOCAL_MODEL
    };
  }
  function setModelPickerOptions(choices, selected) {
    const picker = $('modelPicker');
    const unique = new Map(choices.map(choice => [choice.id, choice]));
    if (selected && !unique.has(selected)) unique.set(selected, { id: selected, label: `${selected} — currently selected` });
    picker.replaceChildren(...[...unique.values()].map(choice => {
      const option = document.createElement('option'); option.value = choice.id; option.textContent = choice.label; return option;
    }));
    picker.value = selected || [...unique.keys()][0] || '';
    renderModelDetails();
  }
  function renderModelDetails() {
    const details = $('modelDetails'); const provider = $('provider')?.value; const model = $('modelPicker').value;
    if (provider === 'local') { details.hidden = true; return; }
    details.hidden = false;
    details.textContent = MODEL_DETAILS[model] || (provider === 'puter'
      ? 'Live Puter model · Availability and pricing are shown in your Puter account.'
      : 'Custom API model · Check your provider for capability and pricing details.');
  }
  async function loadPuterModelPicker(selected) {
    const picker = $('modelPicker');
    const note = $('modelPickerNote');
    setModelPickerOptions(PUTER_FALLBACK_MODEL_CHOICES, selected);
    note.hidden = false; note.textContent = 'Loading the models available through your Puter account…';
    try {
      await puterSdkReady;
      if ($('provider').value !== 'puter') return;
      const models = await window.puter?.ai?.listModels?.();
      if (!Array.isArray(models) || !models.length) throw new Error('No models were returned.');
      const choices = models
        .filter(model => model?.id)
        .map(model => ({ id: model.id, label: `${model.name || model.id}${model.provider ? ` — ${model.provider}` : ''}` }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setModelPickerOptions(choices, selected);
      note.textContent = `${choices.length} models are available through Puter. Choose one by its plain-language name.`;
    } catch {
      if ($('provider').value !== 'puter') return;
      note.textContent = 'Showing popular Puter models. The full list will appear when Puter is available.';
    }
    if (picker.hidden) note.hidden = true;
  }
  function syncProviderSettings() {
    const provider = $('provider').value;
    const local = provider === 'local';
    const puter = provider === 'puter';
    const localRunner = local && location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port !== '11434';
    document.querySelectorAll('.cloud-setting').forEach(element => { element.hidden = local || puter; });
    $('apiKeyLabel').hidden = local || puter;
    $('model').hidden = !local;
    $('modelPicker').hidden = local;
    $('modelPickerNote').hidden = local;
    $('modelDetails').hidden = local;
    $('localNote').hidden = !local;
    $('puterNote').hidden = !puter;
    document.querySelector('[data-settings-page="provider"] .dialog-intro').textContent = desktopApp
      ? 'Choose where your code is processed. Local Ollama runs on this computer; cloud providers send messages to their service.'
      : 'Choose a cloud provider for this browser. Local Ollama is available in the Windows app.';
    if (local) {
      $('model').value = localStorage.getItem('scriptfix.localModel') || DEFAULT_LOCAL_MODEL;
      $('endpoint').value = DEFAULT_LOCAL_ENDPOINT;
    } else if (puter) {
      loadPuterModelPicker(localStorage.getItem('scriptfix.puterModel') || DEFAULT_PUTER_MODEL);
      $('endpoint').value = DEFAULT_ENDPOINT;
    } else {
      setModelPickerOptions(OPENAI_MODEL_CHOICES, localStorage.getItem('scriptfix.model') || DEFAULT_MODEL);
      $('modelPickerNote').textContent = 'Choose a model by name. ScriptFix saves the technical model ID for you.';
      renderModelDetails();
      $('endpoint').value = localStorage.getItem('scriptfix.endpoint') || DEFAULT_ENDPOINT;
    }
    $('modelShelf').hidden = !localRunner;
    $('localNote').textContent = desktopApp
      ? 'Ollama runs on this computer. Use the shelf to install Ollama and download a model before chatting.'
      : localRunner
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
    selectedMode = ['fix', 'create', 'talk'].includes(mode) ? mode : 'fix';
    const modeDetails = {
      fix: {
        placeholder: 'Tell me what’s going wrong…',
        label: 'Message ScriptFix AI about a code problem',
        description: 'Choose a mode, then paste your code or describe what went wrong.'
      },
      create: {
        placeholder: 'Tell me what you want to do…',
        label: 'Describe what you want to create with ScriptFix AI',
        description: 'Choose a mode, then describe the small piece of code you want to make.'
      },
      talk: {
        placeholder: 'Ask anything about code…',
        label: 'Ask ScriptFix AI about code',
        description: 'Choose a mode, then ask a question or paste code you want to understand.'
      }
    }[selectedMode];
    promptBox.placeholder = modeDetails.placeholder;
    promptBox.setAttribute('aria-label', modeDetails.label);
    document.querySelectorAll('.mode-choice').forEach(button => {
      const selected = button.dataset.mode === selectedMode;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('welcomeDescription').textContent = modeDetails.description;
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
  const PALETTE_NAMES = ['sage', 'rose', 'lavender', 'sky', 'peach'];
  function applyPalette() {
    const saved = localStorage.getItem('scriptfix.palette') || 'sage';
    const palette = PALETTE_NAMES.includes(saved) ? saved : 'sage';
    document.body.dataset.palette = palette;
    document.querySelectorAll('.palette-choice').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.palette === palette));
    });
  }
  function readUsageConfig() {
    try { return JSON.parse(localStorage.getItem('scriptfix.usageConfig') || 'null'); }
    catch { return null; }
  }
  function usageMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function readUsageLedger() {
    try { return JSON.parse(localStorage.getItem('scriptfix.usageLedger') || '{}') || {}; }
    catch { return {}; }
  }
  function renderUsage() {
    const active = loadSettings();
    const puterPanel = $('puterUsagePanel');
    puterPanel.hidden = active.provider !== 'puter';
    if (active.provider === 'puter') {
      $('usageSetup').hidden = true;
      $('usageDashboard').hidden = true;
      return;
    }
    const config = readUsageConfig();
    const setup = $('usageSetup'), dashboard = $('usageDashboard');
    if (active.provider !== 'cloud') {
      setup.hidden = true; dashboard.hidden = true; return;
    }
    if (!config || !(Number(config.budget) > 0)) {
      setup.hidden = false; dashboard.hidden = true; prepareUsageSetup(); return;
    }
    setup.hidden = true; dashboard.hidden = false;
    const month = usageMonthKey();
    const stats = readUsageLedger()?.[month]?.[config.model] || { inputTokens: 0, outputTokens: 0, cost: 0, requests: 0 };
    const budget = Number(config.budget), spent = Number(stats.cost) || 0;
    const left = Math.max(0, budget - spent);
    const percent = Math.max(0, Math.min(100, (left / budget) * 100));
    const percentLabel = Math.floor(percent);
    $('usageCurrentModel').textContent = config.model;
    $('usagePercent').textContent = `${percentLabel}% budget left`;
    $('usageMeterFill').style.width = `${percent}%`;
    $('usageMeter').setAttribute('aria-valuenow', String(percentLabel));
    $('usageSpent').textContent = `$${spent.toFixed(4)} spent · ${Number(stats.requests) || 0} tracked requests`;
    $('usageRemaining').textContent = `$${left.toFixed(2)} left`;
    $('usageMonth').textContent = `Monthly budget · ${new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}`;
    $('usageTokenNote').textContent = active.model !== config.model
      ? `Currently selected API model is ${active.model}. The budget tracker follows the model selected in AI settings.`
      : !(Number(stats.requests) > 0)
      ? 'No tracked requests yet. After a successful API response includes token usage, this estimate will update. It is not your provider’s live account balance.'
      : 'Estimated from token usage returned by the API and the rates you selected. This is not your provider’s live account balance.';
  }
  function prepareUsageSetup() {
    const config = readUsageConfig();
    const model = loadSettings().model || DEFAULT_MODEL;
    const preset = COMMON_API_RATES[model];
    $('usageSelectedModel').textContent = model;
    $('usageBudget').value = config?.budget ?? '';
    $('usageCustomRates').hidden = Boolean(preset);
    $('usageSetupNote').textContent = preset
      ? 'The current model and its standard token prices are selected automatically. Enter your monthly budget to start.'
      : 'This model is not in the built-in price list. Add its input and output prices per million tokens to estimate spend.';
    $('usageInputRate').value = config?.model === model ? config.inputRate : (preset?.[0] ?? '');
    $('usageOutputRate').value = config?.model === model ? config.outputRate : (preset?.[1] ?? '');
    $('usageSetup').hidden = false;
    $('usageDashboard').hidden = true;
  }
  async function refreshPuterUsage() {
    const note = $('puterUsageNote');
    note.textContent = 'Loading your Puter account usage…';
    try {
      await puterSdkReady;
      const getMonthlyUsage = window.puter?.auth?.getMonthlyUsage;
      if (typeof getMonthlyUsage !== 'function') throw new Error('Puter usage is unavailable. Check your connection and sign in to Puter.');
      const usage = await getMonthlyUsage.call(window.puter.auth);
      const allowance = Number(usage?.allowanceInfo?.monthUsageAllowance);
      const remaining = Number(usage?.allowanceInfo?.remaining);
      if (!(allowance > 0) || !Number.isFinite(remaining)) throw new Error('Puter did not return a monthly allowance for this account.');
      const percent = Math.max(0, Math.min(100, remaining / allowance * 100));
      $('puterUsagePercent').textContent = `${Math.floor(percent)}% allowance left`;
      $('puterUsageMeterFill').style.width = `${percent}%`;
      $('puterUsageMeter').setAttribute('aria-valuenow', String(Math.floor(percent)));
      const dollars = amount => `$${(amount / 100000000).toFixed(2)}`;
      $('puterUsageSpent').textContent = `${dollars(allowance - remaining)} used this month`;
      $('puterUsageRemaining').textContent = `${dollars(remaining)} left`;
      note.textContent = 'Live monthly allowance reported by Puter for your account. It may include Puter services beyond ScriptFix.';
    } catch (error) {
      $('puterUsagePercent').textContent = 'Usage unavailable';
      $('puterUsageMeterFill').style.width = '0%';
      $('puterUsageSpent').textContent = '';
      $('puterUsageRemaining').textContent = '';
      note.textContent = error.message;
    }
  }
  function recordUsage(responseData, usedModel) {
    const config = readUsageConfig();
    const usage = responseData?.usage;
    if (!config || config.model !== usedModel || !usage) return;
    const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
    const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens);
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return;
    const month = usageMonthKey(), ledger = readUsageLedger();
    if (!ledger[month]) ledger[month] = {};
    const stats = ledger[month][usedModel] || { inputTokens: 0, outputTokens: 0, cost: 0, requests: 0 };
    stats.inputTokens += inputTokens; stats.outputTokens += outputTokens;
    stats.cost += (inputTokens * Number(config.inputRate) + outputTokens * Number(config.outputRate)) / 1000000;
    stats.requests += 1; ledger[month][usedModel] = stats;
    try { localStorage.setItem('scriptfix.usageLedger', JSON.stringify(ledger)); renderUsage(); }
    catch { showToast('Usage totals could not be saved in this browser.'); }
  }
  async function loadVersionInfo() {
    const content = $('versionInfoContent');
    content.textContent = 'Loading version information…';
    try {
      const response = await fetch(new URL('versioninfo.txt', appAssetsUrl), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load the notes (${response.status}).`);
      const text = await response.text();
      content.textContent = text.trim() || 'No version information has been added yet.';
    } catch (error) {
      content.textContent = `Couldn’t load source/versioninfo.txt. ${error.message}`;
    }
  }
  let developerUnlocked = false;
  let developerFileName = '';
  function unlockDeveloperTools() {
    if ($('developerCode').value.trim() !== DEVELOPER_ACCESS_CODE) {
      $('developerGateMessage').textContent = 'That code did not match. Try again.';
      $('developerCode').select();
      return;
    }
    developerUnlocked = true;
    $('developerGate').hidden = true;
    $('developerEditor').hidden = false;
    $('jsonEditorStatus').textContent = 'Paste JSON below or open a .json file.';
    $('jsonEditor').focus();
  }
  function sortJsonValue(value, field, descending) {
    let sortedArrays = 0;
    const compare = (left, right) => {
      const a = left == null ? '' : left;
      const b = right == null ? '' : right;
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    };
    const visit = current => {
      if (Array.isArray(current)) {
        const items = current.map(visit);
        const sortable = Boolean(field) && items.length > 1 && items.every(item => item && typeof item === 'object' && !Array.isArray(item) && Object.prototype.hasOwnProperty.call(item, field));
        if (sortable) {
          items.sort((left, right) => (descending ? -1 : 1) * compare(left[field], right[field]));
          sortedArrays++;
        }
        return items;
      }
      if (current && typeof current === 'object') {
        return Object.fromEntries(Object.keys(current).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map(key => [key, visit(current[key])]));
      }
      return current;
    };
    return { value: visit(value), sortedArrays };
  }
  function formatJsonEditor(sortArrays) {
    if (!developerUnlocked) return;
    const editor = $('jsonEditor');
    try {
      const parsed = JSON.parse(editor.value);
      if (sortArrays) {
        const field = $('jsonSortField').value.trim();
        const result = sortJsonValue(parsed, field, $('jsonSortOrder').value === 'desc');
        editor.value = JSON.stringify(result.value, null, 2);
        $('jsonEditorStatus').textContent = `Formatted JSON; sorted ${result.sortedArrays} array${result.sortedArrays === 1 ? '' : 's'} by “${field || 'object keys only'}”.`;
      } else {
        editor.value = JSON.stringify(parsed, null, 2);
        $('jsonEditorStatus').textContent = 'JSON formatted. Array order is unchanged.';
      }
    } catch (error) {
      $('jsonEditorStatus').textContent = `Could not parse JSON: ${error.message}`;
    }
  }
  function downloadJsonEditor() {
    if (!developerUnlocked) return;
    try {
      const text = JSON.stringify(JSON.parse($('jsonEditor').value), null, 2);
      const blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      const baseName = developerFileName.replace(/\.json$/i, '') || 'bookbeat-export';
      link.href = blobUrl; link.download = `${baseName}-sorted.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      $('jsonEditorStatus').textContent = `Downloaded ${baseName}-sorted.json.`;
    } catch (error) {
      $('jsonEditorStatus').textContent = `Could not save JSON: ${error.message}`;
    }
  }
  function renderPromptOptions() {
    document.querySelectorAll('#promptPreset option[data-custom-prompt]').forEach(option => option.remove());
    customPrompts.forEach(prompt => {
      const option = document.createElement('option');
      option.value = `custom:${prompt.id}`; option.textContent = prompt.title; option.dataset.customPrompt = 'true';
      $('promptPreset').append(option);
    });
  }
  function resetPromptForm() {
    editingPromptId = '';
    $('customPromptTitle').value = '';
    $('customPromptText').value = '';
    $('saveCustomPrompt').textContent = 'Save prompt';
    $('cancelCustomPrompt').hidden = true;
  }
  function renderPromptLibrary() {
    renderPromptOptions();
    const list = $('customPromptList'); list.replaceChildren();
    if (!customPrompts.length) {
      const empty = document.createElement('p'); empty.className = 'usage-note'; empty.textContent = 'No saved prompts yet.'; list.append(empty); return;
    }
    customPrompts.forEach(prompt => {
      const row = document.createElement('div'); row.className = 'custom-prompt-row';
      const details = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = prompt.title;
      const text = document.createElement('p'); text.textContent = prompt.text;
      details.append(title, text);
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingPromptId = prompt.id; $('customPromptTitle').value = prompt.title; $('customPromptText').value = prompt.text;
        $('saveCustomPrompt').textContent = 'Update prompt'; $('cancelCustomPrompt').hidden = false; $('customPromptTitle').focus();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
      remove.addEventListener('click', () => {
        customPrompts = customPrompts.filter(item => item.id !== prompt.id);
        try { localStorage.setItem('scriptfix.customPrompts', JSON.stringify(customPrompts)); renderPromptLibrary(); }
        catch { showToast('Could not update saved prompts in this browser.'); }
      });
      row.append(details, edit, remove); list.append(row);
    });
  }
  function saveCustomPrompt() {
    const title = $('customPromptTitle').value.trim(), text = $('customPromptText').value.trim();
    if (!title || !text) { $('promptLibraryStatus').textContent = 'Add a name and instructions before saving.'; return; }
    const previous = customPrompts;
    const next = editingPromptId
      ? customPrompts.map(prompt => prompt.id === editingPromptId ? { ...prompt, title, text } : prompt)
      : [...customPrompts, { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, text }];
    if (next.length > 40) { $('promptLibraryStatus').textContent = 'You can save up to 40 prompts.'; return; }
    try {
      localStorage.setItem('scriptfix.customPrompts', JSON.stringify(next));
      customPrompts = next; renderPromptLibrary(); resetPromptForm();
      $('promptLibraryStatus').textContent = 'Prompt saved in this browser.';
    } catch {
      customPrompts = previous;
      $('promptLibraryStatus').textContent = 'Browser storage is full. Delete a prompt or free space, then try again.';
    }
  }
  function normalizeImportedChat(chat, index) {
    if (!chat || typeof chat !== 'object' || !Array.isArray(chat.messages)) return null;
    const messages = chat.messages.filter(message => message && !message.isError && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').map(message => ({
      id: typeof message.id === 'string' ? message.id : `import-${index}-${Math.random().toString(36).slice(2, 8)}`,
      role: message.role,
      content: message.content,
      ...(typeof message.display === 'string' ? { display: message.display } : {}),
      ...(Array.isArray(message.files) ? { files: message.files.filter(file => file && typeof file.name === 'string' && typeof file.text === 'string').map(file => ({ name: file.name, text: file.text, ...(typeof file.undoText === 'string' ? { undoText: file.undoText } : {}) })) } : {}),
      ...(typeof message.sourceMessageId === 'string' ? { sourceMessageId: message.sourceMessageId } : {}),
      ...(typeof message.prompt === 'string' ? { prompt: message.prompt } : {})
    }));
    if (!messages.length) return null;
    const id = typeof chat.id === 'string' && chat.id ? chat.id : `import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      title: typeof chat.title === 'string' ? chat.title.slice(0, 120) : 'Imported conversation',
      mode: ['fix', 'create', 'talk'].includes(chat.mode) ? chat.mode : 'fix',
      updatedAt: Number.isFinite(Number(chat.updatedAt)) ? Number(chat.updatedAt) : Date.now(),
      messages
    };
  }
  function exportChatArchive() {
    const archive = { format: 'scriptfix-ai-chat-archive', version: 1, exportedAt: new Date().toISOString(), chats: savedChats };
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `scriptfix-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importChatArchive(file) {
    if (file.size > 20 * 1024 * 1024) { showToast('That chat backup is over 20 MB.'); return; }
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (error) { showToast(`This backup is not valid JSON: ${error.message}`); return; }
    const rawChats = Array.isArray(data) ? data : data?.format === 'scriptfix-ai-chat-archive' && Array.isArray(data.chats) ? data.chats : null;
    if (!rawChats) { showToast('This file is not a ScriptFix chat backup.'); return; }
    const imported = [...new Map(rawChats.map(normalizeImportedChat).filter(Boolean).map(chat => [chat.id, chat])).values()];
    if (!imported.length) { showToast('No valid conversations were found in this backup.'); return; }
    if (!confirm(`Merge ${imported.length} chat${imported.length === 1 ? '' : 's'} into this browser? Imported chats replace any with matching IDs.`)) return;
    const importIds = new Set(imported.map(chat => chat.id));
    const next = [...imported, ...savedChats.filter(chat => !importIds.has(chat.id))].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_CHATS);
    try { localStorage.setItem('scriptfix.chats', JSON.stringify(next)); }
    catch { showToast('There is not enough browser storage for this backup. Export or remove some saved chats and try again.'); return; }
    savedChats = next;
    if (activeChat && importIds.has(activeChat.id)) openChat(activeChat.id);
    else renderChatHistory();
    const keptImported = next.filter(chat => importIds.has(chat.id)).length;
    showToast(`Imported ${keptImported} chat${keptImported === 1 ? '' : 's'}.`);
  }
  function setSettingsCategory(category) {
    if (category !== 'developer') developerUnlocked = false;
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
    if (category === 'usage') {
      renderUsage();
      if (loadSettings().provider === 'puter') refreshPuterUsage();
    }
    if (category === 'version') loadVersionInfo();
    if (category === 'prompts') renderPromptLibrary();
    if (category === 'developer') {
      developerUnlocked = false;
      $('developerGate').hidden = false;
      $('developerEditor').hidden = true;
      $('developerCode').value = '';
      $('developerGateMessage').textContent = 'This is a simple in-app gate, not a secure password.';
      setTimeout(() => $('developerCode').focus(), 0);
    }
  }
  function persistChats() {
    if (!activeChat || !activeChat.messages.length) return;
    activeChat.updatedAt = Date.now();
    savedChats = savedChats.filter(chat => chat.id !== activeChat.id);
    savedChats.unshift(activeChat);
    savedChats = savedChats.slice(0, MAX_SAVED_CHATS);
    localStorage.setItem('scriptfix.activeChat', activeChat.id);
    try { localStorage.setItem('scriptfix.chats', JSON.stringify(savedChats)); }
    catch {
      const recent = savedChats.slice(0, 12);
      try { localStorage.setItem('scriptfix.chats', JSON.stringify(recent)); savedChats = recent; showToast('Browser storage is tight. ScriptFix kept your 12 most recent chats.'); }
      catch { showToast('Chat history could not be saved because this browser is out of storage.'); }
    }
    renderChatHistory();
    updateDesktopPromo();
  }
  function renderChatHistory() {
    const list = $('chatHistory'); list.replaceChildren();
    const query = $('chatSearch').value.trim().toLowerCase();
    const ordered = [...savedChats].sort((a, b) => b.updatedAt - a.updatedAt);
    ordered.filter(chat => !query || `${chat.title} ${(chat.messages || []).map(message => message.display || message.content).join(' ')}`.toLowerCase().includes(query)).forEach(chat => {
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
    chat.messages.forEach(message => { if (!message.id) message.id = newMessageId(); });
    setChatMode(chat.mode || 'fix');
    messages.replaceChildren();
    $('welcome').hidden = chat.messages.length > 0;
    chat.messages.forEach(message => addMessage(message.role, message.display || message.content, false, true, message.content, message.sourceMessageId));
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
  function newMessageId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
  function addMessage(role, content, isTyping = false, skipSave = false, savedContent = content, sourceMessageId = '') {
    $('welcome').hidden = true;
    const row = document.createElement('div'); row.className = `message ${role}`;
    if (role === 'assistant') {
      const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = '✳'; row.append(avatar);
    }
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    if (isTyping) {
      bubble.innerHTML = '<div class="typing" aria-label="Thinking"><i></i><i></i><i></i></div>';
    } else if (role === 'assistant') {
      renderAssistant(bubble, content, sourceMessageId);
    } else {
      bubble.textContent = content;
    }
    row.append(bubble); messages.append(row); scrollToBottom();
    if (!isTyping && !skipSave) {
      const chat = beginChat();
      chat.messages.push({ id: newMessageId(), role, content: savedContent, display: content, ...(sourceMessageId ? { sourceMessageId } : {}) });
      if (role === 'user' && chat.title === 'New conversation') {
        chat.title = (content || 'New conversation').replace(/\s+/g, ' ').trim().slice(0, 34) || 'New conversation';
      }
      persistChats();
    }
    return row;
  }
  function renderAssistant(bubble, content, sourceMessageId = '') {
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
        header.append(title, copy);
        if (/^(js|javascript|jsx)$/i.test(lang)) {
          const run = document.createElement('button'); run.className = 'copy-code'; run.textContent = 'Run safely';
          run.addEventListener('click', () => runJavaScriptSafely(code, run)); header.append(run);
        }
        const sourceId = sourceMessageId || latestSourceMessage()?.id || '';
        if (sourceId && filesForUserMessage(findMessageById(sourceId)).length) {
          const review = document.createElement('button'); review.className = 'copy-code'; review.textContent = 'Review changes';
          review.addEventListener('click', () => showDiff(wrap, sourceId, code)); header.append(review);
        }
        const pre = document.createElement('pre'); pre.className = 'code-body'; pre.textContent = code;
        wrap.append(header, pre); container.append(wrap);
      }
    }
    if (!container.childElementCount) { const p = document.createElement('p'); p.textContent = content; container.append(p); }
    bubble.append(container);
  }
  function parseLegacyProjectFiles(content) {
    const files = [], pattern = /\n\nProject file: ([^\r\n]+)\r?\n\r?\n```[^\r\n`]*\r?\n([\s\S]*?)```/g;
    let match;
    while ((match = pattern.exec(content || ''))) files.push({ name: match[1], text: match[2] });
    return { files, prompt: (content || '').replace(pattern, '').trim() };
  }
  function filesForUserMessage(message) {
    if (!message || message.role !== 'user') return [];
    if (Array.isArray(message.files)) return message.files;
    return parseLegacyProjectFiles(message.content).files;
  }
  function findMessageById(id) { return activeChat?.messages?.find(message => message.id === id) || null; }
  function latestSourceMessage() {
    return [...(activeChat?.messages || [])].reverse().find(message => message.role === 'user' && filesForUserMessage(message).length) || null;
  }
  function requestMessage(message) {
    const files = Array.isArray(message.files) ? message.files : [];
    const content = files.length
      ? `${message.content || ''}${files.map(file => `\n\nProject file: ${file.name}\n\n\`\`\`${file.name.split('.').pop()}\n${file.text}\n\`\`\``).join('')}`
      : message.content;
    return { role: message.role, content };
  }
  function conversationMessages() { return (activeChat?.messages || []).filter(message => !message.isError).map(requestMessage); }
  function alignedDiffRows(before, after) {
    const oldLines = before.replace(/\r\n/g, '\n').split('\n'), newLines = after.replace(/\r\n/g, '\n').split('\n');
    const rows = []; let oldIndex = 0, newIndex = 0;
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
        rows.push({ oldLine: oldLines[oldIndex], newLine: newLines[newIndex], oldNumber: oldIndex + 1, newNumber: newIndex + 1, kind: 'context' }); oldIndex++; newIndex++; continue;
      }
      let sync = null;
      for (let distance = 1; distance <= 12 && !sync; distance++) {
        for (let oldOffset = 0; oldOffset <= distance; oldOffset++) {
          const newOffset = distance - oldOffset;
          if (oldIndex + oldOffset < oldLines.length && newIndex + newOffset < newLines.length && oldLines[oldIndex + oldOffset] === newLines[newIndex + newOffset]) { sync = { oldOffset, newOffset }; break; }
        }
      }
      const oldCount = sync ? sync.oldOffset : Math.min(1, oldLines.length - oldIndex);
      const newCount = sync ? sync.newOffset : Math.min(1, newLines.length - newIndex);
      const paired = Math.min(oldCount, newCount);
      for (let offset = 0; offset < paired; offset++) rows.push({ oldLine: oldLines[oldIndex + offset], newLine: newLines[newIndex + offset], oldNumber: oldIndex + offset + 1, newNumber: newIndex + offset + 1, kind: 'change' });
      for (let offset = paired; offset < oldCount; offset++) rows.push({ oldLine: oldLines[oldIndex + offset], newLine: '', oldNumber: oldIndex + offset + 1, newNumber: '', kind: 'removed' });
      for (let offset = paired; offset < newCount; offset++) rows.push({ oldLine: '', newLine: newLines[newIndex + offset], oldNumber: '', newNumber: newIndex + offset + 1, kind: 'added' });
      oldIndex += oldCount; newIndex += newCount;
      if (!oldCount && !newCount) {
        if (oldIndex < oldLines.length) { rows.push({ oldLine: oldLines[oldIndex], newLine: '', oldNumber: oldIndex + 1, newNumber: '', kind: 'removed' }); oldIndex++; }
        if (newIndex < newLines.length) { rows.push({ oldLine: '', newLine: newLines[newIndex], oldNumber: '', newNumber: newIndex + 1, kind: 'added' }); newIndex++; }
      }
    }
    return rows;
  }
  function makeDiffPane(title, side, rows) {
    const pane = document.createElement('section'); pane.className = 'diff-pane';
    const heading = document.createElement('div'); heading.className = 'diff-pane-title'; heading.textContent = title; pane.append(heading);
    const list = document.createElement('div'); list.className = 'diff-rows';
    rows.forEach(row => {
      const line = document.createElement('div'); line.className = `diff-row diff-${row.kind}`;
      const number = document.createElement('span'); number.className = 'diff-line-number'; number.textContent = row[side === 'old' ? 'oldNumber' : 'newNumber'] || '';
      const content = document.createElement('span'); content.className = 'diff-line-text'; content.textContent = row[side === 'old' ? 'oldLine' : 'newLine'] || ' ';
      line.append(number, content); list.append(line);
    });
    pane.append(list); return pane;
  }
  function persistUpdatedSource(message, files) {
    if (!Array.isArray(message.files)) {
      const legacy = parseLegacyProjectFiles(message.content);
      message.content = legacy.prompt;
      message.files = legacy.files;
    }
    message.files = files;
    persistChats();
  }
  function showDiff(wrap, sourceMessageId, after) {
    wrap.querySelector('.diff-review')?.remove();
    const sourceMessage = findMessageById(sourceMessageId);
    const sourceFiles = filesForUserMessage(sourceMessage);
    if (!sourceFiles.length) return;
    const panel = document.createElement('section'); panel.className = 'diff-review';
    const toolbar = document.createElement('div'); toolbar.className = 'diff-toolbar';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Choose source file to compare');
    sourceFiles.forEach((file, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = file.name; select.append(option); });
    const status = document.createElement('p'); status.className = 'diff-status'; status.setAttribute('aria-live', 'polite');
    const columns = document.createElement('div'); columns.className = 'diff-columns';
    const actions = document.createElement('div'); actions.className = 'diff-actions';
    const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Apply to chat file';
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Undo';
    const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Download copy';
    toolbar.append(select); actions.append(apply, undo, download); panel.append(toolbar, status, columns, actions); wrap.append(panel);
    let selectedFile = sourceFiles[0];
    const render = () => {
      const index = Number(select.value); selectedFile = sourceFiles[index];
      const rows = alignedDiffRows(selectedFile.text, after);
      columns.replaceChildren(makeDiffPane('Attached version', 'old', rows), makeDiffPane('Suggested version', 'new', rows));
      const changed = selectedFile.text !== after;
      status.textContent = changed ? `${rows.filter(row => row.kind !== 'context').length} changed line${rows.filter(row => row.kind !== 'context').length === 1 ? '' : 's'} in ${selectedFile.name}.` : `${selectedFile.name} already matches this suggestion.`;
      apply.hidden = !changed; undo.hidden = typeof selectedFile.undoText !== 'string';
    };
    select.addEventListener('change', render);
    apply.addEventListener('click', () => {
      const index = Number(select.value), file = sourceMessage.files?.[index] || sourceFiles[index];
      file.undoText = file.text; file.text = after;
      persistUpdatedSource(sourceMessage, sourceFiles);
      render(); status.textContent = `Applied to ${file.name}. Undo is available in this chat.`; showToast('Suggestion applied to the chat file.');
    });
    undo.addEventListener('click', () => {
      const index = Number(select.value), file = sourceMessage.files?.[index] || sourceFiles[index];
      file.text = file.undoText; delete file.undoText;
      persistUpdatedSource(sourceMessage, sourceFiles);
      render(); status.textContent = `Restored the previous version of ${file.name}.`; showToast('Change undone.');
    });
    download.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([after], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `${selectedFile.name.replace(/\.[^.]+$/, '')}.fixed${selectedFile.name.match(/\.[^.]+$/)?.[0] || '.txt'}`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    render();
  }
  function runJavaScriptSafely(code, button) {
    const frame = document.createElement('iframe'); frame.sandbox = 'allow-scripts'; frame.className = 'safe-runner';
    const escaped = code.replace(/<\/script/gi, '<\\/script');
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'"><script>const send=(type,value)=>parent.postMessage({scriptfixRunner:true,type,value:String(value)},'*');console.log=(...items)=>send('log',items.join(' '));window.onerror=(message)=>send('error',message);try{${escaped}}catch(error){send('error',error.stack||error.message)}<\/script>`;
    const output = document.createElement('pre'); output.className = 'run-output'; output.textContent = 'Running in an isolated browser sandbox…';
    const listener = event => { if (!event.data?.scriptfixRunner) return; output.textContent += `\n${event.data.type === 'error' ? 'Error: ' : ''}${event.data.value}`; };
    window.addEventListener('message', listener); setTimeout(() => window.removeEventListener('message', listener), 10000);
    button.closest('.code-wrap').append(frame, output);
  }
  async function readStream(response, onChunk) {
    const reader = response.body?.getReader(); if (!reader) return '';
    const decoder = new TextDecoder(); let buffer = '', full = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        const payload = line.replace(/^data:\s*/, '').trim(); if (!payload || payload === '[DONE]') continue;
        try { const data = JSON.parse(payload); const text = data.choices?.[0]?.delta?.content || data.message?.content || ''; if (text) { full += text; onChunk(full); } } catch { /* Ignore non-message stream lines. */ }
      }
    }
    return full;
  }
  async function readPuterStream(result, onChunk) {
    if (!result?.[Symbol.asyncIterator]) return '';
    let full = '';
    for await (const part of result) {
      const text = part?.text || part?.message?.content || part?.choices?.[0]?.delta?.content || '';
      if (text) { full += text; onChunk(full); }
    }
    return full;
  }
  function openSettings() {
    const cfg = loadSettings(); $('apiKey').value = cfg.key; $('provider').value = cfg.provider;
    setSettingsCategory('provider');
    applyTheme();
    syncProviderSettings();
    dialog.showModal();
    if (!$('modelShelf').hidden) refreshModelShelf();
    setTimeout(() => (cfg.provider === 'cloud' ? $('apiKey') : (cfg.provider === 'local' ? $('model') : $('modelPicker'))).focus(), 50);
  }
  $('settingsButton').addEventListener('click', openSettings);
  $('apiKeyButton').addEventListener('click', openSettings);
  if (desktopApp) {
    $('desktopControls').hidden = false;
    document.querySelectorAll('[data-window-action]').forEach(button => button.addEventListener('click', () => {
      window.chrome?.webview?.postMessage(`window:${button.dataset.windowAction}`);
    }));
    document.querySelector('.topbar').addEventListener('dblclick', event => {
      if (!event.target.closest('button,a')) window.chrome?.webview?.postMessage('window:maximize');
    });
    document.querySelector('.topbar').addEventListener('pointerdown', event => {
      if (!event.target.closest('button,a')) window.chrome?.webview?.postMessage('window:drag');
    });
  }
  document.querySelectorAll('[data-settings-tab]').forEach(button => button.addEventListener('click', () => setSettingsCategory(button.dataset.settingsTab)));
  $('developerUnlock').addEventListener('click', unlockDeveloperTools);
  $('saveCustomPrompt').addEventListener('click', saveCustomPrompt);
  $('cancelCustomPrompt').addEventListener('click', resetPromptForm);
  $('developerCode').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); unlockDeveloperTools(); }
  });
  $('openJsonFile').addEventListener('click', () => $('jsonFilePicker').click());
  $('jsonFilePicker').addEventListener('change', async event => {
    if (!developerUnlocked) { event.target.value = ''; return; }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      $('jsonEditor').value = await file.text();
      developerFileName = file.name;
      $('jsonFileName').textContent = file.name;
      $('jsonEditorStatus').textContent = `Opened ${file.name}. Sort or format it, then download a separate copy.`;
      $('jsonEditor').focus();
    } catch (error) {
      $('jsonEditorStatus').textContent = `Could not read ${file.name}: ${error.message}`;
    }
    event.target.value = '';
  });
  $('sortJson').addEventListener('click', () => formatJsonEditor(true));
  $('formatJson').addEventListener('click', () => formatJsonEditor(false));
  $('downloadJson').addEventListener('click', downloadJsonEditor);
  $('startUsageTracking').addEventListener('click', () => {
    const model = loadSettings().model || DEFAULT_MODEL;
    const budget = Number($('usageBudget').value);
    const preset = COMMON_API_RATES[model];
    const inputRate = preset?.[0] ?? Number($('usageInputRate').value), outputRate = preset?.[1] ?? Number($('usageOutputRate').value);
    if (!(budget > 0) || !Number.isFinite(budget)) { showToast('Enter a monthly budget greater than zero.'); $('usageBudget').focus(); return; }
    if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate < 0 || outputRate < 0 || inputRate + outputRate === 0) { showToast('Enter valid input and output prices for this model.'); return; }
    const previous = readUsageConfig();
    localStorage.setItem('scriptfix.usageConfig', JSON.stringify({ model, budget, inputRate, outputRate }));
    if (previous?.model !== model) {
      const currentMonth = usageMonthKey(), ledger = readUsageLedger();
      if (!ledger[currentMonth]) ledger[currentMonth] = {};
      if (!ledger[currentMonth][model]) ledger[currentMonth][model] = { inputTokens: 0, outputTokens: 0, cost: 0, requests: 0 };
      localStorage.setItem('scriptfix.usageLedger', JSON.stringify(ledger));
    }
    renderUsage();
    showToast('Monthly usage tracking is on.');
  });
  $('editUsage').addEventListener('click', prepareUsageSetup);
  $('refreshPuterUsage').addEventListener('click', refreshPuterUsage);
  $('darkModeToggle').addEventListener('change', () => {
    localStorage.setItem('scriptfix.theme', $('darkModeToggle').checked ? 'dark' : 'light');
    applyTheme();
  });
  document.querySelectorAll('.palette-choice').forEach(button => button.addEventListener('click', () => {
    if (!PALETTE_NAMES.includes(button.dataset.palette)) return;
    localStorage.setItem('scriptfix.palette', button.dataset.palette);
    applyPalette();
  }));
  $('provider').addEventListener('change', syncProviderSettings);
  $('model').addEventListener('change', () => {
    if ($('provider').value === 'cloud') {
      localStorage.setItem('scriptfix.model', $('model').value.trim() || DEFAULT_MODEL);
      if (!$('usageSetup').hidden) prepareUsageSetup();
      else renderUsage();
    }
  });
  $('modelPicker').addEventListener('change', () => {
    renderModelDetails();
    if ($('provider').value === 'cloud') {
      localStorage.setItem('scriptfix.model', $('modelPicker').value || DEFAULT_MODEL);
      if (!$('usageSetup').hidden) prepareUsageSetup();
      else renderUsage();
    } else if ($('provider').value === 'puter') {
      localStorage.setItem('scriptfix.puterModel', $('modelPicker').value || DEFAULT_PUTER_MODEL);
    }
  });
  $('modelSearch').addEventListener('input', refreshModelShelf);
  $('modelCatalog').addEventListener('change', () => { $('model').value = $('modelCatalog').value; });
  $('installOllama').addEventListener('click', async () => {
    const button = $('installOllama'); button.disabled = true; button.textContent = 'Opening setup…';
    try {
      const response = await fetch('/install-ollama', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Could not start setup (${response.status}).`);
      $('modelStatus').textContent = 'Ollama is installing in the background. ScriptFix will connect automatically when it is ready.';
      if (desktopApp) beginDesktopSetup();
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
      localStorage.setItem('scriptfix.model', $('modelPicker').value || DEFAULT_MODEL);
    } else if (provider === 'puter') {
      localStorage.setItem('scriptfix.puterModel', $('modelPicker').value || DEFAULT_PUTER_MODEL);
    } else {
      localStorage.setItem('scriptfix.localModel', $('model').value.trim() || DEFAULT_LOCAL_MODEL);
    }
    localStorage.setItem('scriptfix.provider', provider);
    dialog.close(); showToast('Settings saved on this device.');
  });
  $('clearKey').addEventListener('click', () => { localStorage.removeItem('scriptfix.key'); $('apiKey').value = ''; showToast('Saved API key cleared.'); });
  document.querySelectorAll('.mode-choice').forEach(button => button.addEventListener('click', () => setChatMode(button.dataset.mode)));
  $('newChat').addEventListener('click', () => {
    setMobileSidebarOpen(false);
    activeChat = null; localStorage.removeItem('scriptfix.activeChat');
    setChatMode('fix');
    messages.replaceChildren(); $('welcome').hidden = false; promptBox.value = ''; attachedFiles = []; $('fileLabel').textContent = ''; renderChatHistory(); promptBox.focus();
  });
  $('clearHistory').addEventListener('click', () => {
    if (!savedChats.length || !confirm('Delete all saved chats from this browser?')) return;
    savedChats = []; activeChat = null; localStorage.removeItem('scriptfix.chats'); localStorage.removeItem('scriptfix.activeChat');
    messages.replaceChildren(); $('welcome').hidden = false; setChatMode('fix'); renderChatHistory(); showToast('Saved chats cleared.');
  });
  $('chatSearch').addEventListener('input', renderChatHistory);
  $('exportChats').addEventListener('click', () => {
    const markdown = savedChats.map(chat => [`# ${chat.title || 'Conversation'}`, ...(chat.messages || []).map(message => `## ${message.role === 'user' ? 'You' : 'ScriptFix AI'}\n\n${message.display || message.content}`)].join('\n\n')).join('\n\n---\n\n');
    const blob = new Blob([markdown || '# ScriptFix AI conversations\n\nNo saved chats.'], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'scriptfix-ai-chats.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('backupChats').addEventListener('click', exportChatArchive);
  $('importChats').addEventListener('click', () => $('chatArchivePicker').click());
  $('chatArchivePicker').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importChatArchive(file);
    event.target.value = '';
  });
  $('attachButton').addEventListener('click', () => $('fileInput').click());
  $('uploadSide').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (event) => {
    const files = [...event.target.files]; if (!files.length) return;
    const maxBytes = 500 * 1024, maxFiles = 8;
    if (files.length > maxFiles || files.some(file => file.size > maxBytes)) { showToast(`Attach up to ${maxFiles} files, each under 500 KB.`); event.target.value = ''; return; }
    attachedFiles = await Promise.all(files.map(async file => ({ name: file.name, text: await file.text() })));
    $('fileLabel').textContent = `↳ ${attachedFiles.length === 1 ? attachedFiles[0].name : `${attachedFiles.length} project files`}`;
    showToast(`${attachedFiles.length} file${attachedFiles.length === 1 ? '' : 's'} attached.`);
  });
  $('promptPreset').addEventListener('change', event => {
    if (!event.target.value) return;
    const prompt = event.target.value.startsWith('custom:')
      ? customPrompts.find(item => item.id === event.target.value.slice(7))?.text
      : event.target.value;
    if (prompt) {
      const existing = promptBox.value.trim();
      promptBox.value = existing ? `${prompt}\n\n${existing}` : prompt;
      promptBox.dispatchEvent(new Event('input')); promptBox.focus();
    }
    event.target.value = '';
  });
  document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => { promptBox.value = button.dataset.prompt; promptBox.focus(); promptBox.dispatchEvent(new Event('input')); }));
  promptBox.addEventListener('input', () => { promptBox.style.height = 'auto'; promptBox.style.height = `${Math.min(promptBox.scrollHeight, 125)}px`; });
  promptBox.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } });
  $('sendButton').addEventListener('click', send);
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('newChat').click(); } });
  renderChatHistory();
  renderPromptOptions();
  setChatMode('fix');
  applyTheme();
  applyPalette();
  if (desktopApp) beginDesktopSetup();
  const savedActiveId = localStorage.getItem('scriptfix.activeChat');
  if (savedActiveId && savedChats.some(chat => chat.id === savedActiveId)) openChat(savedActiveId);
  $('appBootScreen').hidden = true;

  async function beginDesktopSetup() {
    const screen = $('ollamaSetupScreen');
    const title = $('setupTitle');
    const description = $('setupDescription');
    const continueButton = $('setupContinue');
    screen.hidden = false;
    let attempts = 0;
    while (attempts < 240) {
      attempts++;
      try {
        const response = await fetch('/local-models', { cache: 'no-store' });
        if (response.ok) { screen.hidden = true; return; }
        const statusResponse = await fetch('/ollama-setup-status', { cache: 'no-store' });
        const status = statusResponse.ok ? await statusResponse.json() : {};
        if (status.state === 'error') {
          title.textContent = 'Ollama setup needs attention';
          description.textContent = status.message || 'The automatic setup did not finish. You can continue using the desktop app and retry from AI settings.';
          continueButton.hidden = false;
        } else if (status.state === 'installing') {
          title.textContent = 'Installing Ollama';
          description.textContent = 'The download is complete. Ollama is being installed on this computer.';
          continueButton.hidden = true;
        } else if (status.state === 'verifying') {
          title.textContent = 'Verifying the download';
          description.textContent = 'Checking the official installer before it runs.';
          continueButton.hidden = true;
        } else {
          title.textContent = 'Downloading Ollama';
          description.textContent = 'Getting the official installer. This can take a few minutes; ScriptFix will continue automatically when it’s ready.';
          continueButton.hidden = true;
        }
      } catch {
        title.textContent = 'Preparing your desktop AI';
        description.textContent = 'Starting the local setup. This screen will close automatically when Ollama is ready.';
      }
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    title.textContent = 'Setup is taking longer than expected';
    description.textContent = 'Ollama may still be downloading. You can keep waiting or continue and check AI settings later.';
    continueButton.hidden = false;
  }
  $('setupContinue').addEventListener('click', () => { $('ollamaSetupScreen').hidden = true; });

  function puterFailureMessage(error) {
    const detail = String(error?.message || 'No additional error details were returned.');
    if (/sign.?in|log.?in|auth|unauthori[sz]ed|\b401\b/i.test(detail)) return `Puter needs you to sign in. Check whether a Puter sign-in window was blocked or dismissed, sign in, then retry.\n\nDetails: ${detail}`;
    if (/limit|quota|credit|allowance|insufficient|\b402\b|\b429\b/i.test(detail)) return `Puter may have reached an account usage limit. Check Settings → Usage for your allowance; if it is exhausted, wait for the reset or review your Puter account before retrying.\n\nDetails: ${detail}`;
    return `ScriptFix couldn’t reach Puter. Check your connection and whether your browser blocks Puter sign-in windows or scripts, then retry.\n\nDetails: ${detail}`;
  }
  function addPuterRetryActions(errorRow) {
    const savedError = activeChat?.messages?.at(-1);
    if (savedError?.role === 'assistant') { savedError.isError = true; persistChats(); }
    const actions = document.createElement('div'); actions.className = 'puter-error-actions';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'puter-retry'; retry.textContent = 'Try again';
    retry.addEventListener('click', () => {
      errorRow.remove();
      const last = activeChat?.messages?.at(-1);
      if (last?.isError) { activeChat.messages.pop(); persistChats(); }
      send(true);
    });
    const account = document.createElement('a'); account.href = 'https://puter.com/'; account.target = '_blank'; account.rel = 'noopener noreferrer'; account.textContent = 'Open Puter';
    actions.append(retry, account); errorRow.querySelector('.bubble')?.append(actions);
  }
  async function send(retryExisting = false) {
    if (busy) return;
    const userText = retryExisting ? '' : promptBox.value.trim();
    if (!retryExisting && !userText && !attachedFiles.length) { showToast('Write a message or attach one or more files first.'); promptBox.focus(); return; }
    const cfg = loadSettings();
    if (localFileApp && !desktopApp) { showToast('Open ScriptFix AI from a local web server or hosted website to connect to an AI service.'); return; }
    if (cfg.provider === 'cloud' && !cfg.key) { openSettings(); showToast('Add your API key to get started.'); return; }
    const filesForRequest = retryExisting ? [] : attachedFiles;
    const displayText = [userText, ...filesForRequest.map(file => `📎 ${file.name}`)].filter(Boolean).join('\n');
    const chatMode = activeChat?.mode || selectedMode;
    const system = chatMode === 'create'
      ? 'You are ScriptFix AI in Create Code mode, a careful and friendly programming assistant. Help the user create small, useful pieces of code from their ideas. If an essential requirement is unclear, ask one concise question; otherwise make reasonable assumptions and state them. Provide complete, runnable code in a fenced code block with the correct language label, include brief usage instructions, and avoid unnecessary dependencies. Explain important choices and never claim to have executed code unless you actually did.'
      : chatMode === 'talk'
      ? 'You are ScriptFix AI in Talk About Code mode, a clear, curious, and friendly programming conversation partner. Help users understand code, explore concepts, compare technical approaches, and think through tradeoffs. Match the user’s experience level, explain terms plainly, and use short examples when they help. Do not provide a full replacement script unless the user asks for one. If code has a likely bug or risk, mention it clearly. Never claim to have executed code unless you actually did.'
      : 'You are ScriptFix AI in Fix Code mode, a careful and friendly programming assistant. Help users debug, explain, and improve code. When suggesting a corrected script, include a complete runnable version in a fenced code block with the language label. Explain the important changes briefly. Preserve the user’s intent. Call out assumptions and potentially destructive behavior. Never claim to have executed code unless you actually did.';
    if (retryExisting) {
      if (!activeChat?.messages?.some(message => message.role === 'user')) { showToast('There is no earlier message to retry.'); return; }
    } else {
      const userContent = userText || (chatMode === 'talk' ? 'Please explain this code in plain language.' : 'Please inspect this script for bugs and suggest a corrected version.');
      addMessage('user', displayText, false, false, userContent);
      const currentUserMessage = activeChat.messages.at(-1);
      if (filesForRequest.length) currentUserMessage.files = filesForRequest.map(file => ({ name: file.name, text: file.text }));
      currentUserMessage.prompt = userContent;
      persistChats();
    }
    const sourceMessageId = latestSourceMessage()?.id || '';
    promptBox.value = ''; promptBox.style.height = 'auto'; attachedFiles = []; $('fileLabel').textContent = ''; $('fileInput').value = '';
    busy = true; $('sendButton').disabled = true;
    const typingRow = addMessage('assistant', '', true);
    try {
      if (cfg.provider === 'puter') {
        await puterSdkReady;
        if (!window.puter?.ai?.chat) throw new Error('Puter Cloud could not load. Check your internet connection and reopen the app.');
        const result = await window.puter.ai.chat([
          { role: 'system', content: system },
          ...conversationMessages()
        ], { model: cfg.puterModel || DEFAULT_PUTER_MODEL, normalize: true, stream: true });
        const bubble = typingRow.querySelector('.bubble'); bubble.textContent = '';
        const streamedReply = await readPuterStream(result, text => { bubble.textContent = text; scrollToBottom(); });
        const reply = streamedReply || result?.message?.content;
        if (!reply) throw new Error('Puter returned an empty response. Try again or choose another model in AI settings.');
        renderAssistant(bubble, reply, sourceMessageId);
        const chat = beginChat(); chat.messages.push({ id: newMessageId(), role: 'assistant', content: reply, display: reply, ...(sourceMessageId ? { sourceMessageId } : {}) }); persistChats();
        return;
      }
      const local = cfg.provider === 'local';
      const localRunner = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port !== '11434';
      const endpoint = local ? (localRunner ? new URL('/local-chat', location.origin).href : DEFAULT_LOCAL_ENDPOINT) : cfg.endpoint;
      const headers = { 'Content-Type': 'application/json' };
      if (!local) headers.Authorization = `Bearer ${cfg.key}`;
      const response = await fetch(endpoint, {
        method: 'POST', headers,
        ...(local && desktopApp && !localRunner ? { targetAddressSpace: 'loopback' } : {}),
        body: JSON.stringify({ model: local ? cfg.localModel : cfg.model, messages: [{ role: 'system', content: system }, ...conversationMessages()], temperature: 0.2, stream: true })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
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
      const bubble = typingRow.querySelector('.bubble'); bubble.textContent = '';
      const reply = await readStream(response, text => { bubble.textContent = text; scrollToBottom(); });
      if (!reply) throw new Error('The API returned an empty response. Check that your selected model supports streaming chat completions.');
      renderAssistant(bubble, reply, sourceMessageId);
      const chat = beginChat(); chat.messages.push({ id: newMessageId(), role: 'assistant', content: reply, display: reply, ...(sourceMessageId ? { sourceMessageId } : {}) }); persistChats();
    } catch (error) {
      typingRow.remove();
      let errorMessage;
      if (error.isCreditBalanceError) {
        errorMessage = `The API responded with a billing error: it reports that the selected organization has no available API credits. Your API key can still be valid; API billing is separate from a ChatGPT subscription.\n\nCheck the billing balance for the organization and project that own this key. If the balance is positive, review the organization or project spend limit and confirm that the key belongs to the selected project.\n\nBilling settings: https://platform.openai.com/settings/organization/billing/\n${error.message.split('\n').slice(1).join('\n')}`;
      } else if (error.isApiResponse) {
        errorMessage = `The API received the request but rejected it. Check the API error details below, then verify the key, model, and the selected organization or project in AI settings.\n\n${error.message}`;
      } else {
        errorMessage = cfg.provider === 'local'
          ? `Ollama is a deprecated AI option, if this breaks, please resort to OpenAI or Puter, as this won't be fixed.\n\n${error.message}`
          : cfg.provider === 'puter'
          ? puterFailureMessage(error)
          : `I couldn’t connect to the AI service. Check your network connection, API endpoint, and whether the provider allows requests from a browser (CORS).\n\n${error.message}`;
      }
      const errorRow = addMessage('assistant', errorMessage);
      const savedError = activeChat?.messages?.at(-1);
      if (savedError?.role === 'assistant') { savedError.isError = true; persistChats(); }
      if (cfg.provider === 'puter') addPuterRetryActions(errorRow);
    } finally { busy = false; $('sendButton').disabled = false; promptBox.focus(); }
  }
})();
