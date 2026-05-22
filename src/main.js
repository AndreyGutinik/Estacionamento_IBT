const { app, BrowserWindow, ipcMain, screen, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (_) { autoUpdater = null; }

const HTTP_CONTROL_PORT = 8787;
const HTTP_CONTROL_HOST = '127.0.0.1';
const STARTUP_HIDDEN_ARG = '--hidden';
let httpControlServer = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const HISTORY_PATH = path.join(app.getPath('userData'), 'history.json');
const LOG_PATH = path.join(app.getPath('userData'), 'logs.json');
const MAX_HISTORY = 20;
const MAX_LOGS = 400;
const TELEGRAM_REQUEST_TIMEOUT_MS = 12000;
const TELEGRAM_DUPLICATE_WINDOW_MS = 60000;

let controlWindow;
let overlayWindow;
let tray;
let currentConfig;
let currentMessage = null;
let tickerQueue = [];
let historyItems = [];
let logItems = [];
let pollTimer = null;
let pollOffset = 0;
let isProcessingMessage = false;
let isQuitting = false;
let overlayPaused = false;
let telegramLastError = '';
let launchedAtStartup = false;
let messageIdCounter = 1;
let flashTimer = null;
let previewActive = false;
let pollInFlight = false;
let pauseStopRequested = false;
let telegramLastSuccessAt = 0;
let telegramErrorStreak = 0;
let telegramSuppressedErrorCount = 0;
let telegramLastErrorKey = '';
let telegramSessionKey = '';
let pollingGeneration = 0;
let overlayReady = false;
let overlayRebuildInProgress = false;
let overlayRecoveryTimer = null;
let pendingOverlayStartPayload = null;
let overlayCloseExpectedWindow = null;
const recentTelegramMessages = new Map();

const defaultConfig = {
  telegramBotToken: '',
  telegramChatId: '',
  commandPrefix: '/telao',
  displayId: '',
  position: 'bottom',
  barHeight: 40,
  speed: 90,
  bgColor: '#000000',
  textColor: '#fff7e8',
  fontSize: 26,
  fontFamily: 'Marble, "Marble Regular", "Segoe UI", Arial, sans-serif',
  paddingX: 24,
  alwaysOnTop: true,
  pollIntervalMs: 3000,
  slideDurationMs: 320,
  startWithWindows: true,
  credentialsLocked: true,
  telegramCustomCorrections: [],
  favoriteMessages: []
};

function clampNumber(value, fallback, min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Number.isFinite(min) ? Math.max(min, num) : num;
}

function splitConfigLines(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(/\r?\n+/)
    .map((entry) => sanitizeText(entry))
    .filter(Boolean);
}

function parseTelegramCorrectionRuleLine(value) {
  const line = String(value || '').trim();
  if (!line) return null;

  for (const separator of ['=>', '->', '=']) {
    const index = line.indexOf(separator);
    if (index < 0) continue;

    const from = sanitizeText(line.slice(0, index));
    const to = sanitizeText(line.slice(index + separator.length));
    if (!from || !to) return null;
    return { from, to };
  }

  return null;
}

function parseTelegramCorrectionRule(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return parseTelegramCorrectionRuleLine(value);
  }

  const from = sanitizeText(value.from || value.input || value.search);
  const to = sanitizeText(value.to || value.output || value.replace);
  if (!from || !to) return null;
  return { from, to };
}

