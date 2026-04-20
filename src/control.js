const els = {
  statusBar: document.getElementById('statusBar'),
  currentBox: document.getElementById('currentBox'),
  queueBox: document.getElementById('queueBox'),
  historyBox: document.getElementById('historyBox'),
  logsBox: document.getElementById('logsBox'),
  queueCount: document.getElementById('queueCount'),
  historyCount: document.getElementById('historyCount'),
  telegramStatus: document.getElementById('telegramStatus'),
  overlayStatus: document.getElementById('overlayStatus'),
  telegramDetail: document.getElementById('telegramDetail'),
  localMessage: document.getElementById('localMessage'),
  favoritesBox: document.getElementById('favoritesBox'),
  monitorsBox: document.getElementById('monitorsBox'),
  displayId: document.getElementById('displayId'),
  position: document.getElementById('position'),
  barHeight: document.getElementById('barHeight'),
  slideDurationMs: document.getElementById('slideDurationMs'),
  speed: document.getElementById('speed'),
  pollIntervalMs: document.getElementById('pollIntervalMs'),
  fontFamily: document.getElementById('fontFamily'),
  fontSize: document.getElementById('fontSize'),
  paddingX: document.getElementById('paddingX'),
  bgColor: document.getElementById('bgColor'),
  textColor: document.getElementById('textColor'),
  telegramBotToken: document.getElementById('telegramBotToken'),
  telegramChatId: document.getElementById('telegramChatId'),
  commandPrefix: document.getElementById('commandPrefix'),
  telegramCorrections: document.getElementById('telegramCorrections'),
  favoriteMessages: document.getElementById('favoriteMessages'),
  alwaysOnTop: document.getElementById('alwaysOnTop'),
  startWithWindows: document.getElementById('startWithWindows'),
  previewBar: document.getElementById('previewBar'),
  previewText: document.getElementById('previewText'),
  previewMonitorLabel: document.getElementById('previewMonitorLabel'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  credentialsLockBtn: document.getElementById('credentialsLockBtn'),
  logTotalCount: document.getElementById('logTotalCount'),
  logInfoCount: document.getElementById('logInfoCount'),
  logActionCount: document.getElementById('logActionCount'),
  logWarnCount: document.getElementById('logWarnCount'),
  logErrorCount: document.getElementById('logErrorCount')
};

let displays = [];
let currentConfig = null;
let lastKnownDisplayId = '';
let currentQueue = [];
let currentHistory = [];
let currentLogs = [];
let overlayPaused = false;
let selectedQueueIndex = -1;
let credentialsLocked = true;

function splitLines(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(/\r?\n+/)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function parseCorrectionRuleLine(value) {
  const line = String(value || '').trim();
  if (!line) return null;

  for (const separator of ['=>', '->', '=']) {
    const index = line.indexOf(separator);
    if (index < 0) continue;

    const from = line.slice(0, index).trim();
    const to = line.slice(index + separator.length).trim();
    if (!from || !to) return null;
    return { from, to };
  }

  return null;
}

function formatCorrectionRulesForTextarea(rules) {
  if (!rules) return '';

  if (typeof rules === 'string') {
    return splitLines(rules).join('\n');
  }

  return (Array.isArray(rules) ? rules : [])
    .map((rule) => parseCorrectionRuleLine(rule) || {
      from: String(rule?.from || '').trim(),
      to: String(rule?.to || '').trim()
    })
    .filter((rule) => rule.from && rule.to)
    .map((rule) => `${rule.from} => ${rule.to}`)
    .join('\n');
}

function parseCorrectionRulesFromTextarea(value) {
  const seen = new Set();
  const rules = [];

  splitLines(value).forEach((line) => {
    const parsed = parseCorrectionRuleLine(line);
    if (!parsed) return;

    const key = `${parsed.from.toLowerCase()}=>${parsed.to.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rules.push(parsed);
  });

  return rules;
}

function formatFavoriteMessagesForTextarea(messages) {
  if (!messages) return '';
  return splitLines(messages)
    .map((entry) => typeof entry === 'string' ? entry.trim() : String(entry || '').trim())
    .filter(Boolean)
    .join('\n');
}

function parseFavoriteMessagesFromTextarea(value) {
  const seen = new Set();
  const messages = [];

  splitLines(value).forEach((line) => {
    const message = line.trim();
    if (!message) return;

    const key = message.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    messages.push(message);
  });

  return messages;
}

function setStatus(text, isError = false) {
  els.statusBar.textContent = String(text || '');
  els.statusBar.classList.toggle('error', !!isError);
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
  document.getElementById(`page-${tab}`).classList.add('active');
}

function applyCredentialLock(locked) {
  credentialsLocked = !!locked;
  els.telegramBotToken.readOnly = credentialsLocked;
  els.telegramChatId.readOnly = credentialsLocked;
  els.telegramBotToken.classList.toggle('locked-field', credentialsLocked);
  els.telegramChatId.classList.toggle('locked-field', credentialsLocked);
  if (els.credentialsLockBtn) {
    els.credentialsLockBtn.textContent = credentialsLocked ? '🔒 Bloqueado' : '🔓 Desbloqueado';
    els.credentialsLockBtn.classList.toggle('is-unlocked', !credentialsLocked);
  }
}

function renderDisplays(selectedId) {
  const wanted = String(selectedId || lastKnownDisplayId || displays[0]?.id || '');
  lastKnownDisplayId = wanted;

  const shouldRebuild =
    els.displayId.options.length !== displays.length ||
    [...els.displayId.options].some((option, index) => String(option.value) !== String(displays[index]?.id));

  if (shouldRebuild) {
    els.displayId.innerHTML = '';
    displays.forEach((display) => {
      const option = document.createElement('option');
      option.value = String(display.id);
      option.textContent = display.label;
      els.displayId.appendChild(option);
    });
  }

  if (wanted) {
    els.displayId.value = wanted;
  }

  els.monitorsBox.innerHTML = '';
  displays.forEach((display) => {
    const item = document.createElement('div');
    item.className = 'monitor-item';
    item.textContent = display.label;
    els.monitorsBox.appendChild(item);
  });

  updatePreview();
}

function fillForm(config) {
  currentConfig = config;
  lastKnownDisplayId = String(config.displayId || lastKnownDisplayId || '');
  els.telegramBotToken.value = config.telegramBotToken || '';
  els.telegramChatId.value = config.telegramChatId || '';
  applyCredentialLock(config.credentialsLocked !== false);
  els.commandPrefix.value = config.commandPrefix || '/telao';
  if (els.telegramCorrections) {
    els.telegramCorrections.value = formatCorrectionRulesForTextarea(config.telegramCustomCorrections || config.telegramCorrections);
  }
  if (els.favoriteMessages) {
    els.favoriteMessages.value = formatFavoriteMessagesForTextarea(config.favoriteMessages);
  }
  renderDisplays(lastKnownDisplayId);
  if (lastKnownDisplayId) els.displayId.value = lastKnownDisplayId;
  els.position.value = config.position || 'bottom';
  els.barHeight.value = config.barHeight ?? 40;
  els.slideDurationMs.value = config.slideDurationMs ?? 320;
  els.speed.value = config.speed ?? 90;
  els.pollIntervalMs.value = config.pollIntervalMs ?? 3000;
  els.fontFamily.value = config.fontFamily || 'Marble, "Marble Regular", "Segoe UI", Arial, sans-serif';
  els.fontSize.value = config.fontSize ?? 26;
  els.paddingX.value = config.paddingX ?? 24;
  els.alwaysOnTop.value = String(config.alwaysOnTop !== false);
  els.startWithWindows.value = String(!!config.startWithWindows);
  els.bgColor.value = config.bgColor || '#000000';
  els.textColor.value = config.textColor || '#fff7e8';
  renderFavorites();
  updatePreview();
}

function collectForm() {
  lastKnownDisplayId = String(els.displayId.value || lastKnownDisplayId || '');
  return {
    telegramBotToken: els.telegramBotToken.value.trim(),
    telegramChatId: els.telegramChatId.value.trim(),
    commandPrefix: els.commandPrefix.value.trim() || '/telao',
    displayId: lastKnownDisplayId,
    position: els.position.value,
    barHeight: Number(els.barHeight.value) || 40,
    slideDurationMs: Number(els.slideDurationMs.value) || 320,
    speed: Number(els.speed.value) || 90,
    pollIntervalMs: Number(els.pollIntervalMs.value) || 3000,
    fontFamily: els.fontFamily.value.trim() || 'Marble, "Marble Regular", "Segoe UI", Arial, sans-serif',
    fontSize: Number(els.fontSize.value) || 26,
    paddingX: Number(els.paddingX.value) || 24,
    alwaysOnTop: els.alwaysOnTop.value === 'true',
    startWithWindows: els.startWithWindows.value === 'true',
    credentialsLocked,
    bgColor: els.bgColor.value,
    textColor: els.textColor.value,
    telegramCustomCorrections: parseCorrectionRulesFromTextarea(els.telegramCorrections?.value || ''),
    favoriteMessages: parseFavoriteMessagesFromTextarea(els.favoriteMessages?.value || '')
  };
}

function updatePreview() {
  const config = collectForm();
  const display = displays.find((item) => String(item.id) === String(config.displayId)) || displays[0];
  els.previewMonitorLabel.textContent = display ? display.label : 'Monitor';
  els.previewBar.style.background = config.bgColor;
  els.previewBar.style.color = config.textColor;
  els.previewBar.style.fontFamily = config.fontFamily;
  els.previewBar.style.height = `${Math.max(16, Number(config.barHeight) || 40)}px`;
  els.previewText.style.fontSize = `${Math.max(10, Number(config.fontSize) || 26)}px`;
  els.previewText.style.paddingLeft = `${Math.max(0, Number(config.paddingX) || 24)}px`;
  els.previewText.style.paddingRight = `${Math.max(0, Number(config.paddingX) || 24)}px`;
  if (config.position === 'top') {
    els.previewBar.style.top = '0';
    els.previewBar.style.bottom = 'auto';
  } else {
    els.previewBar.style.top = 'auto';
    els.previewBar.style.bottom = '0';
  }
}

function renderQueue() {
  els.queueBox.innerHTML = '';
  if (!currentQueue.length) {
    const empty = document.createElement('div');
    empty.className = 'queue-item';
    empty.textContent = 'Fila vazia.';
    els.queueBox.appendChild(empty);
    return;
  }

  currentQueue.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'queue-item';
    if (index === selectedQueueIndex) row.classList.add('selected');
    row.tabIndex = 0;
    row.addEventListener('click', () => {
      selectedQueueIndex = index;
      renderQueue();
    });

    const topline = document.createElement('div');
    topline.className = 'queue-topline';

    const idx = document.createElement('div');
    idx.className = 'queue-index';
    idx.textContent = `Fila ${index + 1} • ${item.source || 'local'}`;

    const badge = document.createElement('div');
    badge.className = 'queue-index';
    badge.textContent = item.urgent ? 'Urgente' : 'Normal';

    topline.appendChild(idx);
    topline.appendChild(badge);

    const text = document.createElement('div');
    text.className = `queue-text ${item.urgent ? 'urgent' : ''}`;
    text.textContent = item.text;

    const actions = document.createElement('div');
    actions.className = 'tiny-actions';
    actions.innerHTML = `
      <button class="btn-secondary" data-action="up">Subir</button>
      <button class="btn-secondary" data-action="down">Descer</button>
      <button class="btn-secondary" data-action="repeat">Repetir</button>
      <button class="btn-danger" data-action="remove">Remover</button>
    `;

    actions.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const action = button.dataset.action;
        try {
          if (action === 'up') await window.appApi.moveQueueItem(item.id, 'up');
          if (action === 'down') await window.appApi.moveQueueItem(item.id, 'down');
          if (action === 'repeat') await window.appApi.repeatQueueItem(item.id);
          if (action === 'remove') {
            await window.appApi.removeQueueItem(item.id);
            if (selectedQueueIndex >= currentQueue.length - 1) selectedQueueIndex = Math.max(0, currentQueue.length - 2);
          }
        } catch (error) {
          setStatus(`Erro na fila: ${error.message || error}`, true);
        }
      });
    });

    row.appendChild(topline);
    row.appendChild(text);
    row.appendChild(actions);
    els.queueBox.appendChild(row);
  });
}

function renderHistory() {
  els.historyBox.innerHTML = '';
  if (!currentHistory.length) {
    const empty = document.createElement('div');
    empty.className = 'history-item';
    empty.textContent = 'Histórico vazio.';
    els.historyBox.appendChild(empty);
    return;
  }

  currentHistory.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const topline = document.createElement('div');
    topline.className = 'history-topline';

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = item.source || 'local';

    const time = document.createElement('div');
    time.className = 'history-meta';
    time.textContent = new Date(item.createdAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    topline.appendChild(meta);
    topline.appendChild(time);

    const textNode = document.createElement('div');
    textNode.className = 'history-text';
    textNode.textContent = item.text;

    const actions = document.createElement('div');
    actions.className = 'tiny-actions';
    actions.innerHTML = `
      <button class="btn-secondary" data-urgent="false">Reusar</button>
      <button class="btn-urgent" data-urgent="true">Urgente</button>
    `;

    actions.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await window.appApi.reuseHistoryItem(item.id, button.dataset.urgent === 'true');
          setStatus('Mensagem enviada do histórico para a fila.');
        } catch (error) {
          setStatus(`Erro ao reusar histórico: ${error.message || error}`, true);
        }
      });
    });

    row.appendChild(topline);
    row.appendChild(textNode);
    row.appendChild(actions);
    els.historyBox.appendChild(row);
  });
}

async function queueFavoriteMessage(text, urgent = false) {
  await window.appApi.queueMessage(text, { urgent, source: 'local' });
}

function renderFavorites() {
  if (!els.favoritesBox) return;

  els.favoritesBox.innerHTML = '';
  const favorites = Array.isArray(currentConfig?.favoriteMessages) ? currentConfig.favoriteMessages : [];

  if (!favorites.length) {
    const empty = document.createElement('div');
    empty.className = 'favorite-item';
    empty.textContent = 'Nenhum modelo rápido configurado.';
    els.favoritesBox.appendChild(empty);
    return;
  }

  favorites.forEach((message) => {
    const row = document.createElement('div');
    row.className = 'favorite-item';

    const text = document.createElement('div');
    text.className = 'favorite-text';
    text.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'tiny-actions';
    actions.innerHTML = `
      <button class="btn-secondary" data-action="use">Usar</button>
      <button class="btn-primary" data-action="send">Enviar</button>
      <button class="btn-urgent" data-action="urgent">Urgente</button>
    `;

    actions.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;

        try {
          if (action === 'use') {
            els.localMessage.value = message;
            els.localMessage.focus();
            setStatus('Modelo carregado no campo de mensagem.');
            return;
          }

          await queueFavoriteMessage(message, action === 'urgent');
          setStatus(action === 'urgent' ? 'Modelo enviado como urgente.' : 'Modelo enviado para a fila.');
        } catch (error) {
          setStatus(`Erro ao usar modelo: ${error.message || error}`, true);
        }
      });
    });

    row.appendChild(text);
    row.appendChild(actions);
    els.favoritesBox.appendChild(row);
  });
}

function renderLogs() {
  const counts = currentLogs.reduce((acc, entry) => {
    const level = String(entry?.level || 'info').toLowerCase();
    acc.total += 1;
    if (level === 'action') acc.action += 1;
    else if (level === 'warn') acc.warn += 1;
    else if (level === 'error') acc.error += 1;
    else acc.info += 1;
    return acc;
  }, { total: 0, info: 0, action: 0, warn: 0, error: 0 });

  if (els.logTotalCount) els.logTotalCount.textContent = String(counts.total);
  if (els.logInfoCount) els.logInfoCount.textContent = String(counts.info);
  if (els.logActionCount) els.logActionCount.textContent = String(counts.action);
  if (els.logWarnCount) els.logWarnCount.textContent = String(counts.warn);
  if (els.logErrorCount) els.logErrorCount.textContent = String(counts.error);

  if (!currentLogs.length) {
    els.logsBox.textContent = 'Nenhum log registrado ainda.';
    return;
  }

  const payload = currentLogs.map((entry) => {
    const when = entry.ts ? new Date(entry.ts).toLocaleString('pt-BR') : '';
    const level = String(entry.level || 'info').toUpperCase();
    const first = `[${when}] [${level}] ${entry.message || ''}`;
    return entry.details ? `${first}
${entry.details}` : first;
  }).join('\n\n');

  els.logsBox.textContent = payload;
  els.logsBox.scrollTop = 0;
}

function renderStatus(payload) {
  currentConfig = payload.config || currentConfig;
  currentQueue = Array.isArray(payload.queue) ? payload.queue : [];
  if (selectedQueueIndex >= currentQueue.length) selectedQueueIndex = currentQueue.length - 1;
  currentHistory = Array.isArray(payload.history) ? payload.history : [];
  currentLogs = Array.isArray(payload.logs) ? payload.logs : currentLogs;
  overlayPaused = !!payload.overlayPaused;

  const currentMessage = payload.currentMessage?.text || payload.currentMessage || '';
  els.currentBox.textContent = currentMessage || 'Nenhuma mensagem ativa.';
  els.currentBox.classList.toggle('empty', !currentMessage);

  els.queueCount.textContent = String(currentQueue.length);
  els.historyCount.textContent = String(currentHistory.length);

  const telegramState = payload.telegramState || (payload.pollingActive ? 'online' : 'offline');
  els.telegramStatus.textContent =
    telegramState === 'online' ? 'Online' :
    telegramState === 'connecting' ? 'Conectando' :
    'Offline';
  els.telegramStatus.className = `mini-value ${
    telegramState === 'online' ? 'status-ok' :
    telegramState === 'connecting' ? 'status-warn' :
    'status-off'
  }`;
  els.overlayStatus.textContent = overlayPaused ? 'Pausado' : (payload.overlayVisible ? 'Exibindo' : 'Ocioso');
  els.overlayStatus.className = `mini-value ${overlayPaused ? 'status-warn' : (payload.overlayVisible ? 'status-ok' : 'status-off')}`;
  els.telegramDetail.textContent = payload.telegramDetail || 'Sem erro recente.';

  if (payload.displays?.length) {
    displays = payload.displays;
    renderDisplays(currentConfig?.displayId || lastKnownDisplayId || els.displayId.value);
  }

  renderQueue();
  renderHistory();
  renderFavorites();
  renderLogs();
  updatePreview();
  document.getElementById('pauseBtn').textContent = overlayPaused ? 'Retomar overlay' : 'Pausar overlay';
}

function flashSentFeedback(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.classList.remove('btn-sent');
  void btn.offsetWidth;
  btn.classList.add('btn-sent');
  setTimeout(() => btn.classList.remove('btn-sent'), 700);
}

async function submitLocalMessage(urgent = false) {
  const text = els.localMessage.value.trim();
  if (!text) {
    setStatus('Digite uma mensagem.', true);
    return;
  }
  try {
    await window.appApi.queueMessage(text, { urgent, source: 'local' });
    els.localMessage.value = '';
    setStatus(urgent ? 'Mensagem urgente enviada para a fila.' : 'Mensagem enviada para a fila.');
    flashSentFeedback(urgent ? 'sendUrgentBtn' : 'sendBtn');
  } catch (error) {
    setStatus(`Erro ao enviar: ${error.message || error}`, true);
  }
}

function moveSelection(delta) {
  if (!currentQueue.length) return;
  if (selectedQueueIndex < 0) selectedQueueIndex = 0;
  else selectedQueueIndex = Math.max(0, Math.min(currentQueue.length - 1, selectedQueueIndex + delta));
  renderQueue();
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName);
}

async function init() {
  const initial = await window.appApi.getInitialData();
  displays = initial.displays || [];
  fillForm(initial.config);
  currentHistory = initial.history || [];
  currentQueue = initial.queue || [];
  currentLogs = initial.logs || [];
  renderStatus({
    currentMessage: '',
    queue: currentQueue,
    history: currentHistory,
    config: initial.config,
    overlayVisible: false,
    overlayPaused: false,
    telegramState: initial.config.telegramBotToken && initial.config.telegramChatId ? 'connecting' : 'offline',
    telegramDetail: initial.config.telegramBotToken && initial.config.telegramChatId
      ? 'Aguardando a primeira consulta bem-sucedida ao Telegram.'
      : 'Configure token e Chat ID para ativar o Telegram.',
    displays,
    logs: currentLogs
  });
  setStatus('Pronto.');
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

els.displayId.addEventListener('change', () => {
  lastKnownDisplayId = String(els.displayId.value || '');
  updatePreview();
});

if (els.credentialsLockBtn) {
  els.credentialsLockBtn.addEventListener('click', () => {
    applyCredentialLock(!credentialsLocked);
    setStatus(credentialsLocked ? 'Token e Chat ID bloqueados.' : 'Token e Chat ID desbloqueados.');
  });
}
['position','barHeight','slideDurationMs','speed','fontFamily','fontSize','paddingX','bgColor','textColor'].forEach((key) => {
  const element = els[key];
  element.addEventListener('input', updatePreview);
  element.addEventListener('change', updatePreview);
});

els.localMessage.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
    event.preventDefault();
    void submitLocalMessage(false);
  }
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault();
    void submitLocalMessage(true);
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    els.localMessage.value = '';
    setStatus('Campo limpo.');
  }
});

document.addEventListener('keydown', async (event) => {
  if (isTypingTarget(event.target)) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (event.ctrlKey && selectedQueueIndex >= 0 && currentQueue[selectedQueueIndex]) {
      await window.appApi.moveQueueItem(currentQueue[selectedQueueIndex].id, 'down');
      selectedQueueIndex = Math.min(currentQueue.length - 1, selectedQueueIndex + 1);
    } else {
      moveSelection(1);
    }
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (event.ctrlKey && selectedQueueIndex >= 0 && currentQueue[selectedQueueIndex]) {
      await window.appApi.moveQueueItem(currentQueue[selectedQueueIndex].id, 'up');
      selectedQueueIndex = Math.max(0, selectedQueueIndex - 1);
    } else {
      moveSelection(-1);
    }
  }

  if (event.key === 'Delete' && selectedQueueIndex >= 0 && currentQueue[selectedQueueIndex]) {
    event.preventDefault();
    await window.appApi.removeQueueItem(currentQueue[selectedQueueIndex].id);
    selectedQueueIndex = Math.max(0, selectedQueueIndex - 1);
  }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    const saved = await window.appApi.saveConfig(collectForm());
    currentConfig = saved.config;
    displays = saved.displays || displays;
    fillForm(saved.config);
    setStatus('Configuração salva e aplicada.');
  } catch (error) {
    setStatus(`Erro ao salvar: ${error.message || error}`, true);
  }
});

document.getElementById('sendBtn').addEventListener('click', () => void submitLocalMessage(false));
document.getElementById('sendUrgentBtn').addEventListener('click', () => void submitLocalMessage(true));
document.getElementById('clearFieldBtn').addEventListener('click', () => {
  els.localMessage.value = '';
  setStatus('Campo limpo.');
});

document.getElementById('nextBtn').addEventListener('click', async () => {
  try {
    await window.appApi.nextMessage();
    setStatus('Pulando para a próxima mensagem.');
  } catch (error) {
    setStatus(`Erro ao avançar: ${error.message || error}`, true);
  }
});

document.getElementById('clearCurrentBtn').addEventListener('click', async () => {
  try {
    await window.appApi.clearCurrent();
    setStatus('Mensagem atual encerrada.');
  } catch (error) {
    setStatus(`Erro ao encerrar atual: ${error.message || error}`, true);
  }
});

els.clearHistoryBtn.addEventListener('click', async () => {
  try {
    const result = await window.appApi.clearHistory();
    currentHistory = result.history || [];
    renderHistory();
    setStatus('Histórico limpo.');
  } catch (error) {
    setStatus(`Erro ao limpar histórico: ${error.message || error}`, true);
  }
});

document.getElementById('clearQueueBtn').addEventListener('click', async () => {
  try {
    await window.appApi.clearQueue();
    selectedQueueIndex = -1;
    setStatus('Fila limpa.');
  } catch (error) {
    setStatus(`Erro ao limpar fila: ${error.message || error}`, true);
  }
});

document.getElementById('pauseBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.pauseOverlay();
    setStatus(result.paused ? 'Overlay pausado. A fila continuará acumulando.' : 'Overlay retomado.');
  } catch (error) {
    setStatus(`Erro ao pausar: ${error.message || error}`, true);
  }
});

document.getElementById('previewBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.flashPreview({ text: 'PREVIEW DO OVERLAY', durationMs: 3000 });
    setStatus(result?.ok ? 'Preview exibido por 3 segundos.' : 'Não foi possível exibir o preview enquanto há uma mensagem ativa.', !result?.ok);
  } catch (error) {
    setStatus(`Erro no preview: ${error.message || error}`, true);
  }
});

document.getElementById('flashPreviewBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.flashPreview({ text: 'PREVIEW DO OVERLAY', durationMs: 3000 });
    setStatus(result?.ok ? 'Preview exibido por 3 segundos.' : 'Não foi possível exibir o preview enquanto há uma mensagem ativa.', !result?.ok);
  } catch (error) {
    setStatus(`Erro no preview: ${error.message || error}`, true);
  }
});

document.getElementById('testMonitorBtn').addEventListener('click', async () => {
  try {
    await window.appApi.saveConfig(collectForm());
    const result = await window.appApi.flashPreview({ text: 'TESTE DO MONITOR SELECIONADO', durationMs: 3000 });
    setStatus(result?.ok ? 'Monitor selecionado testado por 3 segundos.' : 'Não foi possível testar enquanto há uma mensagem ativa.', !result?.ok);
  } catch (error) {
    setStatus(`Erro ao testar monitor: ${error.message || error}`, true);
  }
});

document.getElementById('showConfigPathBtn').addEventListener('click', async () => {
  await window.appApi.showConfigPath();
});

document.getElementById('exportConfigBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.exportConfig();
    if (result?.canceled) return;
    setStatus(`Configuração exportada: ${result.filePath}`);
  } catch (error) {
    setStatus(`Erro ao exportar: ${error.message || error}`, true);
  }
});

document.getElementById('importConfigBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.importConfig();
    if (result?.canceled) return;
    currentConfig = result.config;
    displays = result.displays || displays;
    fillForm(result.config);
    setStatus(`Configuração importada: ${result.filePath}`);
  } catch (error) {
    setStatus(`Erro ao importar: ${error.message || error}`, true);
  }
});


document.getElementById('refreshLogsBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.getLogs();
    currentLogs = result.logs || [];
    renderLogs();
    setStatus('Logs atualizados.');
  } catch (error) {
    setStatus(`Erro ao atualizar logs: ${error.message || error}`, true);
  }
});

document.getElementById('copyLogsBtn').addEventListener('click', async () => {
  try {
    const payload = (currentLogs || []).map((entry) => `[${entry.ts}] [${String(entry.level || '').toUpperCase()}] ${entry.message}${entry.details ? `\n${entry.details}` : ''}`).join('\n\n');
    await navigator.clipboard.writeText(payload || 'Sem logs.');
    setStatus('Logs copiados para a área de transferência.');
  } catch (error) {
    setStatus(`Erro ao copiar logs: ${error.message || error}`, true);
  }
});

document.getElementById('exportLogsBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.exportLogs();
    if (result?.canceled) return;
    setStatus(`Log exportado: ${result.filePath}`);
  } catch (error) {
    setStatus(`Erro ao exportar logs: ${error.message || error}`, true);
  }
});

document.getElementById('clearLogsBtn').addEventListener('click', async () => {
  try {
    const result = await window.appApi.clearLogs();
    currentLogs = result.logs || [];
    renderLogs();
    setStatus('Logs limpos.');
  } catch (error) {
    setStatus(`Erro ao limpar logs: ${error.message || error}`, true);
  }
});

window.appApi.onStatus((payload) => renderStatus(payload));
window.appApi.onError((message) => setStatus(`Erro: ${message}`, true));

init();
