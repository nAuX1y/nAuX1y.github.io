# TESTING · 绿茵王朝 v1.3.11

没有正式自动化测试框架。下面是接手后应做的最小验证集。

---

## 0. v1.3.11 / v1.3.10 专项回归（联赛难度 / 自动排阵 / 自由球员市场）

### 0.0 联赛难度：乙级 70 vs 60（v1.3.11 新增，必跑）

在测试浏览器载入任意存档（或新建档进入主页）后，把下面整段粘贴到控制台。脚本会临时创建两支测试球队，在乙级跑 8 场同步模拟（约 1–3 分钟），结束后清理临时球员/俱乐部并恢复 RNG，不写存档。

```js
(() => {
  // v1.3.11 联赛难度专项回归：乙级 全队70 vs 全队60，8 场同步模拟（主客场各 4 场）。
  // 预期：至少 5 胜、至多 1 负（旧版 v1.3.10 同场景大约 2–3 胜）。脚本约需 1–3 分钟。
  const savedG = G, savedRng = _rngState, seed = 20261117;
  const savedNextPlayerId = nextPlayerId, savedNames = new Set(usedNames);
  if (!savedG) return '请先进入游戏（需要 G 已载入）';
  const uid = 990001, oid = 990002;
  const mkAttrs = v => Object.fromEntries(ATTR_KEYS.map(k => [k, v]));
  const POS = ['GK','GK','CB','CB','CB','LB','RB','DM','CM','CM','LM','RM','AM','LW','RW','ST','ST','SS'];
  const build = (clubId, v) => {
    const ids = [];
    for (const pos of POS) {
      const p = makePlayer({ pos, age: 26, attrs: mkAttrs(v), potential: Math.min(99, v + 12), fitness: 100, form: 55, morale: 70, contract: 2, clubId, wage: 1000 });
      p.ovr = calcOvr(p.attrs, p.pos);
      p.potential = Math.max(p.ovr + 1, p.potential);
      G.players[p.id] = p;
      ids.push(p.id);
    }
    return ids;
  };
  try {
    clearNameRegistry();
    setRngSeed(seed);
    const user = makeClub({ id: uid, name: '测试70', short: '测70', tier: 3, reputation: 50, capacity: 12000, trainingLevel: 3, medicalLevel: 3, youthLevel: 3 });
    const opp = makeClub({ id: oid, name: '测试60', short: '测60', tier: 3, reputation: 50, capacity: 12000, trainingLevel: 3, medicalLevel: 3, youthLevel: 3 });
    user.isUser = true; user.promotedSeason = null; user.formation = '4-4-2';
    opp.formation = '4-4-2';
    user.tactics = { attack: 'balanced', defense: 'balanced', tempo: 'normal' };
    opp.tactics = { ...user.tactics };
    user.squad = build(uid, 70); opp.squad = build(oid, 60);
    user.lineup = bestLineupForClub(user, G.players, false); user.bench = bestBenchForClub(user, G.players, user.lineup, 7, false);
    opp.lineup = bestLineupForClub(opp, G.players, false); opp.bench = bestBenchForClub(opp, G.players, opp.lineup, 7, false);
    const out = { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    for (let i = 0; i < 8; i++) {
      const home = i % 2 === 0;
      const f = { id: 990100 + i, tier: 3, round: 1, home: home ? uid : oid, away: home ? oid : uid, played: false, hg: 0, ag: 0, scorers: [], stats: null };
      const eng = new MatchEngine({ fixture: f, userClub: user, oppClub: opp, weather: WEATHERS[0], teamTalk: 'calm', oppLineup: opp.lineup.map(x => ({ ...x })), oppBench: opp.bench.slice() });
      let steps = 0;
      while (!eng.finished && steps < 60 * 400) { if (eng.halfTime) eng.secondHalf(); if (eng.paused) eng.paused = false; eng.step(1 / 60); steps++; }
      const ug = eng.teams.left.score, og = eng.teams.right.score;
      out.gf += ug; out.ga += og;
      if (ug > og) out.w++; else if (ug === og) out.d++; else out.l++;
    }
    out.ok = out.w >= 5 && out.l <= 1;
    return out;
  } finally {
    for (const id of [...(G.players ? Object.keys(G.players) : [])].map(Number)) {
      const p = G.players[id];
      if (p && (p.clubId === uid || p.clubId === oid)) delete G.players[id];
    }
    delete G.clubs[uid]; delete G.clubs[oid];
    nextPlayerId = savedNextPlayerId;
    usedNames.clear();
    savedNames.forEach(n => usedNames.add(n));
    _rngState = savedRng;
    if (G) G.rngState = savedRng;
  }
})()
```

预期：`{ w: 6, d: 2, l: 0, gf: 16, ga: 3, ok: true }`（脚本会临时重置并恢复名字注册表与 RNG，所以不同存档结果一致）；`ok === true` 表示能力差重新成为比赛结果的主导因素。旧版 v1.3.10 同场景通常只有 2–3 胜。

### 0.1 联赛强度数值（即时检查）

```js
({
  bonus: [1,2,3,4,5].map(t => +aiTierExecutionBonus(t).toFixed(2)),
  labels: [1,2,3,4,5].map(TIER_DIFFICULTY_LABEL),
  difficulty: [1,2,3,4,5].map(TIER_DIFFICULTY),
})
```

预期：`bonus === [1.1, 1.08, 1.06, 1.04, 1.02]`，`labels === ['+10%', '+8%', '+6%', '+4%', '+2%']`，`difficulty === [10, 8, 6, 4, 2]`。任何一项出现 1.2 以上或 `×66` 说明难度参数被改回去了。

### 0.2 自动排阵（v1.3.10 回归）

控制台逐条执行，全部应返回 `true` 或预期值。

```js
// 0.3 自动排阵：11 人首发、无重复、门将只踢门将位、伤号不首发
(() => {
  autoPickLineup();
  const c = userClub();
  const slots = FORMATION_SLOTS[c.formation];
  const ids = c.lineup.map(x => x.playerId).filter(Boolean);
  const gkSlot = slots.findIndex(s => s.pos === 'GK');
  const gk = c.lineup[gkSlot]?.playerId ? player(c.lineup[gkSlot].playerId) : null;
  return {
    starters: ids.length,
    unique: new Set(ids).size === ids.length,
    gkIsGk: !gk || gk.pos === 'GK',
    noGkInField: c.lineup.every((x, i) => !x.playerId || slots[i].pos === 'GK' || player(x.playerId).pos !== 'GK'),
    noInjured: ids.every(id => player(id).injuryDays <= 0 && player(id).suspension <= 0),
    benchHasGk: (c.bench || []).some(id => player(id)?.pos === 'GK'),
    benchNoOverlap: (c.bench || []).every(id => !ids.includes(id)),
  };
})()
```