function normalizeTelegramCorrectionRules(value) {
  const entries = Array.isArray(value) ? value : splitConfigLines(value);
  const seen = new Set();
  const rules = [];

  for (const entry of entries) {
    const parsed = parseTelegramCorrectionRule(entry);
    if (!parsed) continue;

    const key = `${stripDiacritics(parsed.from).toLocaleLowerCase('pt-BR')}=>${parsed.to.toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(parsed);
  }

  return rules;
}

function normalizeFavoriteMessages(value) {
  const entries = splitConfigLines(value);
  const seen = new Set();
  const favorites = [];

  for (const entry of entries) {
    const normalized = sanitizeText(entry);
    if (!normalized) continue;

    const key = normalized.toLocaleUpperCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    favorites.push(normalized);
  }

  return favorites;
}

function ensureFile(filePath, initialValue) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(initialValue, null, 2), 'utf8');
  }
}

function ensureStateFiles() {
  ensureFile(CONFIG_PATH, defaultConfig);
  ensureFile(HISTORY_PATH, []);
  ensureFile(LOG_PATH, []);
}

function loadJson(filePath, fallback) {
  ensureStateFiles();
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeConfig(config) {
  config = config || {};
  return {
    ...defaultConfig,
    ...config,
    barHeight: clampNumber(config.barHeight, defaultConfig.barHeight, 12),
    speed: clampNumber(config.speed, defaultConfig.speed, 20),
    fontSize: clampNumber(config.fontSize, defaultConfig.fontSize, 10),
    paddingX: clampNumber(config.paddingX, defaultConfig.paddingX, 0),
    pollIntervalMs: clampNumber(config.pollIntervalMs, defaultConfig.pollIntervalMs, 1500),
    slideDurationMs: clampNumber(config.slideDurationMs, defaultConfig.slideDurationMs, 80),
    alwaysOnTop: !!config.alwaysOnTop,
    startWithWindows: !!config.startWithWindows,
    credentialsLocked: config.credentialsLocked !== false,
    position: String(config.position || defaultConfig.position) === 'top' ? 'top' : 'bottom',
    commandPrefix: String(config.commandPrefix || defaultConfig.commandPrefix).trim() || defaultConfig.commandPrefix,
    displayId: String(config.displayId || ''),
    fontFamily: String(config.fontFamily || defaultConfig.fontFamily).trim() || defaultConfig.fontFamily,
    bgColor: String(config.bgColor || defaultConfig.bgColor),
    textColor: String(config.textColor || defaultConfig.textColor),
    telegramCustomCorrections: normalizeTelegramCorrectionRules(config.telegramCustomCorrections ?? config.telegramCorrections),
    favoriteMessages: normalizeFavoriteMessages(config.favoriteMessages)
  };
}

function saveConfig(config) {
  currentConfig = normalizeConfig(config);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf8');
  return currentConfig;
}

function getTelegramToken(config = currentConfig) {
  return String(config?.telegramBotToken || '').trim();
}

function getTelegramChatId(config = currentConfig) {
  return String(config?.telegramChatId || '').trim();
}

function isTelegramConfigured(config = currentConfig) {
  return !!getTelegramToken(config) && !!getTelegramChatId(config);
}

function getTelegramSessionIdentity(config = currentConfig) {
  const token = getTelegramToken(config);
  const chatId = getTelegramChatId(config);
  return token && chatId ? `${token}::${chatId}` : '';
}

function resetTelegramRuntimeState(options = {}) {
  const clearLastError = options.clearLastError !== false;
  pollOffset = 0;
  telegramLastSuccessAt = 0;
  telegramErrorStreak = 0;
  telegramSuppressedErrorCount = 0;
  telegramLastErrorKey = '';
  recentTelegramMessages.clear();
  if (clearLastError) telegramLastError = '';
}

function loadHistory() {
  const loaded = loadJson(HISTORY_PATH, []);
  historyItems = Array.isArray(loaded) ? loaded : [];
}

function saveHistory() {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(historyItems.slice(0, MAX_HISTORY), null, 2), 'utf8');
}

function loadLogs() {
  const loaded = loadJson(LOG_PATH, []);
  logItems = Array.isArray(loaded) ? loaded.slice(0, MAX_LOGS) : [];
}

function saveLogs() {
  fs.writeFileSync(LOG_PATH, JSON.stringify(logItems.slice(0, MAX_LOGS), null, 2), 'utf8');
}

function addLog(level, message, details = '') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    level: String(level || 'info'),
    message: String(message || '').trim(),
    details: String(details || '').trim()
  };
  logItems.unshift(entry);
  logItems = logItems.slice(0, MAX_LOGS);
  saveLogs();
  sendStatusToControl();
  return entry;
}

function markTelegramHealthy() {
  const hadError = !!telegramLastError || telegramErrorStreak > 0 || telegramSuppressedErrorCount > 0;
  const suppressedCount = telegramSuppressedErrorCount;
  telegramLastError = '';
  telegramLastSuccessAt = Date.now();
  telegramErrorStreak = 0;
  telegramSuppressedErrorCount = 0;
  telegramLastErrorKey = '';

  if (hadError) {
    const details = suppressedCount ? `${suppressedCount} erro(s) repetidos foram suprimidos durante a falha.` : '';
    addLog('info', 'Conexao com o Telegram restabelecida', details);
  }
}

function markTelegramError(context, error) {
  const message = error?.message || String(error);
  const errorKey = `${context}::${message}`;
  telegramLastError = message;
  telegramErrorStreak += 1;

  if (errorKey === telegramLastErrorKey) {
    telegramSuppressedErrorCount += 1;
    return false;
  }

  telegramLastErrorKey = errorKey;
  telegramSuppressedErrorCount = 0;
  addLog('error', context, message);
  return true;
}

async function telegramRequestJson(config, method, endpoint, options = {}) {
  const token = getTelegramToken(config);
  if (!token) {
    throw new Error('Token do Telegram nao configurado.');
  }

  const url = new URL(`https://api.telegram.org/bot${token}/${endpoint}`);
  const query = options.query || {};
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const responseText = await response.text();
    let data = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (_) {
        data = null;
      }
    }

    if (!response.ok) {
      const description = sanitizeText(data?.description || responseText);
      const detail = description ? ` ${description}` : '';
      throw new Error(`HTTP ${response.status} ao comunicar com o Telegram.${detail}`);
    }

    if (!data) {
      throw new Error('Resposta invalida recebida do Telegram.');
    }

    if (!data?.ok) {
      throw new Error(data?.description || 'Falha na API do Telegram.');
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo limite ao comunicar com o Telegram.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function wasLaunchedHidden() {
  if (process.argv.includes(STARTUP_HIDDEN_ARG)) return true;
  try {
    return !!app.getLoginItemSettings().wasOpenedAtLogin;
  } catch (_) {
    return false;
  }
}

function applyAutoLaunch(config) {
  try {
    const enabled = !!config.startWithWindows;
    const settings = {
      openAtLogin: enabled,
      openAsHidden: enabled
    };
    if (process.platform === 'win32' && enabled) {
      settings.args = [STARTUP_HIDDEN_ARG];
    }
    app.setLoginItemSettings(settings);
  } catch (error) {
    console.error('Falha ao aplicar inicialização com o Windows:', error);
    addLog('error', 'Falha ao aplicar inicialização com o Windows', error.message || String(error));
  }
}

function getDisplaysPayload() {
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: `Monitor ${index + 1} - ${display.size.width}x${display.size.height} (${display.bounds.x}, ${display.bounds.y})${display.id === screen.getPrimaryDisplay().id ? ' [PRINCIPAL]' : ''}`,
    bounds: display.bounds,
    primary: display.id === screen.getPrimaryDisplay().id
  }));
}

function getDisplayForConfig(config) {
  const displays = screen.getAllDisplays();
  return displays.find((d) => String(d.id) === String(config.displayId)) || screen.getPrimaryDisplay();
}

function getWindowBounds(config) {
  const display = getDisplayForConfig(config);
  const bounds = display.bounds;
  const height = clampNumber(config.barHeight, 40, 12);
  const y = config.position === 'top' ? bounds.y : bounds.y + bounds.height - height;
  return { x: bounds.x, y, width: bounds.width, height };
}

function getIconPath() {
  return path.join(__dirname, '../assets/icons/app.ico');
}

function getTrayImage() {
  const img = nativeImage.createFromPath(getIconPath());
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir', click: () => showControlWindow() },
    { label: overlayPaused ? 'Retomar overlay' : 'Pausar overlay', click: () => toggleOverlayPause() },
    { type: 'separator' },
    { label: 'Sair', click: () => quitApp() }
  ]);
  tray.setToolTip('Alerta-IBT');
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray) return;
  tray = new Tray(getTrayImage());
  rebuildTrayMenu();
  tray.on('double-click', () => showControlWindow());
}

