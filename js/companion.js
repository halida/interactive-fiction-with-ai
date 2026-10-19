/* =========================================================
 * Ghost Companion / companion.js
 * Main entry: injects UI, captures game events, streams LLM replies.
 *
 * Strategy for capturing the new game description after a command:
 *  - Hook the #ccinput Enter event to know which command we just sent.
 *  - Use a MutationObserver on #cctext childList to know when new
 *    HTML nodes are appended.
 *  - After the engine finishes writing (debounce 350ms with no
 *    further mutations), snapshot the tail of cctext's textContent
 *    since the last round, and feed it to the LLM along with the
 *    captured command.
 * ========================================================= */

import { loadConfig, openSettingsDialog } from './settings.js';
import { formatRound, buildMessages, estimateTokens } from './prompt.js';

const COMPANION_ID = 'ghost-companion';
const SETTINGS_BTN_ID = 'ghostSettingsBtn';
const RESTART_BTN_ID = 'ghostRestartBtn';
const CREDIT_ID = 'ghost-credit';
const SIDEBAR_ID = 'ghost-sidebar';

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

const state = {
  history: [],          // [{role, content}, ...] — full history, never truncated
  round: 0,             // 1-indexed
  busy: false,          // an LLM stream is currently in flight
  pendingCommand: null, // command we expect to be the next round
  cctextBaseline: '',   // cctext.textContent at the moment we noticed the pending cmd
  restartCount: 0,      // how many times the user hit restart; included in cfg for cache-busting
};

/* ------------------------------------------------------------------ */
/* UI: build the companion panel + bind buttons                       */
/* ------------------------------------------------------------------ */