```js
// 0.4 自动排阵不会被下一次渲染/校验撤销（先让一名首发受伤，再点击自动排阵）
(() => {
  const c = userClub();
  autoPickLineup();
  const starter = player(c.lineup.find(x => x.playerId && player(x.playerId).pos !== 'GK').playerId);
  starter.injuryDays = 4;
  autoPickLineup();
  const before = c.lineup.map(x => x.playerId).join(',');
  ensureUserLineupValid(); ensureUserLineupValid();
  const after = c.lineup.map(x => x.playerId).join(',');
  starter.injuryDays = 0;
  return { stable: before === after, injuredOut: !c.lineup.some(x => x.playerId === starter.id) };
})()
```

```js
// 0.5 自由球员池：总数 ≤64、门将 ≤4、没有球队球员混入
(() => {
  pruneFreeAgents();
  const fa = G.freeAgents.map(id => player(id)).filter(Boolean);
  return {
    total: fa.length, totalOk: fa.length <= 64,
    gks: fa.filter(p => p.pos === 'GK').length, gkOk: fa.filter(p => p.pos === 'GK').length <= 4,
    noClubPlayers: fa.every(p => !p.clubId),
    hasGkAvailable: fa.some(p => p.pos === 'GK'),
  };
})()
```

```js
// 0.6 市场列表门将占比（建议 <8%；旧版 10%–13%）
(() => {
  refreshTransferListings(true);
  const list = marketPlayerIds().map(id => player(id)).filter(Boolean);
  const gks = list.filter(p => p.pos === 'GK').length;
  return { total: list.length, gks, gkPct: Math.round(gks / Math.max(1, list.length) * 100) };
})()
```

```js
// 0.7 连续推进 6 个赛季后，自由球员池应稳定在 40–64 人、门将 0–4 人
(() => {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    resolveContractsAndAge();
    refillAISquads();
    const fa = G.freeAgents.map(id => player(id)).filter(Boolean);
    rows.push({ season: G.season.number, total: fa.length, gks: fa.filter(p => p.pos === 'GK').length });
    G.season.number += 1;
  }
  return rows;
})()
```

预期：`total` 稳定在 40–64；`gks` 为 0–4；不会出现赛季越往后门将越多的趋势。

---

## 1. 构建检查

```bash
cd src
python bundle.py
```

预期：

- 生成 `../dist/grassroots-dynasty.html`
- 生成 `../dist/绿茵王朝.html`
- 两个文件大小相同
- 控制台/终端无 Python 异常
- 文件大小约 732 KB（v1.3.11 为 731,935 bytes；v1.3.10 为 731,736 bytes）

SHA-256 见 `MANIFEST.txt`。

## 2. 浏览器加载检查

打开 `dist/grassroots-dynasty.html`，然后在控制台执行：

```js
({
  version: APP_VERSION,
  secureContext: window.isSecureContext,
  webCrypto: !!(window.crypto && crypto.subtle),
  hasGame: !!G,
  hasSetup: !!SETUP,
  save: localStorage.getItem(SAVE_KEY) ? 'present' : 'empty',
  title: document.title,
})
```

预期：

- `version === '1.3.11'`
- `title === '绿茵王朝 · 足球经理'`
- `webCrypto === true`（Edge/Chrome 的 file:// 测试通过）
- 页面无红字控制台异常

## 3. 新档 UI 烟测

1. 点击“开始新的俱乐部”。
2. 输入/保留俱乐部名、城市、球场、主教练，进入“队徽与球衣”。
3. 点击“下一步 · 招募首批球员”。
4. 点击“智能推荐 16 人”。
5. 检查：
   - 初始预算显示 `¥80.0万`；
   - 推荐 16 人，门将 ≥2、后卫 ≥5、中场 ≥4、前锋 ≥2；
   - 签约费不超过预算；
   - 总人数 ≥14。
6. 点击“签下球员 · 开始征程”。

预期：

- 进入主页，现金约 73 万（扣签约费后）；
- 董事会目标通常为“完成保级，避免垫底”；
- 薪资预算不低于周薪总额；
- 无控制台异常。

## 4. 阵容选择弹窗检查（v1.1.0 重点回归，v1.1.2 仍需保留）

1. 进入“阵容”页。
2. 点击任意首发位置。
3. 检查：
   - 弹窗在桌面宽度下居中、宽度不超过视口；
   - 每个候选人是完整横向卡片，不是纵向散架；
   - 每行显示球衣号、姓名、位置、年龄/国籍/天然位置/球风/适应度、位置能力/体力/潜力；
   - 页面没有横向滚动条；
   - 点击整行可以选中该球员；
   - 弹窗内不存在 `<button>` 嵌套 `<button>`。

控制台检查：

```js
openLineupSlotModal(0);
({
  rows: document.querySelectorAll('.lineup-choice').length,
  nestedButtons: document.querySelectorAll('.lineup-choice button').length,
  overflow: (() => {
    const b = document.querySelector('.modal-body');
    return b ? b.scrollWidth > b.clientWidth + 1 : null;
  })(),
});
```

预期：`nestedButtons === 0`，`overflow === false`。

## 4.1 v1.1.6 重点回归

### 全局消息位置

在任意页面触发一个 toast：

```js
(() => {
  toast('测试消息', '检查消息位置。', 'good');
  const root = document.querySelector('#toast-root');
  const cs = getComputedStyle(root);
  const rect = root.getBoundingClientRect();
  return {
    position: cs.position,
    bottom: cs.bottom,
    right: cs.right,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    vw: innerWidth,
    vh: innerHeight,
  };
})()
```

预期：

- `position === 'fixed'`；
- 桌面宽屏下 `bottom === '22px'`、`right === '22px'`，消息位于视口右下角；
- 700px 以下时 toast 区域左右各 12px、底部 12px；
- 消息不会把页面撑高，也不会出现在文档左下角。

### 防守策略

手动进行一场比赛，观察：

- 防守方是否有一个上抢者，以及一个站在球和球门之间的保护人；
- 禁区内进攻球员是否有人贴防，而不是全部退到门前看球；
- 前锋前插时，盯防者是否持续跟防；
- 禁区/危险区域丢球时，是否有第二名防守人补抢；
- 传球线路上是否出现防守者，而不是只有持球人面对门将。

