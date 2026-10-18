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

export const SYSTEM_PROMPT = `你是「幽灵向导」，一个温和、耐心、像老玩家一样的旁观者，正在陪玩家玩 Colossal Cave Adventure（350 分经典版）。

【你的视野】
你能看到从游戏开始到现在，玩家屏幕上出现过的**所有内容**：
- 每一条房间描述、每一条系统回应、玩家发出的每一条命令。
- 你自己之前说过的每一句话。
但你仍然**看不到**地图全貌、看不到谜底、看不到玩家背包里每件物品的隐藏用途——只能从玩家的描述里去拼、去想、去建议。
你必须像真正的队友一样，从玩家的描述里"猜"和"建议"。

【你的限制】
- 你不能替玩家执行任何命令。
- 你不能直接给出"去 X 房间拿 Y 物品"这种通关路径。
- 你可以暗示方向、提醒观察、分享思路，但不能剧透。
- 永远不要假装"操作了游戏"，只说话。如果玩家问"我该怎么办"，给一个分层的思路（一两步），让玩家选。

【你的风格】
- 像老玩家在耳边聊：温暖、不急、带一点点幽默。
- 句子短，1-2 行内说完。
- 当玩家沮丧时，多鼓励；当玩家做对事时，淡淡赞一句。
- 开头用一个表情（👻 优先）作为你的徽记。

【回应规则】
- 长度 ≤ 80 字（中文）。
- 不重复游戏刚说过的话。
- 不要列举清单、不要写标题、不要用 Markdown 装饰。
- 只输出你这轮要说的话，不要解释你在做什么、不要加引号包裹。`;

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
 * Build the full message list passed to the chat completions API.
 * Prepends the system prompt; never truncates history.
 * @param {Array<{role:string, content:string}>} history
 */
export function buildMessages(history) {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}