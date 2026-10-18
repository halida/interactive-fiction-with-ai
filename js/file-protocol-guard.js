/* =========================================================
 * Ghost Companion / file-protocol-guard.js
 * Plain (non-module) script that runs BEFORE the ES modules
 * (settings.js / prompt.js / companion.js) which are blocked
 * by CORS under file://.  When the user opens the page via
 * file:// we show a friendly error and stop; otherwise this
 * script is a no-op.
 * ========================================================= */

(function () {
  if (location.protocol !== 'file:') return;

  // Paint the friendly error as soon as DOMContentLoaded fires.
  function showError() {
    document.title = 'Ghost Companion — please use an HTTP server';
    var existing = document.getElementById('ghost-file-protocol-error');
    if (existing) return;

    var div = document.createElement('div');
    div.id = 'ghost-file-protocol-error';
    div.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:#0e0e14', 'color:#d8d8e8',
      'font-family:Lucida Console, Consolas, Courier, monospace',
      'font-size:16px', 'line-height:1.6',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:40px'
    ].join(';');

    div.innerHTML =
      '<div style="max-width:640px;border:1px solid #5c2c2c;background:#3a1a1a;' +
      'border-radius:10px;padding:32px;color:#ffb4b4;">' +
        '<h2 style="margin:0 0 12px;color:#ff8888;">⚠️ Ghost Companion: please use an HTTP server</h2>' +
        '<p style="margin:0 0 16px;">' +
          'You opened this page via <code>file://</code>. The upstream CCA engine ' +
          'reads <code>document.styleSheets[].cssRules</code> during initialization, ' +
          'which throws a <code>SecurityError</code> when CSS files come from ' +
          'different directories (browsers treat each file:// directory as its own ' +
          'origin). Result: the game stalls on ' +
          '<em>“Initializing... please wait”</em>.' +
        '</p>' +
        '<p style="margin:0 0 8px;"><b>How to fix:</b></p>' +
        '<pre style="background:#1a1a26;border:1px solid #2a2a3a;padding:12px;' +
        'border-radius:6px;color:#b4b4f2;margin:0 0 16px;overflow-x:auto;">' +
          'cd /path/to/if_ai\n./start.sh               # 默认 8000 端口\n' +
          '# 或:  python3 -m http.server 8000' +
        '</pre>' +
        '<p style="margin:0;">Then open ' +
          '<code style="color:#b4b4f2;">http://localhost:8000/vendor/advent/advent.html</code>' +
          '</p>' +
      '</div>';

    document.body.appendChild(div);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showError);
  } else {
    showError();
  }
})();