控制台检查：

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm',
    oppLineup: bestLineupForClub(opp, G.players, true),
    oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true) });
  eng.ball.owner = eng.teams.right.players.find(p => !p.isGK);
  eng.updateTeamStructure();
  eng.assignMarks('left');
  return {
    presser: !!eng.teams.left.presser,
    cover: !!eng.teams.left.coverPlayer,
    marks: Object.keys(eng.teams.left.markAssignments).length,
    phase: eng.teams.left.phase,
  };
})()
```

预期：`presser === true`，`cover === true`，`marks` 通常在 3–6 之间，`phase === 'defense'`。

### 初始招募列表滚动

进入新档“组建初始阵容”，把招募列表滚到中间，然后连续选择/取消多名球员：

- 列表不应跳回顶部；
- 滚动位置保持；
- 右侧预算、人数、位置检查、签约按钮实时更新；
- 被点击行的“已选择/费用”文字立即变化。

控制台检查：

```js
(() => {
  const list = document.querySelector('#recruit-list');
  list.scrollTop = 200;
  const before = list.scrollTop;
  const row = document.querySelectorAll('.recruit-item')[10];
  toggleRecruit(Number(row.dataset.id));
  const list2 = document.querySelector('#recruit-list');
  const after = list2.scrollTop;
  const picked = row.classList.contains('selected');
  toggleRecruit(Number(row.dataset.id));
  return { before, after, sameNode: list === list2, picked, scrollAfterSecond: list2.scrollTop };
})()
```

预期：`before === after === scrollAfterSecond`，`sameNode === true`，`picked === true`。

### 测试模式与重置存档

在“存档与设置”面板：

1. 连续输入 `cutezrr` 三次。
2. 每次正确后应显示 `连续 1 / 3`、`连续 2 / 3`。
3. 第三次后应进入测试模式，出现测试工具和顶部“测试模式”标识。
4. 输入其他代码应重置连续次数。
5. 也可以一次输入 `cutezrrcutezrrcutezrr` 直接解锁。

控制台检查：

```js
(() => {
  openSaveMenu();
  const input = document.querySelector('#settings-code');
  input.value = 'cutezrr';
  applySettingsCode();
  const s1 = document.querySelector('#settings-code-status')?.textContent;
  input.value = 'cutezrrcutezrrcutezrr';
  applySettingsCode();
  return { s1, testMode: G.meta.testMode, flag: readTestModeFlag(), panel: !!document.querySelector('[data-action="test-add-cash"]') };
})()
```

预期：`s1` 包含 `1 / 3`，`testMode === true`，`flag === true`，`panel === true`。

测试工具：

- `+¥1,000,000`：现金增加 100 万；
- 恢复体力：全队 `fitness === 100`；
- 清除伤病/停赛：`injuryDays/suspension/yellowCards` 归零；
- 跳到比赛日：`G.season.day === 5`；
- 批量模拟 10 场：显示总比分、射门、传球成功率、抢断、拦截，且不写入赛程；
- 青训十连抽：一次生成 10 张球员卡并写入青训名单，可正常提拔；重复抽卡会清理上一批尚未提拔的测试球员；
- 模拟 1000 抽 · 仅统计：显示隐藏天才人数/实际概率/理论期望/十连命中率/潜力分布，不创建球员、不写存档，前后 `G.rngState` 一致；
- 退出测试模式：顶部标识消失，设置代码输入框重新出现；
- 重置存档：`localStorage.getItem(SAVE_KEY) === null`，页面回到开始界面，`gdynasty_test_mode_v1` 保留。

青训十连抽检查：

```js
(() => {
  const before = G.meta.youthTest?.pulls || 0;
  testYouthTenPull();
  const cards = document.querySelectorAll('#modal-root .prospect-card').length;
  const pulls = (G.meta.youthTest?.pulls || 0) - before;
  const rngBefore = G.rngState;
  testYouthProbability();
  const text = document.querySelector('#modal-root .modal')?.innerText || '';
  return { cards, pulls, probabilityShown: /模拟 1000 抽/.test(text), rngSame: G.rngState === rngBefore };
})()
```

预期：`cards === 10`、`pulls === 10`、`probabilityShown === true`、`rngSame === true`。当前公式为 `0.2% + 学院等级 × 0.04%`；1 级单抽 0.24%，十连至少 1 名约 2.37%。

青训隐藏标记检查（v1.3.7 回归，强制命中以验证传递）：

```js
(() => {
  const old = youthHiddenChance;
  youthHiddenChance = () => 1;
  const r = rollYouthProspect(5);
  const p = buildYouthProspect(r, 5);
  youthHiddenChance = old;
  return { rollHidden: r.hidden, playerHidden: p.hidden, potential: p.potential };
})()
```

预期：`rollHidden === true`、`playerHidden === true`。2000 次 5 级自然抽取的基线为“隐藏判定 8 次 = 生成球员 hidden 8 人”，修复前是 8 次判定、0 人标记。

旧存档补标记检查：

```js
(() => {
  const a = makePlayer({ age:18, pos:'CM', quality:60, potential:98, homegrown:true });
  a.hidden = false; a.potential = 98; G.players[a.id] = a;
  const b = makePlayer({ age:24, pos:'CM', quality:60, potential:98, homegrown:false });
  b.hidden = false; b.potential = 98; G.players[b.id] = b;
  ensureGameShape();
  return { homegrown: a.hidden, other: b.hidden };
})()
```

预期：`homegrown === true`、`other === false`。

街头十连抽检查（v1.3.8）：

```js
(() => {
  closeModal();
  const c = userClub();
  const before = { cash: c.cash, day: c.streetLastDay, free: G.freeAgents.length, pulls: G.meta.streetTest?.pulls || 0 };
  testStreetTenPull();
  const modal = document.querySelector('#modal-root .modal');
  const stats = G.meta.streetTest;
  return {
    cards: modal.querySelectorAll('.prospect-card').length,
    pullsAdded: stats.pulls - before.pulls,
    freeAdded: G.freeAgents.length - before.free,
    cashSame: c.cash === before.cash,
    daySame: c.streetLastDay === before.day,
    marketButton: !!modal.querySelector('[data-action="test-street-open-market"]'),
  };
})()
```

预期：`cards === 10`、`pullsAdded === 10`、`freeAdded === 10`、`cashSame === true`、`daySame === true`、`marketButton === true`。

街头隐藏标记检查（强制命中）：

```js
(() => {
  closeModal();
  const old = chance;
  chance = q => q === 0.0005 ? true : old(q);
  testStreetTenPull();
  chance = old;
  const modal = document.querySelector('#modal-root .modal');
  const cards = [...modal.querySelectorAll('.prospect-card')];
  return { hiddenCards: cards.filter(c => c.innerText.includes('隐藏天才')).length, statsHidden: G.meta.streetTest.hidden };
})()
```

预期：`hiddenCards >= 1`、`statsHidden >= 1`，且第一张隐藏卡为刘一。1000 抽统计应显示配置概率 0.250%、十连 2.47%、平均 400 抽 1 名，前后 `G.rngState` 一致。

隐藏二次确认检查（v1.3.9，接上一步，已有未签约刘一）：

```js
(() => {
  closeModal();
  const before = { pulls: G.meta.streetTest.pulls, hist: G.meta.drawHistory.length };
  testStreetTenPull();
  const modal = document.querySelector('#modal-root .modal');
  const text = modal?.innerText || '';
  return {
    title: modal?.querySelector('h3')?.textContent,
    mentionsLiu: text.includes('刘一'),
    pullsSame: G.meta.streetTest.pulls === before.pulls,
    histSame: G.meta.drawHistory.length === before.hist,
    forceButton: !!modal?.querySelector('[data-action="test-street-force-ten-pull"]'),
  };
})()
```

预期：标题包含“未签约的隐藏天才”、`mentionsLiu === true`、`pullsSame === true`、`histSame === true`、`forceButton === true`。取消后 `pendingStreetTestHidden().length >= 1`；调用 `testStreetTenPull(true)` 后才清理并新增一条历史。

抽取记录检查：

```js
(() => {
  closeModal();
  openDrawHistory();
  const modal = document.querySelector('#modal-root .modal');
  return {
    title: modal?.querySelector('h3')?.textContent,
    details: modal?.querySelectorAll('.draw-history-item').length,
    hasHiddenSummary: (modal?.innerText || '').includes('隐藏 1'),
    hasHiddenName: (modal?.innerText || '').includes('刘一'),
  };
})()
```

预期：`details >= 2`、折叠摘要包含隐藏人数和“刘一”；历史最多保留 20 条，快照不受测试球员清理影响。

### 球衣图片

进入新档“队徽与球衣”步骤，依次点击纯色、竖条纹、斜绶带、左右拼色、横条纹。检查：

- 花纹被裁在球衣轮廓内，不再有横向/纵向色块伸出衣服；
- 球衣左右对称；
- 号码“10”在每种花纹上都清楚；
- 调整主色/辅色后号码底板仍然可读。

控制台检查：

```js
(() => {
  const svg = decodeURIComponent(makeKit(['#b74e47','#f2e6d0'], 'hoops').split(',')[1]);
  return {
    clipped: svg.includes('clip-path="url(#kit-body)"'),
    centered: svg.includes('M92 34C100 52'),
    plate: svg.includes('x="104" y="152"'),
  };
})()
```

预期：三项都为 `true`。

旧档迁移：

```js
(() => {
  const c = userClub();
  c.kit = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');
  ensureGameShape();
  const migrated = c.kit.includes('kit-body');
  c.kit = 'data:image/png;base64,AAAA';
  ensureGameShape();
  return { migrated, uploadedKept: c.kit === 'data:image/png;base64,AAAA' };
})()
```

### 赛前训话无闪屏

打开赛前部署，连续点击三个训话选项：

```js
(() => {
  const modal = document.querySelector('#modal-root .modal');
  setPrematchTalk('free');
  return {
    sameModal: document.querySelector('#modal-root .modal') === modal,
    active: document.querySelector('.talk-btn[data-key="free"]').classList.contains('active'),
  };
})()
```

预期：`sameModal === true`，`active === true`。

### 大字提示不闪烁

在大字提示出现时连续调用 `updateMatchScoreboard()`，检查提示 DOM 节点不被重建。

```js
(() => {
  const el = document.querySelector('#match-event-flash .match-event-flash');
  if (!el) return '先触发一次射门/扑救/进球';
  el.__probe = 'keep';
  for (let i = 0; i < 8; i++) updateMatchScoreboard();
  return document.querySelector('#match-event-flash .match-event-flash').__probe === 'keep';
})()
```

预期：`true`。

### 中场训话和名字跳动

进入中场休息：

- 点击“压上进攻/稳住防线/自由发挥”，按钮应立即高亮并禁用，显示“本场临场训话已使用”；
- 切换临场阵型，场上球员名字不应上下跳动。

控制台检查固定偏移：

```js
(() => {
  const mp = matchEngine.teams.left.players[5];
  const before = mp.labelShift;
  matchEngine.changeFormation('left', '4-3-3');
  return { before, after: mp.labelShift };
})()
```

预期：`before === after`。

### 死球发球与暂停走位

手动进行一场比赛，观察：

- 球门球由门将走向球点后再开球；
- 界外球/角球/任意球由发球人走向球点，其他球员回位；
- 发球人到位后立即发球；对手可能还没完全落位；
- 在死球阶段按暂停，球员仍会继续走位，但比赛时间不推进；
- 继续比赛后，发球人到位即可立即发球。

快速控制台检查：

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm',
    oppLineup: bestLineupForClub(opp, G.players, true),
    oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true) });
  const gk = eng.teams.left.players.find(p => p.isGK);
  eng.restartGoalKick(eng.teams.left);
  const state = eng.restartState;
  let steps = 0;
  while (eng.restartState && steps < 600) { eng.step(1/60); steps++; }
  return { type: state?.type, takerIsGk: state?.taker === gk, ownerIsGk: eng.ball.owner === gk, steps };
})()
```