function hideToTray() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.hide();
  }
}

function showControlWindow() {
  if (!controlWindow || controlWindow.isDestroyed()) return;
  controlWindow.show();
  controlWindow.restore();
  controlWindow.focus();
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#102117',
    autoHideMenuBar: true,
    show: false,
    icon: getIconPath(),
    title: 'Alerta-IBT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controlWindow.once('ready-to-show', () => {
    if (launchedAtStartup) {
      hideToTray();
    } else {
      controlWindow.show();
    }
  });

  controlWindow.on('minimize', (event) => {
    event.preventDefault();
    hideToTray();
  });

  controlWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideToTray();
    }
  });

  controlWindow.loadFile(path.join(__dirname, 'control.html'));
}

function clearOverlayRecoveryTimer() {
  if (overlayRecoveryTimer) {
    clearTimeout(overlayRecoveryTimer);
    overlayRecoveryTimer = null;
  }
}

function flushPendingOverlayPayload(targetWindow = overlayWindow) {
  if (!targetWindow || targetWindow.isDestroyed() || !overlayReady) return false;

  targetWindow.webContents.send('overlay:set-config', currentConfig);
  if (pendingOverlayStartPayload) {
    targetWindow.webContents.send('overlay:start-message', pendingOverlayStartPayload);
    return true;
  }

  targetWindow.webContents.send('overlay:clear');
  return true;
}

function scheduleOverlayRecovery(message, details = '') {
  if (isQuitting || overlayRebuildInProgress) return;

  overlayRebuildInProgress = true;
  overlayReady = false;
  clearOverlayRecoveryTimer();
  addLog('warn', message, details);

  overlayRecoveryTimer = setTimeout(() => {
    clearOverlayRecoveryTimer();
    try {
      createOverlayWindow(currentConfig);
    } catch (error) {
      addLog('error', 'Falha ao recriar o overlay', error.message || String(error));
    } finally {
      overlayRebuildInProgress = false;
      sendStatusToControl();
    }
  }, 250);
}

function attachOverlayWindowHandlers(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  targetWindow.on('closed', () => {
    const wasExpected = overlayCloseExpectedWindow === targetWindow;
    if (overlayCloseExpectedWindow === targetWindow) {
      overlayCloseExpectedWindow = null;
    }

    if (overlayWindow === targetWindow) {
      overlayWindow = null;
      overlayReady = false;
    }

    if (!wasExpected && !isQuitting) {
      scheduleOverlayRecovery('Overlay fechado inesperadamente');
    }
  });

  targetWindow.on('unresponsive', () => {
    if (overlayWindow !== targetWindow || isQuitting) return;
    scheduleOverlayRecovery('Overlay sem resposta', 'Tentando recriar a janela automaticamente.');
  });

  targetWindow.webContents.on('render-process-gone', (_event, details) => {
    if (overlayWindow !== targetWindow || isQuitting) return;
    const reason = details?.reason ? `Motivo: ${details.reason}` : '';
    scheduleOverlayRecovery('Processo do overlay encerrado inesperadamente', reason);
  });

  targetWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (overlayWindow !== targetWindow || isQuitting) return;
    scheduleOverlayRecovery('Falha ao carregar o overlay', `${errorCode} ${errorDescription}`);
  });
}

function sendOverlayStartPayload(payload) {
  const nextPayload = typeof payload === 'string' ? { text: payload } : { ...(payload || {}) };
  const text = sanitizeText(nextPayload.text);
  if (!text) return false;

  nextPayload.text = text;
  pendingOverlayStartPayload = nextPayload;
  refreshOverlayWindow(currentConfig);

  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) {
    return false;
  }

  overlayWindow.webContents.send('overlay:start-message', nextPayload);
  return true;
}

function createOverlayWindow(config) {
  const bounds = getWindowBounds(config);
  const previousOverlayWindow = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;

  overlayReady = false;
  clearOverlayRecoveryTimer();
  if (previousOverlayWindow) {
    overlayCloseExpectedWindow = previousOverlayWindow;
    previousOverlayWindow.close();
  }

  const nextOverlayWindow = new BrowserWindow({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: !!config.alwaysOnTop,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  overlayWindow = nextOverlayWindow;
  attachOverlayWindowHandlers(nextOverlayWindow);
  nextOverlayWindow.setIgnoreMouseEvents(true);
  nextOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  nextOverlayWindow.setAlwaysOnTop(!!config.alwaysOnTop, 'screen-saver');
  nextOverlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  nextOverlayWindow.webContents.once('did-finish-load', () => {
    if (overlayWindow !== nextOverlayWindow || nextOverlayWindow.isDestroyed()) return;
    overlayReady = true;
    flushPendingOverlayPayload(nextOverlayWindow);
  });
}

function refreshOverlayWindow(config) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow(config);
    return;
  }
  const bounds = getWindowBounds(config);
  overlayWindow.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  }, false);
  overlayWindow.setAlwaysOnTop(!!config.alwaysOnTop, 'screen-saver');
  if (overlayReady) {
    overlayWindow.webContents.send('overlay:set-config', config);
  }
}

function sanitizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeRegexChar(char) {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

function buildLooseLiteralPattern(text) {
  const accentMap = {
    a: '[aáàâãä]',
    c: '[cç]',
    e: '[eéèêë]',
    i: '[iíìîï]',
    o: '[oóòôõö]',
    u: '[uúùûü]'
  };
  const source = sanitizeText(String(text || '')).toLocaleLowerCase('pt-BR');
  if (!source) return '';

  let pattern = '';
  for (const char of source) {
    if (/\s/.test(char)) {
      pattern += '\\s+';
      continue;
    }

    if (char === '-') {
      pattern += '\\s*-\\s*';
      continue;
    }

    pattern += accentMap[char] || escapeRegexChar(char);
  }

  return pattern;
}

function splitTelegramSegments(text) {
  return String(text || '')
    .split(/(?:\r?\n|[|/;])+/)
    .map((segment) => sanitizeText(segment))
    .filter(Boolean);
}

function normalizeTelegramFieldName(text) {
  return stripDiacritics(text).toLowerCase().replace(/[^a-z]/g, '');
}

function extractTelegramFieldValue(segment, acceptedNames) {
  const match = /^([^:]+):\s*(.+)$/.exec(String(segment || ''));
  if (!match) return '';

  const fieldName = normalizeTelegramFieldName(match[1]);
  if (!acceptedNames.includes(fieldName)) return '';
  return sanitizeText(match[2]);
}

function looksLikeTelegramPlate(text) {
  const compact = stripDiacritics(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}[A-Z0-9]{4}$/.test(compact);
}

function looksLikeTelegramReasonText(text) {
  const normalized = stripDiacritics(text).toLowerCase();
  return /\b(estacionad|parad|farol|vidro|vidros|porta|pisca|luz|som|vaga|contramao|proibid|aceso)\b/.test(normalized);
}

function normalizeTelegramPlate(text) {
  const compact = stripDiacritics(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  if (/^[A-Z]{3}[A-Z0-9]{4}$/.test(compact)) {
    return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  }

  return sanitizeText(String(text || '').toUpperCase())
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');
}

function normalizeTelegramVehicle(text) {
  return sanitizeText(String(text || '').replace(/^#+\s*/, ''));
}

function applyCustomTelegramCorrections(text, config = currentConfig) {
  let corrected = String(text || '');
  const rules = Array.isArray(config?.telegramCustomCorrections) ? config.telegramCustomCorrections : [];

  for (const rule of rules) {
    const fromPattern = buildLooseLiteralPattern(rule?.from);
    const replacement = sanitizeText(rule?.to).toLocaleLowerCase('pt-BR');
    if (!fromPattern || !replacement) continue;

    corrected = corrected.replace(new RegExp(fromPattern, 'gu'), () => replacement);
  }

  return corrected;
}

function correctTelegramPhrase(text, config = currentConfig) {
  let corrected = sanitizeText(String(text || '').replace(/\s*-\s*/g, '-')).toLocaleLowerCase('pt-BR');

  corrected = corrected
    .replace(/\bestacionado\s+local\s+proibido\b/gu, 'estacionado em local proibido')
    .replace(/\bestacionado\s+na\s+contra\s*m[aã]o\b/gu, 'estacionado na contram\u00e3o')
    .replace(/\bestacionado\s+na\s+contram[aã]o\b/gu, 'estacionado na contram\u00e3o')
    .replace(/\bfarol\s+acess[oa]\b/gu, 'farol aceso')
    .replace(/\bfarol\s+aceso\b/gu, 'farol aceso');

  corrected = applyCustomTelegramCorrections(corrected, config);

  return sanitizeText(corrected);
}

function parseGuidedTelegramFields(text, config = currentConfig) {
  const segments = splitTelegramSegments(text);
  if (!segments.length) return null;

  const fields = {
    vehicle: '',
    plate: '',
    reason: ''
  };
  const leftovers = [];
  let hasNamedField = false;

  for (const segment of segments) {
    const vehicle = extractTelegramFieldValue(segment, ['carro', 'carrocor', 'carroecor', 'veiculo', 'veiculocor', 'modelo']);
    if (vehicle) {
      fields.vehicle = vehicle;
      hasNamedField = true;
      continue;
    }

    const plate = extractTelegramFieldValue(segment, ['placa']);
    if (plate) {
      fields.plate = plate;
      hasNamedField = true;
      continue;
    }

    const reason = extractTelegramFieldValue(segment, ['motivo', 'ocorrencia', 'observacao', 'obs']);
    if (reason) {
      fields.reason = reason;
      hasNamedField = true;
      continue;
    }

    leftovers.push(segment);
  }

  const shouldGuessVehicle = hasNamedField || segments.length > 1;
  if (!fields.vehicle && leftovers.length) {
    const candidate = leftovers[0];
    if (candidate.startsWith('#') || (shouldGuessVehicle && !looksLikeTelegramPlate(candidate) && !looksLikeTelegramReasonText(candidate))) {
      fields.vehicle = candidate;
      leftovers.shift();
    }
  }

  if (!fields.plate) {
    const plateIndex = leftovers.findIndex((segment) => looksLikeTelegramPlate(segment));
    if (plateIndex >= 0) {
      fields.plate = leftovers[plateIndex];
      leftovers.splice(plateIndex, 1);
    }
  }

  if (!fields.reason && leftovers.length) {
    fields.reason = leftovers.join(' | ');
  } else if (fields.reason && leftovers.length) {
    fields.reason = `${fields.reason} | ${leftovers.join(' | ')}`;
  }

  const vehicle = normalizeTelegramVehicle(fields.vehicle);
  const plate = normalizeTelegramPlate(fields.plate);
  const reason = String(fields.reason || '')
    .split(/\s*\|\s*/)
    .map((segment) => correctTelegramPhrase(segment, config))
    .filter(Boolean)
    .join(' | ');

  if (!vehicle && !plate && !reason) return null;

  return { vehicle, plate, reason };
}

function shouldShowTelegramVehicleMarker(config = currentConfig) {
  return sanitizeText(config?.commandPrefix || '') !== '#';
}

function formatGuidedTelegramFields(fields, options = {}) {
  const parts = [];
  const includeVehicleMarker = options.includeVehicleMarker !== false;
  if (fields.vehicle) parts.push(includeVehicleMarker ? `#${fields.vehicle}` : fields.vehicle);
  if (fields.plate) parts.push(`Placa: ${fields.plate}`);
  if (fields.reason) parts.push(fields.reason);
  return parts.join(' | ');
}

function normalizeDisplayText(text) {
  return sanitizeText(text).toLocaleUpperCase('pt-BR');
}

function formatTelegramDisplayText(text, config = currentConfig) {
  const parsed = parseGuidedTelegramFields(text, config);
  if (!parsed) return normalizeDisplayText(correctTelegramPhrase(text, config));

  const formatted = formatGuidedTelegramFields(parsed, {
    includeVehicleMarker: shouldShowTelegramVehicleMarker(config)
  });
  return normalizeDisplayText(formatted || correctTelegramPhrase(text, config));
}

function parseMessage(messageText, config) {
  const prefix = sanitizeText(config.commandPrefix || '/telao');
  const text = String(messageText || '').trim();
  if (!text) return null;

  if (prefix.startsWith('/')) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}(?:@\\w+)?(?:\\s+|$)`, 'i');
    if (!regex.test(text)) return null;
    return sanitizeText(text.replace(regex, ''));
  }

  if (!text.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  return sanitizeText(text.slice(prefix.length));
}

function createMessageItem(text, options = {}) {
  return {
    id: `${Date.now()}-${messageIdCounter++}`,
    text: normalizeDisplayText(text),
    source: options.source || 'local',
    urgent: !!options.urgent,
    mode: options.mode || 'scroll',
    durationMs: clampNumber(options.durationMs, 3000, 250),
    createdAt: Date.now()
  };
}

function addToHistory(item) {
  if (!item?.text) return;
  historyItems = historyItems.filter((entry) => entry.text !== item.text);
  historyItems.unshift({
    id: item.id,
    text: item.text,
    source: item.source,
    urgent: !!item.urgent,
    createdAt: item.createdAt
  });
  historyItems = historyItems.slice(0, MAX_HISTORY);
  saveHistory();
}

function queueMessage(text, options = {}) {
  const normalized = options.source === 'telegram'
    ? formatTelegramDisplayText(text, currentConfig)
    : normalizeDisplayText(text);
  if (!normalized) return null;

  const item = createMessageItem(normalized, options);
  addToHistory(item);
  addLog(item.source === 'telegram' ? 'info' : 'action', `Mensagem adicionada à fila (${item.source})`, item.text);

  if (item.urgent) {
    tickerQueue.unshift(item);
  } else {
    tickerQueue.push(item);
  }

  sendStatusToControl();
  void maybeProcessNext();
  return item;
}

function pruneRecentTelegramMessages(now = Date.now()) {
  for (const [messageText, seenAt] of recentTelegramMessages.entries()) {
    if (now - seenAt > TELEGRAM_DUPLICATE_WINDOW_MS) {
      recentTelegramMessages.delete(messageText);
    }
  }
}

function hasPendingTelegramMessage(messageText) {
  if (!messageText) return false;

  if (currentMessage?.source === 'telegram' && currentMessage.text === messageText) {
    return true;
  }

  return tickerQueue.some((item) => item?.source === 'telegram' && item.text === messageText);
}

function getTelegramDuplicateState(text, config = currentConfig) {
  const normalized = formatTelegramDisplayText(text, config);
  if (!normalized) {
    return { isDuplicate: false, normalized: '' };
  }

  const now = Date.now();
  pruneRecentTelegramMessages(now);

  if (hasPendingTelegramMessage(normalized)) {
    return {
      isDuplicate: true,
      normalized,
      reason: 'Mensagem igual já está em exibição ou aguardando na fila.'
    };
  }

  const lastSeenAt = recentTelegramMessages.get(normalized);
  if (lastSeenAt && now - lastSeenAt <= TELEGRAM_DUPLICATE_WINDOW_MS) {
    const secondsAgo = Math.max(1, Math.round((now - lastSeenAt) / 1000));
    return {
      isDuplicate: true,
      normalized,
      reason: `Mensagem igual já foi recebida há ${secondsAgo}s.`
    };
  }

  return { isDuplicate: false, normalized };
}

function rememberTelegramMessage(messageText, seenAt = Date.now()) {
  if (!messageText) return;
  recentTelegramMessages.set(messageText, seenAt);
  pruneRecentTelegramMessages(seenAt);
}

async function telegramSendMessage(text) {
  const chatId = getTelegramChatId(currentConfig);
  const messageText = String(text || '').trim();
  if (!isTelegramConfigured(currentConfig) || !messageText) return { ok: false, skipped: true };

  const data = await telegramRequestJson(currentConfig, 'POST', 'sendMessage', {
    body: {
      chat_id: chatId,
      text: messageText,
      disable_web_page_preview: true
    }
  });

  return { ok: true, data };
}

async function telegramGetUpdates(config, generation) {
  const chatId = getTelegramChatId(config);
  if (!isTelegramConfigured(config)) return;

  const data = await telegramRequestJson(config, 'GET', 'getUpdates', {
    query: {
      timeout: 0,
      limit: 25,
      allowed_updates: JSON.stringify(['message']),
      offset: pollOffset || undefined
    }
  });
  if (generation !== pollingGeneration) return;
  markTelegramHealthy();

  for (const update of data.result || []) {
    if (generation !== pollingGeneration) return;
    pollOffset = update.update_id + 1;
    const message = update.message;
    if (!message || String(message.chat?.id || '') !== chatId) continue;
    if (message.from?.is_bot) continue;
    const parsed = parseMessage(message.text, config);
    if (!parsed) continue;
    const duplicateState = getTelegramDuplicateState(parsed, config);
    if (duplicateState.isDuplicate) {
      addLog('warn', 'Mensagem duplicada do Telegram ignorada', `${duplicateState.normalized}\n${duplicateState.reason}`);
      continue;
    }

    const item = queueMessage(parsed, { source: 'telegram' });
    if (item?.text) {
      rememberTelegramMessage(item.text);
    }
  }
}

function startPolling() {
  stopPolling();
  const sessionIdentity = getTelegramSessionIdentity(currentConfig);
  if (sessionIdentity !== telegramSessionKey) {
    telegramSessionKey = sessionIdentity;
    resetTelegramRuntimeState();
  }

  if (!sessionIdentity) {
    telegramSessionKey = '';
    resetTelegramRuntimeState();
    sendStatusToControl();
    return;
  }

  const generation = pollingGeneration;
  const interval = clampNumber(currentConfig.pollIntervalMs, 3000, 1500);
  const runPoll = async () => {
    if (generation !== pollingGeneration) return;
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      await telegramGetUpdates(currentConfig, generation);
      if (generation !== pollingGeneration) return;
      sendStatusToControl();
    } catch (error) {
      if (generation !== pollingGeneration) return;
      markTelegramError('Erro na consulta ao Telegram', error);
      sendStatusToControl();
      if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('control:error', telegramLastError);
      }
    } finally {
      if (generation === pollingGeneration) {
        pollInFlight = false;
      }
    }
  };

  pollTimer = setInterval(runPoll, interval);
  runPoll();
}

function stopPolling() {
  pollingGeneration += 1;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
}

async function maybeProcessNext() {
  if (overlayPaused || isProcessingMessage || !tickerQueue.length) return;

  isProcessingMessage = true;
  currentMessage = tickerQueue.shift();
  addLog('info', 'Exibindo mensagem no overlay', currentMessage?.text || '');
  sendStatusToControl();

  try {
    sendOverlayStartPayload(currentMessage);
  } catch (error) {
    isProcessingMessage = false;
    currentMessage = null;
    pendingOverlayStartPayload = null;
    sendStatusToControl();
    addLog('error', 'Falha ao iniciar exibição no overlay', error.message || String(error));
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('control:error', error.message || String(error));
    }
  }
}

async function handleMessageComplete() {
  const finishedMessage = currentMessage;
  pendingOverlayStartPayload = null;
  addLog('info', 'Mensagem concluída', finishedMessage?.text || '');

  if (finishedMessage?.source === 'telegram') {
    try {
      await telegramSendMessage(`✅ Mensagem exibida no telão.
${finishedMessage.text}`);
      addLog('info', 'Confirmação enviada ao Telegram', finishedMessage.text || '');
    } catch (error) {
      addLog('error', 'Falha ao enviar confirmação ao Telegram', error.message || String(error));
    }
  }

  currentMessage = null;
  isProcessingMessage = false;
  sendStatusToControl();
  void maybeProcessNext();
}

function sendStatusToControl() {
  if (!controlWindow || controlWindow.isDestroyed()) return;

  const telegramConfigured = isTelegramConfigured(currentConfig);
  let telegramState = 'offline';
  if (telegramConfigured) {
    telegramState = telegramLastError ? 'offline' : (telegramLastSuccessAt ? 'online' : 'connecting');
  }

  let telegramDetail = 'Configure token e Chat ID para ativar o Telegram.';
  if (telegramConfigured && telegramLastError) {
    telegramDetail = `Reconexão automática ativa (${telegramErrorStreak} falha(s) seguidas). ${telegramLastError}`;
    if (telegramSuppressedErrorCount) {
      telegramDetail += ` ${telegramSuppressedErrorCount} erro(s) repetidos foram suprimidos.`;
    }
  } else if (telegramConfigured && telegramLastSuccessAt) {
    telegramDetail = `Último contato bem-sucedido às ${new Date(telegramLastSuccessAt).toLocaleTimeString('pt-BR')}.`;
  } else if (telegramConfigured) {
    telegramDetail = 'Aguardando a primeira consulta bem-sucedida ao Telegram.';
  }

  controlWindow.webContents.send('control:status', {
    currentMessage,
    queue: tickerQueue,
    history: historyItems,
    logs: logItems,
    config: currentConfig,
    configPath: CONFIG_PATH,
    pollingActive: telegramState === 'online',
    telegramConfigured,
    telegramState,
    telegramLastError,
    telegramLastSuccessAt,
    telegramErrorStreak,
    telegramSuppressedErrorCount,
    telegramDetail,
    overlayVisible: !!currentMessage || previewActive,
    overlayPaused,
    displays: getDisplaysPayload()
  });

  rebuildTrayMenu();
}

function applyImportedConfig(configObject) {
  currentConfig = saveConfig(configObject);
  applyAutoLaunch(currentConfig);
  refreshOverlayWindow(currentConfig);
  startPolling();
  sendStatusToControl();
  return currentConfig;
}

async function setOverlayPaused(nextPaused, options = {}) {
  const { silent = false, source = 'ui' } = options;
  const desired = !!nextPaused;
  if (desired === overlayPaused) return overlayPaused;

  overlayPaused = desired;

  if (overlayPaused) {
    addLog('action', source === 'http' ? 'Overlay pausado via API HTTP' : 'Overlay pausado');
    if (!silent) {
      try {
        await telegramSendMessage('⚠️ O pastor iniciou a pregação. O overlay foi pausado para não atrapalhar o culto.');
        addLog('info', 'Aviso de pausa enviado ao Telegram');
      } catch (error) {
        addLog('error', 'Falha ao enviar aviso de pausa ao Telegram', error.message || String(error));
      }
    }
    if (currentMessage && overlayWindow && !overlayWindow.isDestroyed()) {
      pauseStopRequested = true;
      overlayWindow.webContents.send('overlay:finish-now');
    }
  } else {
    addLog('action', source === 'http' ? 'Overlay retomado via API HTTP' : 'Overlay retomado');
  }

  sendStatusToControl();
  if (!overlayPaused) {
    void maybeProcessNext();
  }
  return overlayPaused;
}

async function toggleOverlayPause() {
  return setOverlayPaused(!overlayPaused, { silent: false, source: 'ui' });
}

function respondHttpJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
}

function detectOverlayIntent(rawUrl) {
  const lowered = String(rawUrl || '').toLowerCase();
  if (/(^|[\/\?&=])off([\/\?&=]|$)/.test(lowered) || lowered.includes('pause') || lowered.includes('disable')) return 'off';
  if (/(^|[\/\?&=])on([\/\?&=]|$)/.test(lowered) || lowered.includes('resume') || lowered.includes('enable')) return 'on';
  return null;
}

function startHttpControlServer() {
  if (httpControlServer) return;
  httpControlServer = http.createServer(async (req, res) => {
    try {
      const method = (req.method || 'GET').toUpperCase();
      const rawUrl = req.url || '/';
      const urlPath = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';
      const remote = req.socket?.remoteAddress || 'unknown';

      addLog('info', `HTTP ${method} ${rawUrl} de ${remote}`);

      if (method === 'OPTIONS') { respondHttpJson(res, 204, {}); return; }

      if (urlPath === '/overlay/off' && (method === 'GET' || method === 'POST')) {
        await setOverlayPaused(true, { silent: false, source: 'http' });
        respondHttpJson(res, 200, { success: true, overlayEnabled: !overlayPaused });
        return;
      }
      if (urlPath === '/overlay/on' && (method === 'GET' || method === 'POST')) {
        await setOverlayPaused(false, { silent: true, source: 'http' });
        respondHttpJson(res, 200, { success: true, overlayEnabled: !overlayPaused });
        return;
      }
      if (urlPath === '/overlay/status' && method === 'GET') {
        respondHttpJson(res, 200, { success: true, overlayEnabled: !overlayPaused });
        return;
      }

      if (urlPath.startsWith('/overlay') && (method === 'GET' || method === 'POST')) {
        const intent = detectOverlayIntent(rawUrl);
        if (intent === 'off') {
          await setOverlayPaused(true, { silent: false, source: 'http' });
          respondHttpJson(res, 200, { success: true, overlayEnabled: !overlayPaused, matched: 'fallback-off' });
          return;
        }
        if (intent === 'on') {
          await setOverlayPaused(false, { silent: true, source: 'http' });
          respondHttpJson(res, 200, { success: true, overlayEnabled: !overlayPaused, matched: 'fallback-on' });
          return;
        }
      }

      respondHttpJson(res, 404, { success: false, error: 'not_found', received: { method, url: rawUrl } });
    } catch (error) {
      try { respondHttpJson(res, 500, { success: false, error: error.message || String(error) }); } catch (_) {}
    }
  });

  httpControlServer.on('error', (error) => {
    addLog('error', 'Falha no servidor HTTP de controle', error.message || String(error));
  });

  httpControlServer.listen(HTTP_CONTROL_PORT, HTTP_CONTROL_HOST, () => {
    addLog('info', `API HTTP de controle ativa em http://${HTTP_CONTROL_HOST}:${HTTP_CONTROL_PORT}`);
  });
}

function stopHttpControlServer() {
  if (!httpControlServer) return;
  try { httpControlServer.close(); } catch (_) {}
  httpControlServer = null;
}

function initAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => addLog('info', 'Verificando atualizações...'));
    autoUpdater.on('update-available', (info) => addLog('info', 'Atualização disponível', info?.version || ''));
    autoUpdater.on('update-not-available', () => addLog('info', 'Nenhuma atualização disponível'));
    autoUpdater.on('error', (error) => addLog('error', 'Erro no auto-update', error?.message || String(error)));
    autoUpdater.on('download-progress', (p) => addLog('info', `Baixando atualização ${Math.round(p?.percent || 0)}%`));
    autoUpdater.on('update-downloaded', async (info) => {
      addLog('info', 'Atualização baixada', info?.version || '');
      try {
        const result = await dialog.showMessageBox(controlWindow || null, {
          type: 'info',
          buttons: ['Reiniciar agora', 'Depois'],
          defaultId: 0,
          cancelId: 1,
          title: 'Atualização pronta',
          message: `Uma nova versão${info?.version ? ` (${info.version})` : ''} foi baixada.`,
          detail: 'Reinicie para aplicar a atualização.'
        });
        if (result.response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall(false, true);
        }
      } catch (error) {
        addLog('error', 'Falha ao perguntar sobre reinício de atualização', error.message || String(error));
      }
    });

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        addLog('error', 'Falha ao checar atualizações', error?.message || String(error));
      });
    }, 5000);
  } catch (error) {
    addLog('error', 'Auto-updater indisponível', error?.message || String(error));
  }
}

