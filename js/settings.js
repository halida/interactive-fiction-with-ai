/* =========================================================
 * Ghost Companion / settings.js
 * Config panel + localStorage persistence + connection test.
 *
 * Public API:
 *   loadConfig()             → Config
 *   saveConfig(partial)      → Config  (merges, persists, returns full)
 *   openSettingsDialog(onChange)  → void  (mounts dialog + binds handlers)
 *
 * Config shape:
 *   {
 *     apiKey: string,
 *     baseURL: string,   // e.g. https://api.openai.com/v1
 *     model: string,     // e.g. gpt-4o-mini
 *     temperature: number
 *   }
 * ========================================================= */

const STORAGE_KEY = 'ghost-companion-config';

export const DEFAULTS = Object.freeze({
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.7,
});

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(partial) {
  const next = { ...loadConfig(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/* ------------ UI ------------ */

let dialogEl = null;

function buildDialog(initial) {
  const dlg = document.createElement('dialog');
  dlg.id = 'ghost-settings';
  dlg.innerHTML = `
    <h2>👻 Ghost Companion — 设置</h2>

    <label for="ghost-api-key">API Key</label>
    <input id="ghost-api-key" type="password" autocomplete="off" spellcheck="false"
           placeholder="sk-..." value="${escapeAttr(initial.apiKey)}" />

    <label for="ghost-base-url">Base URL</label>
    <input id="ghost-base-url" type="text" autocomplete="off" spellcheck="false"
           placeholder="https://api.openai.com/v1" value="${escapeAttr(initial.baseURL)}" />
    <div id="ghost-settings-hint">支持 OpenAI 兼容端点：OpenAI、DeepSeek、Moonshot、智谱 等。需支持浏览器 CORS。</div>

    <label for="ghost-model">Model</label>
    <input id="ghost-model" type="text" autocomplete="off" spellcheck="false"
           placeholder="gpt-4o-mini / deepseek-chat / ..." value="${escapeAttr(initial.model)}" />

    <label for="ghost-temperature">Temperature: <span id="ghost-temp-val">${initial.temperature}</span></label>
    <input id="ghost-temperature" type="range" min="0" max="1.5" step="0.1"
           value="${initial.temperature}" />

    <div id="ghost-settings-actions">
      <button type="button" id="ghost-cancel-btn">取消</button>
      <button type="button" id="ghost-test-btn">测试连接</button>
      <button type="button" id="ghost-save-btn" class="primary">保存</button>
    </div>
    <div id="ghost-settings-status"></div>
  `;
  document.body.appendChild(dlg);
  return dlg;
}

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function readDialogInputs(dlg) {
  return {
    apiKey: dlg.querySelector('#ghost-api-key').value.trim(),
    baseURL: dlg.querySelector('#ghost-base-url').value.trim(),
    model: dlg.querySelector('#ghost-model').value.trim(),
    temperature: parseFloat(dlg.querySelector('#ghost-temperature').value),
  };
}

async function testConnection(cfg) {
  if (!cfg.apiKey) throw new Error('API Key 为空');
  if (!cfg.baseURL) throw new Error('Base URL 为空');
  if (!cfg.model) throw new Error('Model 为空');

  // Load openai SDK lazily from esm.sh so this module is cheap to import.
  const { default: OpenAI } = await import('https://esm.sh/openai@4.86.2');
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    dangerouslyAllowBrowser: true,
  });

  const r = await client.chat.completions.create({
    model: cfg.model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 5,
  });
  if (!r?.choices?.[0]) throw new Error('响应中没有 choices');
  return r;
}

/**
 * Mount the settings dialog and bind handlers.
 * @param {(cfg:object) => void} [onChange] - called with the new config after Save.
 */
export function openSettingsDialog(onChange) {
  if (!dialogEl) dialogEl = buildDialog(loadConfig());

  const dlg = dialogEl;
  const status = dlg.querySelector('#ghost-settings-status');
  const tempVal = dlg.querySelector('#ghost-temp-val');
  const tempRange = dlg.querySelector('#ghost-temperature');

  tempRange.addEventListener('input', () => { tempVal.textContent = tempRange.value; });

  dlg.querySelector('#ghost-cancel-btn').onclick = () => {
    status.textContent = ''; status.className = '';
    dlg.close();
  };

  dlg.querySelector('#ghost-test-btn').onclick = async () => {
    const cfg = readDialogInputs(dlg);
    status.textContent = '测试中…'; status.className = '';
    try {
      await testConnection(cfg);
      status.textContent = '✅ 连接成功'; status.className = 'ok';
    } catch (err) {
      status.textContent = `❌ ${err?.message || err}`; status.className = 'err';
    }
  };

  dlg.querySelector('#ghost-save-btn').onclick = async () => {
    const cfg = readDialogInputs(dlg);
    if (!cfg.apiKey) {
      status.textContent = '❌ API Key 不能为空'; status.className = 'err';
      return;
    }
    const saved = saveConfig(cfg);
    status.textContent = '✅ 已保存到 localStorage'; status.className = 'ok';
    onChange?.(saved);
    // close after a brief moment so the user sees the confirmation
    setTimeout(() => { status.textContent = ''; dlg.close(); }, 600);
  };

  dlg.showModal();
}