预期：`type === 'goalkick'`，`takerIsGk === true`，`ownerIsGk === true`。

### 边线球方向

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm',
    oppLineup: bestLineupForClub(opp, G.players, true),
    oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true) });
  eng.restartThrowIn(eng.teams.left, 20, .7);
  const top = eng.ball.y;
  eng.restartThrowIn(eng.teams.left, 80, 67.3);
  const bottom = eng.ball.y;
  return { top, bottom };
})()
```

预期：`top < 34`（约 `0.9`），`bottom > 34`（约 `67.1`）。

### 单刀识别与权重

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm',
    oppLineup: bestLineupForClub(opp, G.players, true),
    oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true) });
  const mp = eng.teams.left.players.find(p => p.role === 'ST') || eng.teams.left.players[10];
  const goalX = 105;
  mp.x = goalX - 18; mp.y = 34;
  for (const p of eng.allPlayers) {
    if (p.team !== eng.teams.left && !p.isGK) { p.x = 55; p.y = p.side === 'right' ? 10 : 60; }
  }
  const info = eng.oneOnOneInfo(mp);
  eng.ball.owner = mp; eng.ball.x = mp.x; eng.ball.y = mp.y;
  mp.minutes = 1;
  let shots = 0;
  const orig = eng.shoot.bind(eng);
  eng.shoot = (p, oo) => { shots++; return orig(p, oo); };
  for (let i = 0; i < 20; i++) { mp.ballHoldUntil = 0; eng.carrierDecision(mp); }
  return { oneOnOne: info.oneOnOne, distGoal: Math.round(info.distGoal), shots };
})()
```

预期：`oneOnOne === true`，`distGoal` 约 18，20 次决策内会出现单刀射门（`shots > 0`）。

### 冒险跳过

- 赛前部署点击“冒险跳过” → 确认；应出现助教带队结果，比赛日推进到周日；
- 比赛中暂停或中场休息点击“冒险跳过” → 确认；剩余比赛立即结算并显示全场面板；
- 检查 `G.lastMatch.riskSkip === true`；
- 检查首发球员体能比正常比赛额外下降，且可能生成伤情新闻；
- 存档后重新载入，结果和伤情保留。

## 4.2 v1.1.7 重点回归（v1.1.9 仍需保留）

### 球员数值

