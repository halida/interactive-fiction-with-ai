/* =========================================================
 * Ghost Companion / prompt.js
 * System prompt + history → OpenAI-compatible messages builder.
 *
 * History shape (in-memory, owned by companion.js):
 *   [
 *     { role: 'user',      content: '[Round 1] cmd "look" -> "You are ..."' },
 *     { role: 'assistant', content: '👻 ...' },
 *     ...
 *   ]
 * ========================================================= */

export const SYSTEM_PROMPT = `你是「幽灵向导」，陪玩家玩 Colossal Cave Adventure（350 分版）。

【视野】你能看到游戏开始以来**所有**房间描述、玩家命令、系统回应、你自己的发言。但你看不到地图全貌、谜底、物品隐藏用途——只能从玩家描述里去"猜"和"建议"。

【限制】不能替玩家执行命令；不能直接给出"去 X 房拿 Y"这种通关路径；只能暗示方向、分享思路。永远不假装操作游戏，只说话。

【风格】温和老玩家语气，温暖、不急、带点幽默。句子短，1-2 行。当玩家沮丧多鼓励，做对事淡淡赞一句。每条以 👻 开头作为徽记。

【回应规则】
- 长度 ≤ 80 中文字符。
- 不重复游戏刚说过的话。
- 不要清单、标题、Markdown 装饰。
- 只输出你这轮要说的话，不解释、不加引号包裹。
- **建议动作时用 \`>> command <<\` 包裹**（如 ">> take lamp <<"），用户可点击直接执行。仅在值得提示时使用。
`;



/**
 * Convert one game event into a single user-role message.
 * @param {number} round - 1-indexed round number
 * @param {string} command - what the player just typed
 * @param {string} newDescription - what the game just showed in response
 * @returns {{role:'user', content:string}}
 */
export function formatRound(round, command, newDescription) {
  const cmd = (command || '').trim() || '(空命令)';
  const desc = (newDescription || '').trim();
  return {
    role: 'user',
    content: `[回合 ${round}] 玩家输入 "${cmd}"\n游戏回应：\n${desc}`,
  };
}

/**
 * Maximum number of rounds (user + assistant = 1 round) to keep in
 * the message history.  Older rounds are dropped when buildMessages()
 * is called.  This caps input cost per request and keeps the total
 * token count under most model context windows.
 */
export const MAX_HISTORY_ROUNDS = 40;

/**
 * Build the full message list passed to the chat completions API.
 * Prepends the system prompt; truncates oldest history entries when
 * the conversation would exceed MAX_HISTORY_ROUNDS rounds.
 *
 * @param {Array<{role:string, content:string}>} history
 * @param {number} [maxRounds=MAX_HISTORY_ROUNDS]
 * @returns {{messages: Array, droppedRounds: number, totalEntries: number}}
 */
export function buildMessages(history, maxRounds = MAX_HISTORY_ROUNDS) {
  const maxEntries = maxRounds * 2;
  let trimmed = history;
  let droppedRounds = 0;
  if (history.length > maxEntries) {
    trimmed = history.slice(-maxEntries);
    droppedRounds = (history.length - maxEntries) / 2;
  }
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed];
  return { messages, droppedRounds, totalEntries: messages.length };
}

/**
 * Rough in-browser token estimator.  CJK characters are counted as
 * ~1 token each; ASCII letters/numbers as ~1 token per 4 chars.
 * Not exact (no real BPE), but useful when the upstream API doesn't
 * return a prompt_tokens breakdown for the chat.completions endpoint.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @returns {{approxTokens: number, cjk: number, ascii: number}}
 */
export function estimateTokens(messages) {
  let cjk = 0;
  let ascii = 0;
  for (const m of messages) {
    const s = m.content || '';
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (
        (code >= 0x3400 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xffef)
      ) {
        cjk++;
      } else if (code >= 0x20 && code <= 0x7e) {
        ascii++;
      }
    }
  }
  const approxTokens = cjk + Math.ceil(ascii / 4);
  return { approxTokens, cjk, ascii };
}