function injectCompanionPanel() {
  if (document.getElementById(COMPANION_ID)) return;

  const panel = document.createElement('aside');
  panel.id = COMPANION_ID;
  panel.innerHTML = `
    <div id="ghost-companion-title">👻 幽灵向导</div>
    <div id="ghost-companion-log">
      <div class="ghost-empty-state">
        配置 API Key 后，<br/>我就会在这里陪你。
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Show the sidebar (credit + buttons) and bind them.
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (sidebar) sidebar.hidden = false;

  document.getElementById(SETTINGS_BTN_ID)?.addEventListener('click', () => {
    openSettingsDialog((cfg) => {
      appendBubble('ghost-user', '🔧 设置已更新');
      state.history = []; // hard reset history when config changes
      state.round = 0;
    });
  });

  document.getElementById(RESTART_BTN_ID)?.addEventListener('click', () => {
    restartGame();
  });

  // Quick-action bar pinned to the bottom of the panel.
  injectQuickbar(panel);
}

const QUICK_ACTIONS = [
  { label: 'look',       cmd: 'look' },
  { label: 'inv',        cmd: 'inventory' },
  { label: 'help',       cmd: 'help' },
  { label: 'N',          cmd: 'north' },
  { label: 'S',          cmd: 'south' },
  { label: 'E',          cmd: 'east' },
  { label: 'W',          cmd: 'west' },
  { label: '↑',          cmd: 'up' },
  { label: '↓',          cmd: 'down' },
];

function injectQuickbar(panel) {
  if (panel.querySelector('#ghost-quickbar')) return;
  const bar = document.createElement('div');
  bar.id = 'ghost-quickbar';
  for (const { label, cmd } of QUICK_ACTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost-quickbtn';
    btn.textContent = label;
    btn.title = `Send: ${cmd}`;
    btn.addEventListener('click', () => sendCommand(cmd));
    bar.appendChild(btn);
  }
  panel.appendChild(bar);
}

function sendCommand(cmd) {
  const ccinput = document.getElementById('ccinput');
  if (!ccinput) return;
  ccinput.value = cmd;
  // Synthesize an Enter keydown so the upstream engine picks it up
  // exactly the same way as if the user had typed it.
  const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  ccinput.dispatchEvent(ev);
  // Clear after dispatch — engine reads the value synchronously above.
  ccinput.value = '';
}

/* Render an AI bubble's text.  Any `>> cmd <<` substring becomes a
 * clickable button that fires sendCommand(cmd) when clicked. */
function renderBubbleContent(bubble, rawText) {
  // Build a DocumentFragment by walking the text and substituting
  // `>> ... <<` chunks with buttons.
  const frag = document.createDocumentFragment();
  const re = />>\s*([^><]+?)\s*<</g;
  let lastIdx = 0;
  let m;
  while ((m = re.exec(rawText)) !== null) {
    if (m.index > lastIdx) {
      frag.appendChild(document.createTextNode(rawText.slice(lastIdx, m.index)));
    }
    const cmd = m[1].trim();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost-suggestion';
    btn.textContent = cmd;
    btn.title = `Send: ${cmd}`;
    btn.addEventListener('click', () => sendCommand(cmd));
    frag.appendChild(btn);
    lastIdx = re.lastIndex;
  }
  if (lastIdx < rawText.length) {
    frag.appendChild(document.createTextNode(rawText.slice(lastIdx)));
  }
  bubble.appendChild(frag);
}

function appendBubble(kind, text, { stream = false } = {}) {
  const log = document.getElementById('ghost-companion-log');
  if (!log) return null;

  // Wipe empty-state on first real message.
  const empty = log.querySelector('.ghost-empty-state');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = `ghost-bubble ${kind}`;
  if (stream) {
    // For streaming AI replies we accumulate outside, then
    // re-render via renderBubbleContent() each chunk.
    bubble._streamText = '';
    bubble._renderStream = (chunk) => {
      bubble._streamText += chunk;
      // Preserve a trailing cursor element.
      const cursor = bubble.querySelector('.ghost-stream-cursor');
      bubble.textContent = '';
      renderBubbleContent(bubble, bubble._streamText);
      if (cursor) bubble.appendChild(cursor);
    };
  } else {
    renderBubbleContent(bubble, text);
  }
  if (stream) {
    const cursor = document.createElement('span');
    cursor.className = 'ghost-stream-cursor';
    bubble.appendChild(cursor);
  }
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

/* ------------------------------------------------------------------ */
/* Game event capture                                                  */
/* ------------------------------------------------------------------ */

let pendingTimer = null;

function captureGameEvents() {
  const cctext = document.getElementById('cctext');
  const ccinput = document.getElementById('ccinput');
  if (!cctext || !ccinput) {
    // Upstream engine hasn't mounted yet; retry shortly.
    setTimeout(captureGameEvents, 200);
    return;
  }

  // 1) Capture command on Enter.
  ccinput.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const cmd = ccinput.value.trim();
    if (!cmd) return;
    // Skip internal commands like /ask if needed later; for now, pass through.
    state.pendingCommand = cmd;
    state.cctextBaseline = cctext.textContent || '';
  });

  // 2) Watch cctext for new content; after debounce, ship to LLM.
  const observer = new MutationObserver(() => {
    if (!state.pendingCommand) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      const cmd = state.pendingCommand;
      const full = cctext.textContent || '';
      const delta = full.slice(state.cctextBaseline.length).trim();
      state.pendingCommand = null;
      state.cctextBaseline = '';
      if (!delta) return; // engine produced nothing; skip silently
      handlePlayerAction(cmd, delta);
    }, 350);
  });
  observer.observe(cctext, { childList: true, subtree: true, characterData: true });
}

async function handlePlayerAction(command, newDescription) {
  if (state.busy) {
    // Don't queue; just log so the user knows why we paused.
    appendBubble('ghost-user', `[忽略了] 上一轮还在思考，你刚说的是 "${command}"`);
    return;
  }

  state.round += 1;
  const userMsg = formatRound(state.round, command, newDescription);
  state.history.push(userMsg);

  await streamAssistantReply();
}

async function streamAssistantReply() {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    appendBubble('ghost-error',
      '还没配 API Key —— 点右上角 ⚙ 设置。Key 只存你浏览器 localStorage。');
    return;
  }

  state.busy = true;
  const bubble = appendBubble('ghost-bubble', '', { stream: true });

  try {
    const { default: OpenAI } = await import('https://esm.sh/openai@4.86.2');
    const client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      dangerouslyAllowBrowser: true,
    });

    const { messages, droppedRounds, totalEntries } = buildMessages(state.history);
    const est = estimateTokens(messages);
    console.log(
      `[ghost-companion] sending ${totalEntries} messages ` +
      `(~${est.approxTokens} tokens, ${est.cjk} CJK / ${est.ascii} ASCII ` +
      `chars, dropped ${droppedRounds} oldest rounds)`
    );

    const stream = await client.chat.completions.create({
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      stream: true,
      max_tokens: 200,
    });

    let accumulated = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue;
      accumulated += delta;

      // Re-render with parser so any complete `>> cmd <<` becomes a button.
      bubble._renderStream(delta);

      const log = document.getElementById('ghost-companion-log');
      if (log) log.scrollTop = log.scrollHeight;
    }

    // Final cleanup: remove cursor.
    const cursor = bubble.querySelector('.ghost-stream-cursor');
    if (cursor) cursor.remove();

    state.history.push({ role: 'assistant', content: accumulated });
  } catch (err) {
    bubble.classList.add('ghost-error');
    const cursor = bubble.querySelector('.ghost-stream-cursor');
    if (cursor) cursor.remove();
    bubble.textContent = `⚠️ ${err?.message || err}`;
  } finally {
    state.busy = false;
  }
}

/* ------------------------------------------------------------------ */
/* Restart                                                              */
/* ------------------------------------------------------------------ */

function restartGame() {
  state.history = [];
  state.round = 0;
  state.busy = false;
  state.pendingCommand = null;
  state.cctextBaseline = '';
  state.restartCount += 1;

  // Easiest cross-engine restart: full reload. Upstream advent.js keeps no
  // public API to reset in-place.
  location.reload();
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                            */
/* ------------------------------------------------------------------ */

// If we somehow reached here under file://, js/file-protocol-guard.js
// should have already shown an error overlay and the ES modules would
// not have loaded anyway.  Defensive double-check just in case.
if (location.protocol === 'file:') {
  console.error('[ghost-companion] file:// is not supported. Run ./start.sh and open the printed URL.');
} else {
  injectCompanionPanel();
  captureGameEvents();
}

// Helpful console breadcrumb so users can debug.
console.log('[ghost-companion] loaded. Config:', { ...loadConfig(), apiKey: '***' });