1. 进入阵容页，点击任意球员“详情”。
2. 检查“能力数值（1–100）”包含：射门、力量、速度、运球、传球、防守、守门、耐力、身体素质、士气。
3. 检查“其他属性”包含抢断、视野。
4. 新游戏“组建初始阵容”中每名球员行末有“数值”按钮，点击应打开同一套数值面板。
5. 旧存档载入后，`ensureGameShape` 应补齐 `sta`/`phy`（不会出现 0 或 `undefined`）。

### 训练消耗与成长

1. 记录全队平均体力；选择“综合训练 / 标准”推进一天。
2. 训练消耗应约 11 点，日常恢复约 5 点，净变化约 -6；不再一夜回满。
3. 训练报告如果出现提升，应显示“球员 + 属性 + 旧值 → 新值”。
4. 训练提升概率应明显低于每天每人必涨；与位置相关的项目更容易提升。
5. 赛后检查用户球员是否偶尔出现“比赛成长”新闻；不应每场大量出现。

### 开球与死球复位

1. 开球瞬间：双方所有球员都在本方半场，球在中圈。
2. 等待约 1 秒后发球人拿球。
3. 触发界外球、犯规、角球、任意球：
   - 所有球员瞬间落到对应站位；
   - 等待约 1 秒再发球；
   - 角球时禁区内应有攻防球员。
4. 暂停时等待计时暂停；继续后补足剩余等待时间。

控制台检查：

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm',
    oppLineup: bestLineupForClub(opp, G.players, true),
    oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true) });
  const bad = eng.allPlayers.filter(p => p.onPitch && (p.team.side === 'left' ? p.x > 52.5 : p.x < 52.5)).length;
  let steps = 0;
  while (eng.restartState && steps < 120) { eng.step(1/60); steps++; }
  return { bad, steps, owner: eng.ball.owner?.name || null };
})()
```

预期：`bad === 0`，`steps === 60`，`owner` 不为空。

### 越位/手球/头球/角球

1. 长传或直塞时观察越位判罚；界外球、球门球、角球第一脚不判越位。
2. 越位后应是间接任意球，发球人不会直接射门。
3. 禁区内射门封堵可能手球判点球；禁区外手球判任意球。
4. 高球进入禁区时双方会去落点争顶；可能出现头球攻门、门将摘球或头球解围。
5. 被封堵/扑出的射门可能形成角球；角球应有禁区内站位，并可能头球攻门。

控制台快速检查越位：

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm',
    oppLineup: bestLineupForClub(opp, G.players, true),
    oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true) });
  const from = eng.teams.left.players.find(p => !p.isGK);
  const target = eng.teams.left.players.find(p => !p.isGK && p !== from);
  from.x = 40; from.y = 34; target.x = 80; target.y = 34;
  for (const d of eng.teams.right.players) { d.x = 65; d.y = 20 + Math.random() * 28; }
  const info = eng.isOffsideAtPass(from, target);
  if (info) eng.callOffside(info);
  return { offside: !!info, restart: eng.restartState?.type, indirect: eng.restartState?.indirect, stat: eng.stats.left.offsides };
})()
```

预期：`offside === true`，`restart === 'offside'`，`indirect === true`，`stat === 1`。

## 4.3 v1.1.9 射门数量回归

用第 5 节脚本跑 10 场，检查：

- 总射门数应在 **170–210** 之间（目标约 190，每队 9–10 次）；
- 总进球应在 **20–28** 之间（目标约 25，场均 2.5；不应超过 v1.1.8 的 2.8）；
- 射正率约 45%–55%；扑救约 45–60；角球约 20–30；越位约 5–15；
- 比分应有 3-3、2-3、1-3 等大比分，也应有 0-0、1-0，不应全是 0-0 或 5-5；
- 单场不应出现卡死、负射门、`null` 统计。

手动观察一场：

- 应能看到远射、传中、禁区抢点、头球、门将扑救、封堵和角球；
- 射门被扑出/封堵后，球应继续运动，可能形成角球或二次进攻；
- 进球、扑救、角球、犯规后仍按原逻辑复位。

## 4.4 v1.2.0 重点回归

### 头球

```js
(() => { const oldG=G; const s=buildUniverse(1,{clubName:'测试',manager:'x',primary:'#b74e47',secondary:'#f2e6d0'}); const id=+Object.keys(s.clubs).find(k=>!s.clubs[k].isUser&&s.clubs[k].tier===5); s.userClubId=id;s.clubs[id].isUser=true;s.meta.onboardingDone=true;G=s;ensureGameShape();ensureUserLineupValid(); let ev=[]; const orig=MatchEngine.prototype.headBall; MatchEngine.prototype.headBall=function(mp,b){ev.push({t:this.simTime,ctx:b.headerContext});return orig.call(this,mp,b)}; const r=debugSimulateMatch(); MatchEngine.prototype.headBall=orig; const rapid=ev.filter((x,i)=>i&&x.t-ev[i-1].t<.85).length; G=oldG; return {headers:ev.length,rapid,contexts:[...new Set(ev.map(x=>x.ctx))]}; })()
```

预期所有头球的 `phase` 都是 `attack`，且都位于对方禁区、离门 22m 内；防守头球解围应为 0。头球可能来自角球、任意球、传中或禁区内高球，但不会出现在门将开球、后场解围或中场争顶中。

### 大字提示

在同一场比赛中包裹 `MatchEngine.prototype.addFlash` 记录 `big` 和 `small`，预期只出现：`进球`、`犯规`、`手球`、`越位`、`点球`、`红牌`；不应出现 `射门`、`扑救`、`头球`、`换人`、`受伤`。犯规/手球/点球事件的 `small` 必须包含犯规方球员名（格式为“球队简称 · 球员名”），不能是获得点球/任意球的一方。

### 直播页

进入比赛，切到“直播”页并向下滚动：

- 没有新解说时不应重建 DOM，也不应跳回顶部；
- 有新解说时保持当前阅读位置，只在顶部插入新内容；
- 长球员名/长句自动换行，不应出现横向滚动条。

### 射门被挡与轨迹

1. 包裹 `MatchEngine.prototype.shoot` 记录射门距离，跑 10 场，检查远射（>28m）不应再占多数。
2. 观察被封堵/扑出的射门：球应继续沿反弹方向飞行，`engine.ball.trail` 长度应大于 0，不能瞬间切换到角球。
3. 只有球实际越过底线后才出现角球；`restartCorner()` 只应在 `updateBall()` 的出界分支中调用。

### 防守压迫

跑 10–30 场，检查：

- 持球人向前推进时，最近的防守者应出现在其前方/球门侧，而不是只在身后追；
- 第二防守人（coverPlayer）应主动向持球人靠近并形成包夹；
- 抢断和犯规明显增加，射门数不应再无限增长；
- 当前基线约抢断 18.0/场、犯规 8.5/场、射门 10.2/场。

### 边线球手抛