function clearFlashTimer() {
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
}

function flashPreview(payload = {}) {
  if (currentMessage || isProcessingMessage) return false;
  const text = normalizeDisplayText(payload.text || 'PREVIEW DO MONITOR');
  const durationMs = clampNumber(payload.durationMs, 3000, 250);
  clearFlashTimer();
  previewActive = true;
  const previewPayload = {
    text,
    source: 'preview',
    urgent: false,
    mode: 'preview',
    durationMs,
    createdAt: Date.now(),
    id: `preview-${Date.now()}`
  };
  sendOverlayStartPayload(previewPayload);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    flashTimer = setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('overlay:finish-now');
      }
    }, durationMs + 50);
  }
  return true;
}

app.on('second-instance', () => {
  showControlWindow();
});

app.whenReady().then(() => {
  ensureStateFiles();
  currentConfig = normalizeConfig(loadJson(CONFIG_PATH, defaultConfig));
  loadHistory();
  loadLogs();
  launchedAtStartup = wasLaunchedHidden();
  applyAutoLaunch(currentConfig);
  createTray();
  createControlWindow();
  createOverlayWindow(currentConfig);
  startPolling();
  startHttpControlServer();
  initAutoUpdater();
  addLog('info', 'Aplicativo iniciado');
  sendStatusToControl();

  screen.on('display-added', sendStatusToControl);
  screen.on('display-removed', sendStatusToControl);
  screen.on('display-metrics-changed', () => {
    refreshOverlayWindow(currentConfig);
    sendStatusToControl();
  });

  app.on('activate', () => {
    showControlWindow();
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
  clearFlashTimer();
  clearOverlayRecoveryTimer();
  stopPolling();
  stopHttpControlServer();
});

ipcMain.handle('app:get-initial-data', () => ({
  config: currentConfig,
  configPath: CONFIG_PATH,
  displays: getDisplaysPayload(),
  history: historyItems,
  queue: tickerQueue,
  logs: logItems
}));

ipcMain.handle('app:save-config', async (_event, incomingConfig) => ({
  config: (addLog('action', 'Configuração salva'), applyImportedConfig(incomingConfig)),
  displays: getDisplaysPayload(),
  configPath: CONFIG_PATH
}));

ipcMain.handle('app:queue-message', (_event, payload) => {
  const text = typeof payload === 'string' ? payload : payload?.text;
  const options = typeof payload === 'string' ? {} : (payload?.options || {});
  const item = queueMessage(text, options);
  return { ok: true, item };
});

ipcMain.handle('app:next-message', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:finish-now');
  } else {
    currentMessage = null;
    isProcessingMessage = false;
    pendingOverlayStartPayload = null;
    void maybeProcessNext();
  }
  return { ok: true };
});