包裹 `MatchEngine.prototype.takeThrowIn`，跑几场并触发边线球：

- 应调用 `takeThrowIn()`；
- 抛出瞬间 `ball.owner === null`、`ball.z ≈ 1.8`、`ball.passMeta.type === 'throwin'`；
- 球应沿空中弧线飞向队友/前场，`ball.trail` 随后出现轨迹，而不是从脚边直接传走。

### 角球

连续跑 5 场，统计 `restartCorner` 后 1.8 秒内是否出现 `restartThrowIn`。预期为 0 次；角球第一脚必须向禁区方向。

### 阵容定位

进入阵容页，检查表头包含“定位”，且每名球员显示“首发 / 替补席 / 未上场”之一；点击首发位置，弹窗候选人姓名后也应有同样标签。

### 潜力与替补席

- 把任意球员 `p.potential` 设为 `73.75`，调用 `ensureGameShape()`，应变为整数 `74`；阵容页、球员详情和选人弹窗都不应出现小数。
- 记录替补席 7 人，把 `bench[2]` 选到 `bench[0]` 的位置，检查两人互换、仍为 7 人且没有重复；旧存档中重复或与首发冲突的替补应在载入时被清理。

### 身价

```js
(() => { const a=makePlayer({age:34,pos:'CM',quality:70,potential:72}); const b=makePlayer({age:18,pos:'CM',quality:50,potential:80}); const c=makePlayer({age:18,pos:'CM',quality:40,potential:80}); return [calcValue(a),calcValue(b),calcValue(c)]; })()
```

预期 70 能力的身价 > 50 能力 > 40 能力。

### 年龄与新闻

把一名用户球员年龄设为 35+，调用 `progressPlayerAtSeasonEnd(p, userClub())`，检查 `G.news` 出现“老将状态下滑”，且 `p.ovr` 不高于调用前。

### 双存档友谊赛

1. 开始界面或存档面板点击“双存档友谊赛”。
2. 两个槽位分别选择两份 `.gdsave` 并输入各自密码；载入后应显示俱乐部、级别、阵型、平均能力。
3. 点击“开始全自动友谊赛”，检查：
   - 顶部显示“友谊赛 · 全自动助教模式”，没有换人/战术按钮；
   - 双方球员开场体力 100；
   - 中场自动进入下半场，不需要点击；
   - 全场结束后显示“不计入赛程 · 不增加球员能力”；
   - 点击“结束友谊赛”回到原界面，原存档的现金、赛程、球员能力、体力均未改变。

## 4.5 v1.3.0 重点回归

### 联赛难度

在控制台检查：

```js
({ diff: [1,2,3,4,5].map(TIER_DIFFICULTY_LABEL), bonus: [1,2,3,4,5].map(t => +aiTierExecutionBonus(t).toFixed(3)) })
```

预期（v1.3.11）：`TIER_DIFFICULTY_LABEL` 显示 `+10% / +8% / +6% / +4% / +2%`；`aiTierExecutionBonus` 为 `1.10 / 1.08 / 1.06 / 1.04 / 1.02`。旧版 v1.3.10 的 `×66.0 / ×26.4 / ×10.6 / ×4.3 / ×1.9` 与 `1.429 / 1.336 / 1.242 / 1.150 / 1.066` 已废弃。另请跑第 0.0 节的“乙级 70 vs 60”脚本，确认能力差能够决定比赛结果。

### 角球防守

在比赛中观察角球：

- 防守方应有 5 名球员站在禁区内，紧贴进攻球员而不是站成一排；
- 角球传中后，防守球员应能头球解围，门将应能出击摘球；
- 不应出现同一个角球连续 3 次以上、防守球员完全漏人的情况。

控制台检查防守落位：

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm', oppLineup:bestLineupForClub(opp, G.players, true) });
  eng.restartCorner(eng.teams.left, 'right', 20);
  const rows = eng.allPlayers.filter(p => p.onPitch && p.team === eng.teams.right);
  return {
    taker: eng.restartState?.taker?.name,
    defendersInBox: rows.filter(p => !p.isGK && p.x > 88.5).length,
    positions: rows.filter(p => !p.isGK && p.x > 88.5).map(p => ({ x:+p.x.toFixed(1), y:+p.y.toFixed(1) })),
  };
})()
```

预期：`defendersInBox` 为 4–5，防守球员的 x 在 96–101 之间，y 分布在禁区里，而不是停留在中圈附近。

### 越位线意识

跑 10–20 场，检查：

- 进攻球员无球跑位时不再长期站在倒数第二名防守球员身后；
- 传球很少直接送给越位队友；
- 实际越位判罚应明显减少（v1.3.2 基线约 0/场；如果仍频繁出现，检查 `offsideLineFor()` 是否正确取“球 + 倒数第二名防守球员”的联合越位线）。

控制台检查：

```js
(() => {
  const out = { calls: 0, offsides: 0 };
  const orig = MatchEngine.prototype.isOffsideAtPass;
  MatchEngine.prototype.isOffsideAtPass = function(f, t) {
    const r = orig.call(this, f, t);
    if (r) out.calls++;
    return r;
  };
  for (let i = 0; i < 10; i++) {
    const r = debugSimulateMatch();
    out.offsides += r.stats.left.offsides + r.stats.right.offsides;
  }
  MatchEngine.prototype.isOffsideAtPass = orig;
  return out;
})()
```

预期：`calls` 可能仍有若干次（传球前会检查并避开），`offsides` 接近 0。

### 任意球人墙

进入一场比赛或构造 `MatchEngine`，在离门约 20m 的中路制造一次犯规：

```js
(() => {
  const c = userClub(), f = nextUserFixture(), opp = clubById(fixtureOpponent(f, c.id));
  const eng = new MatchEngine({ fixture:f, userClub:c, oppClub:opp, weather:WEATHERS[0], teamTalk:'calm', oppLineup:bestLineupForClub(opp, G.players, true) });
  const attacker = eng.teams.left.players.find(p => !p.isGK);
  const defender = eng.teams.right.players.find(p => !p.isGK);
  eng.foul(defender, attacker, { spotX: 85, spotY: 34 });
  const r = eng.restartState;
  return {
    type: r?.type,
    wall: r?.wallPlayers?.length,
    wait: r?.wait,
    comment: eng.commentary[0]?.text,
    gkY: +eng.gk.right.y.toFixed(1),
  };
})()
```

预期：`type === 'freekick'`，`wall >= 3`，`wait === 1.35`，解说包含“排出人墙”，门将站在远角（约 32 或 36）。随后 `engine.updateRestart(2,false)` 会让 `ball.freeKick === true`；主罚者第一次触球后该标记清除。低平球打近角应可能被人墙封堵，高弧线球应从人墙上空飞向远角。

## 4.6 v1.3.6 iPadOS 存档导入适配

### 文件输入

在 iPadOS 26 Safari 中打开成品：

1. 进入“存档与设置” → “导入存档”。
2. 文件选择器应显示所有文件，`.gdsave` 不再是灰色不可选。
3. 选择 `.gdsave` 后应出现密码框；输入密码可正常导入。
4. 选择一个 `.txt`/图片等错误文件，应直接提示“不是有效的存档”，不出现密码框。
5. 双存档友谊赛的两个“选择 .gdsave”按钮同样应能选中 `.gdsave`。

控制台检查：

```js
(() => {
  const save = document.querySelector('#hidden-save-file');
  const friendly = document.querySelector('#hidden-friendly-save');
  return {
    saveAccept: save.getAttribute('accept'),
    friendlyAccept: friendly.getAttribute('accept'),
    saveDisplay: getComputedStyle(save).display,
    saveClass: save.className,
    saveSize: [save.offsetWidth, save.offsetHeight],
    ipad: isIPadOS(),
  };
})()
```

预期：`saveAccept === null`、`friendlyAccept === null`、`saveDisplay === 'block'`、`saveClass` 包含 `file-input-hidden`、尺寸约 `1×1`。

### 导出

1. 在 iPadOS 上导出 `.gdsave`，检查 Safari 下载到“文件”App，而不是只在新标签页里显示 JSON。
2. 将导出的文件重新导入，密码和进度应完整恢复。
3. 如果 Safari 提示不支持 WebCrypto，确认使用的是最新 Safari，且页面不是被“快速查看”预览打开。

### 触屏/布局

- 旋转 iPad（横屏/竖屏）后，主页面和弹窗不应出现横向溢出；
- 输入框聚焦时不应导致页面异常缩放；
- 比赛全屏页、弹窗底部按钮应仍在视口内。

## 5. 比赛引擎批量模拟（推荐每次改引擎后跑）

> 这会删除当前测试浏览器的本地自动存档，并在最后恢复原存档（如果存在）。请只在测试用浏览器/配置文件中运行。
> 模拟不写赛程、不消耗真实比赛，只测试 `MatchEngine`。

```js
(async () => {
  const backup = localStorage.getItem(SAVE_KEY);
  localStorage.removeItem(SAVE_KEY);
  G = null; SETUP = null;

  initNewSetup();
  SETUP.seed = 246813579;
  SETUP.world = buildUniverse(SETUP.seed, {
    clubName: '青岚竞技', manager: '测试', city: '青岚',
    stadium: '青岚体育场', primary: '#b74e47',
    secondary: '#f2e6d0', kitPattern: 'sash',
  });
  SETUP.stage = 'recruit';
  SETUP.selected = [];
  autoRecommendRecruits();
  finishOnboarding();

  const rows = [];
  const total = {
    left: { passes: 0, ok: 0, tackles: 0, dribbles: 0, interceptions: 0, shots: 0, goals: 0, onTarget: 0, saves: 0, corners: 0, offsides: 0 },
    right: { passes: 0, ok: 0, tackles: 0, dribbles: 0, interceptions: 0, shots: 0, goals: 0, onTarget: 0, saves: 0, corners: 0, offsides: 0 },
  };

  for (let i = 0; i < 10; i++) {
    const r = debugSimulateMatch();
    rows.push({
      score: r.score,
      shots: [r.stats.left.shots, r.stats.right.shots],
      onTarget: [r.stats.left.onTarget, r.stats.right.onTarget],
      saves: [r.stats.left.saves, r.stats.right.saves],
      corners: [r.stats.left.corners, r.stats.right.corners],
      offsides: [r.stats.left.offsides || 0, r.stats.right.offsides || 0],
      left: [r.stats.left.passes, r.stats.left.passesOk, r.stats.left.tackles, r.stats.left.dribbles],
      right: [r.stats.right.passes, r.stats.right.passesOk, r.stats.right.tackles, r.stats.right.dribbles],
    });
    for (const side of ['left', 'right']) {
      total[side].passes += r.stats[side].passes;
      total[side].ok += r.stats[side].passesOk;
      total[side].tackles += r.stats[side].tackles;
      total[side].dribbles += r.stats[side].dribbles;
      total[side].interceptions += r.stats[side].interceptions;
      total[side].shots += r.stats[side].shots;
      total[side].goals += side === 'left' ? r.score[0] : r.score[1];
      total[side].onTarget += r.stats[side].onTarget;
      total[side].saves += r.stats[side].saves;
      total[side].corners += r.stats[side].corners;
      total[side].offsides += r.stats[side].offsides || 0;
    }
  }

  console.table(rows);
  console.log('totals', total);
  console.log('left pass %', Math.round(total.left.ok / Math.max(1, total.left.passes) * 100));
  console.log('right pass %', Math.round(total.right.ok / Math.max(1, total.right.passes) * 100));

  localStorage.removeItem(SAVE_KEY);
  if (backup) localStorage.setItem(SAVE_KEY, backup);
})();
```

验收基线（v1.3.5 沿用 v1.3.3 第五级比赛引擎基线；v1.3.5 只调难度系数和新增测试工具，未改比赛引擎，种子 246813579，30 场同步模拟）：角球约 **1.07/场**、防守头球解围 **1.30/场**、进攻头球 **0.73/场**、进球约 **1.73/场**；间隔小于 3 分钟的连续同队角球只剩 **1 组**，没有 3 连角球。v1.3.2 基线：实际越位判罚约 0/场（v1.3.1 为 4.05/场），越位候选检查约 9.5/场但会被传球选择避开；射门 10.85/场、进球 2.05/场、犯规 1.95/场。v1.3.1 基线：射门 9.8/场、进球 1.83/场、射正 4.53/场、扑救 3.00/场、角球 2.20/场、传球成功率 70%、犯规 1.60/场、黄红牌 0.40/场、手球 0.10/场、直接任意球射门 0.10/场、人墙任意球 0.23/场。20m 任意球会排 4 人墙，30m 排 3 人墙；低平球打近角会被人墙挡出，高弧线球可越过人墙打远角。v1.3.5 联赛强度显示 ×66.0 / ×26.4 / ×10.6 / ×4.3 / ×1.9；v1.3.5 单场 `debugSimulateMatch()` 烟测通过（0:1）。v1.3.10 复测（同种子 246813579、30 场）：进球 **1.80/场**、射门 **10.03/场**、射正 **5.50/场**、扑救 **3.87/场**、角球 **1.33/场**、犯规 **1.43/场**、传球成功率 **75.7%**；v1.3.10 未改比赛引擎，差异来自自动排阵选出的首发更强以及随机序列变化。v1.3.11 复测（同种子 246813579、30 场，自动推荐初始阵容，首发 XI 平均 33.9）：进球 **2.17/场**、射门 **10.03/场**、射正 **5.50/场**、扑救 **3.50/场**、角球 **1.60/场**、犯规 **1.87/场**、越位 **0.03/场**、xG **2.82/场**、传球成功率 **76.9%**（用户 1.17 球 / 对手 1.00 球，用户射门 5.83 / 对手 4.20）；比赛引擎未改动，变化来自城市联赛 AI 执行力由 +6.6% 降为 +2% 以及随机序列。

历史基线（v1.2.0 实测，种子 20261028，第五级，30 场同步模拟）：射门约 **10.2/场**、进球约 **2.0/场**、射正 **4.9/场**、扑救 **3.1/场**、角球 **2.2/场**、头球 **1.8/场**（防守头球解围 **0/场**）、传球成功率约 **68.3%**、成功过人约 **8.0/场**、抢断 **18.0/场**、犯规 **8.5/场**、场均射门距离 **22.1m**、远射（>28m）**2.2/场**、边线球手抛 **1.1/场**。角球 1.8 秒内转界外球 0 次；大字只出现进球/犯规/手球/越位/点球/红牌。

历史基线（v1.1.9 实测，种子 246813579，第五级）：

- 玩家队首发平均约 34.5，对手首发平均约 39.6；
- 10 场合计：射门 **192**（场均 19.2，每队 9.6）；进球 **25**（场均 2.5）；
- 射正 **96**（50%）；扑救 **55**；封堵 17；角球 **27**；越位 **11**；
- 传球成功率约 70%；场均传球约 97 次/队；
- 训练正常日净体力约 -6（消耗约 11，恢复约 5）；
- 比赛和训练都会出现小概率属性 +1；
- 10 场比分包含 3-3、2-3、1-3、0-0、1-0 等，比赛明显更热闹；
- 无异常 `null` 比分、无卡死、无控制台报错。

注意：比分在 `r.score`，不在 `r.stats.*.score`；若修改统计结构，同步更新脚本。发球/死球/越位/手球/头球/防守/射门逻辑改动后，除批量模拟外还要手动观察球门球、界外球、角球、任意球、暂停恢复、单刀、头球和角球。

## 6. 手动业务烟测

至少完成一个完整周：

1. 训练页：选择“综合训练 / 标准”，推进一天；检查报告、体力变化、总天数、具体属性成长。
2. 球员详情：检查 10 项 1–100 数值（射门/力量/速度/运球/传球/防守/守门/耐力/身体素质/士气）。
3. 财政页：签一份赞助、查看周预算、检查账本。
4. 转会页：打开一个自由球员，尝试谈判/签约；检查现金、工资、阵容人数。
5. 比赛页：进入赛前部署，开始一场实时比赛；检查：
   - 暂停/继续；
   - 换人；
   - 改阵型/战术；
   - 比赛统计中的控球、传球、抢断、过人、越位、角球；
   - 死球时所有人瞬间复位，等待约 1 秒后发球；
   - 中场开球双方在本方半场；
   - 越位判间接任意球；
   - 前场任意球：对方排 2–4 人墙、门将站远角；主罚者会直接射门，低平球可能被人墙挡出，高弧线球绕过人墙；
   - 手球、犯规和点球；
   - 高空球争顶、头球攻门、角球；
   - 高速球弹开，不再吸附；
   - 中场训话按钮高亮/禁用，切换阵型时名字不跳；
   - 终场结算、积分榜更新。
6. 冒险跳过：
   - 赛前部署确认“冒险跳过”，检查结果面板、比赛日推进、额外体能与伤情新闻；
   - 比赛中暂停/中场休息确认“冒险跳过”，检查剩余比赛结算和全场面板。
7. 存档：
   - 导出 `.gdsave`，设置密码；
   - 新建/清除当前存档，再导入；
   - 检查俱乐部、球员、赛程、转会状态、RNG 状态是否恢复；
   - 错误密码应被拒绝，不能覆盖当前存档。

## 7. 已知回归高风险区

修改以下函数后，必须重跑第 5 节：

- `aiTierExecutionBonus` / `TIERS[tier].difficulty`（必须同时重跑第 0.0 节“70 vs 60”专项回归；AI 加成调到两位数百分比会让高能力球队反而踢不过弱队）
- `MatchEngine.offBallTarget`
- `MatchEngine.carrierDecision`
- `MatchEngine.bestPassOption`
- `MatchEngine.updateBall`
- `MatchEngine.handleTackles`
- `MatchEngine.updateTeamStructure`
- `MatchEngine.beginRestart` / `updateRestart` / `takeRestart` / `setKickoff` / `prepareKickoffWalk`
- `MatchEngine.oneOnOneInfo` / `carrierDecision` 的单刀/禁区射门/传中分支 / `shoot`
- `MatchEngine.bestSetPieceTaker` / `freeKickLayout` / 任意球人墙与 `ball.freeKick` 生命周期
- `MatchEngine.bestPassOption` 的禁区内目标与传中评分
- `MatchEngine.assignMarks` / `offBallTarget` 防守分支 / `handleTackles` / 传球拦截分支
- `MatchEngine.isOffsideAtPass` / `callOffside` / `beginRestart` / `updateRestart` / `takeRestart`
- `MatchEngine.headerContest` / `headBall` / `ballFlightTime` / 高速球弹跳分支
- `applyTrainingSession` / `TRAINING_FATIGUE_MULT` / `maybeMatchAbilityGain`
- `makeAttrsFor` / `ensureGameShape` 的 `sta`/`phy` 补齐
- `rollYouthProspect` / `buildYouthProspect` / `youthHiddenChance` 的隐藏标记与概率传递
- `rollStreetCandidate` / `testStreetTenPull` / `testStreetProbability` 的隐藏判定、`hiddenSeen` 与 `testStreet` 清理
- `recordDrawHistory` / `openDrawHistory` 的 20 条上限、快照字段和隐藏姓名摘要
- `simulateAIFixture` / 赛季结算

修改以下内容后，必须重跑第 4 节和窄屏检查：

- `openLineupSlotModal` / `openBenchSlotModal` / `choiceRow`
- `.lineup-choice` CSS
- 模态框结构
- `setPrematchTalk`
- `renderHalfTimeOverlay` / `setMatchTeamTalk`
- `updateMatchScoreboard` 的大字提示部分
- `makeKit` / `ensureGameShape` 的球衣迁移
- `openRiskSkipConfirm` / `runRiskSkip` / `runMatchRiskSkip`
- `.toast-wrap` / `#toast-root` CSS
- `openSaveMenu` / `applySettingsCode` / `resetSaveConfirm` / `confirmResetSave` / 测试工具函数
- `#hidden-file` / `#hidden-save-file` / `#hidden-friendly-save` 的 `.file-input-hidden`、accept 与导入校验
- `setupRecruit` / `recruitSummaryState` / `recruitSummaryHtml` / `toggleRecruit`

修改存档结构后：

- 更新 `SAVE_VERSION`（当前为 1）；
- 在 `ensureGameShape` 中补迁移；
- 测试旧 `.gdsave` 导入；
- 更新文档。