ipcMain.handle('app:clear-current', () => {
  addLog('action', 'Encerrar mensagem atual solicitado');
  if (overlayWindow && !overlayWindow.isDestroyed() && currentMessage) {
    overlayWindow.webContents.send('overlay:finish-now');
  } else {
    currentMessage = null;
    isProcessingMessage = false;
    pendingOverlayStartPayload = null;
    sendStatusToControl();
  }
  return { ok: true };
});

ipcMain.handle('app:clear-queue', () => {
  tickerQueue = [];
  addLog('action', 'Fila limpa');
  sendStatusToControl();
  return { ok: true };
});

ipcMain.handle('app:pause-overlay', async () => { const paused = await toggleOverlayPause(); return { ok: true, paused }; });

ipcMain.handle('app:remove-queue-item', (_event, id) => {
  tickerQueue = tickerQueue.filter((item) => item.id !== id);
  sendStatusToControl();
  return { ok: true };
});

ipcMain.handle('app:move-queue-item', (_event, payload) => {
  const { id, direction } = payload || {};
  const index = tickerQueue.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false };
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= tickerQueue.length) return { ok: true };
  const [item] = tickerQueue.splice(index, 1);
  tickerQueue.splice(target, 0, item);
  addLog('action', `Item movido ${direction === 'up' ? 'para cima' : 'para baixo'}`, item?.text || '');
  sendStatusToControl();
  return { ok: true };
});

ipcMain.handle('app:repeat-queue-item', (_event, id) => {
  const item = tickerQueue.find((entry) => entry.id === id) || historyItems.find((entry) => entry.id === id);
  if (!item) return { ok: false };
  const clone = queueMessage(item.text, { urgent: false, source: item.source, mode: item.mode, durationMs: item.durationMs });
  addLog('action', 'Item repetido da fila/histórico', item?.text || '');
  return { ok: true, item: clone };
});

ipcMain.handle('app:reuse-history-item', (_event, payload) => {
  const item = historyItems.find((entry) => entry.id === payload?.id);
  if (!item) return { ok: false };
  const queued = queueMessage(item.text, { urgent: !!payload?.urgent, source: item.source || 'history' });
  addLog('action', payload?.urgent ? 'Histórico reenviado como urgente' : 'Histórico reenviado', item?.text || '');
  return { ok: true, item: queued };
});

ipcMain.handle('app:flash-preview', (_event, payload) => { const ok = flashPreview(payload || {}); if (ok) addLog('action', 'Preview do overlay exibido'); return { ok }; });

ipcMain.handle('app:show-config-path', async () => {
  await dialog.showMessageBox({ type: 'info', title: 'Local do arquivo de configuração', message: CONFIG_PATH });
  return { ok: true };
});

ipcMain.handle('app:export-config', async () => {
  const result = await dialog.showSaveDialog(controlWindow, {
    title: 'Exportar configuração',
    defaultPath: 'Alerta-IBT-config.json',
    filters: [{ name: 'Arquivo JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(currentConfig, null, 2), 'utf8');
  addLog('action', 'Configuração exportada', result.filePath);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('app:import-config', async () => {
  const result = await dialog.showOpenDialog(controlWindow, {
    title: 'Importar configuração',
    properties: ['openFile'],
    filters: [{ name: 'Arquivo JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true };
  const filePath = result.filePaths[0];
  const imported = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const config = applyImportedConfig(imported);
  addLog('action', 'Configuração importada', filePath);
  return { canceled: false, filePath, config, displays: getDisplaysPayload(), configPath: CONFIG_PATH };
});


ipcMain.handle('app:clear-history', () => {
  historyItems = [];
  saveHistory();
  addLog('action', 'Histórico limpo');
  sendStatusToControl();
  return { ok: true, history: historyItems };
});

ipcMain.handle('app:get-logs', () => ({ logs: logItems }));

ipcMain.handle('app:clear-logs', () => {
  logItems = [];
  saveLogs();
  sendStatusToControl();
  return { ok: true, logs: logItems };
});

ipcMain.handle('app:export-logs', async () => {
  const result = await dialog.showSaveDialog(controlWindow, {
    title: 'Exportar log',
    defaultPath: `Alerta-IBT-log-${new Date().toISOString().slice(0,19).replace(/[T:]/g, '-')}.txt`,
    filters: [{ name: 'Arquivo de texto', extensions: ['txt'] }, { name: 'Arquivo JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const isJson = result.filePath.toLowerCase().endsWith('.json');
  const content = isJson
    ? JSON.stringify(logItems, null, 2)
    : logItems.map((entry) => `[${entry.ts}] [${String(entry.level || '').toUpperCase()}] ${entry.message}${entry.details ? `\n${entry.details}` : ''}`).join('\n\n');
  fs.writeFileSync(result.filePath, content, 'utf8');
  addLog('action', 'Log exportado', result.filePath);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.on('overlay:message-complete', () => {
  clearFlashTimer();
  pendingOverlayStartPayload = null;
  if (previewActive) {
    previewActive = false;
    sendStatusToControl();
    return;
  }
  if (currentMessage?.mode === 'preview') {
    currentMessage = null;
    isProcessingMessage = false;
    sendStatusToControl();
    return;
  }
  if (pauseStopRequested && currentMessage) {
    const item = currentMessage;
    pauseStopRequested = false;
    currentMessage = null;
    isProcessingMessage = false;
    tickerQueue.unshift(item);
    addLog('info', 'Mensagem devolvida à fila por pausa', item.text || '');
    sendStatusToControl();
    return;
  }
  void handleMessageComplete();
});
