// Checks the System's thinking on made-up players, with no browser or network.
import assert from 'node:assert/strict';
await import('../public/mind.js');
const Mind = globalThis.Mind;

const TODAY = '2026-11-02';
const back = n => new Date(Date.UTC(2026, 10, 2 - n)).toISOString().slice(0, 10);
const stats = () => [
  { id: 's1', name: 'Strength', abbr: 'STR', xp: 400 },
  { id: 's2', name: 'Calm', abbr: 'CLM', xp: 40 }
];
const quest = (id, extra = {}) => ({ id, title: `Quest ${id}`, statId: 's1', rank: 'E', kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6], required: true, active: true, createdOn: '2026-01-01', proof: { type: 'timer', minutes: 20 }, ...extra });
const player = (quests = [quest('a')], extra = {}) => ({ name: 'Secret Name', stats: stats(), quests, streak: 0, penalty: null, ...extra });
// Finishes the quest on the given share of the last 14 days.
const logWith = (id, doneDays) => {
  const days = {};
  for (let i = 1; i <= doneDays; i++) days[back(i)] = { c: { [id]: { t: 'x', s: 's1', st: 'filed' } } };
  return d => days[d] || null;
};
const library = { plans: [{ re: /sleep/i, area: 'CLM', quests: [{ title: 'Screens off before bed', rank: 'D', proof: { type: 'timer', minutes: 20 } }] }], starters: { STR: [{ title: 'Complete a logged workout', rank: 'D', proof: { type: 'workout' } }] } };
const profile = { goals: [], obstacles: '', minutes: 60 };
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

check('a brand-new player is steady and still gets Orders', () => {
  const a = Mind.analyze(player([]), () => null, TODAY);
  assert.equal(a.rate, null);
  assert.equal(Mind.chooseMode(a), 'steady');
  assert.ok(Mind.pickOrders(a, 'steady', profile, [], library).length >= 1);
});
check('modes follow the 40% and 90% thresholds', () => {
  const mode = done => Mind.chooseMode(Mind.analyze(player(), logWith('a', done), TODAY));
  assert.equal(mode(5), 'recover'); // 36%
  assert.equal(mode(6), 'steady'); // 43%
  assert.equal(mode(12), 'steady'); // 86%
  assert.equal(mode(13), 'push'); // 93%
});
check('a penalty always means recover', () => {
  assert.equal(Mind.chooseMode(Mind.analyze(player([quest('a')], { penalty: { missed: 1 } }), logWith('a', 14), TODAY)), 'recover');
});
check('recover asks for one easy quest, push asks for two harder ones', () => {
  const a = Mind.analyze(player(), () => null, TODAY);
  const easy = Mind.pickOrders(a, 'recover', profile, [], library);
  assert.equal(easy.length, 1);
  assert.equal(easy[0].rank, 'E');
  const hard = Mind.pickOrders(a, 'push', profile, [], library);
  assert.equal(hard.length, 2);
  assert.ok(hard.every(q => ['D', 'C'].includes(q.rank)));
});
check('Orders never use workout proof, which could not complete', () => {
  for (const mode of ['recover', 'steady', 'push']) for (let i = 0; i < 30; i++) {
    const a = Mind.analyze(player(), () => null, back(i));
    assert.ok(Mind.pickOrders(a, mode, profile, [], library).every(q => q.proof.type !== 'workout'));
  }
});
check('nothing repeats within 7 days, even across a week of Orders', () => {
  const recent = [];
  for (let i = 7; i >= 1; i--) {
    const day = back(i);
    const picks = Mind.pickOrders(Mind.analyze(player(), () => null, day), 'steady', profile, recent, library);
    for (const q of picks) {
      assert.ok(!recent.some(r => r.t === q.title && r.on > back(i + 7)), `${q.title} repeated on ${day}`);
      recent.push({ t: q.title, on: day });
    }
  }
  assert.ok(recent.length >= 7);
});
check('an old quest can come back after 7 days', () => {
  const a = Mind.analyze(player(), () => null, TODAY);
  const first = Mind.pickOrders(a, 'recover', profile, [], library)[0];
  const again = Mind.pickOrders(a, 'recover', profile, [{ t: first.title, on: back(7) }], library)[0];
  assert.equal(again.title, first.title);
});
check('Orders stay inside the available minutes', () => {
  for (const minutes of [10, 15, 20, 30, 45]) for (let i = 0; i < 20; i++) {
    const a = Mind.analyze(player(), () => null, back(i));
    const picks = Mind.pickOrders(a, 'push', { ...profile, minutes }, [], library);
    assert.ok(picks.reduce((sum, q) => sum + Mind.costOf(q), 0) <= minutes, `${minutes} minutes exceeded`);
  }
});
check('a custom life area works', () => {
  const S = player([], { stats: [{ id: 'f', name: 'Faith', abbr: 'FAI', xp: 0 }] });
  const picks = Mind.pickOrders(Mind.analyze(S, () => null, TODAY), 'steady', profile, [], library);
  assert.ok(picks.length >= 1);
  assert.ok(picks.every(q => q.title.includes('Faith') && q.area.id === 'f'));
});
check('the most neglected area comes first', () => {
  const log = d => (d === back(1) ? { c: { x: { t: 'x', s: 's1', st: 'filed' } } } : null);
  const a = Mind.analyze(player([]), log, TODAY);
  assert.equal(Mind.pickOrders(a, 'steady', profile, [], library)[0].area.name, 'Calm');
});
check('goals steer which quest an area gets', () => {
  const log = d => (d === back(1) ? { c: { x: { t: 'x', s: 's1', st: 'filed' } } } : null);
  const a = Mind.analyze(player([]), log, TODAY);
  const picks = Mind.pickOrders(a, 'steady', { ...profile, goals: ['fix my sleep'] }, [], library);
  assert.equal(picks[0].title, 'Screens off before bed');
});
check('adjustments propose bigger at 90%, smaller below 40%, and nothing between', () => {
  const at = done => Mind.proposeAdjustment(Mind.analyze(player(), logWith('a', done), TODAY), player().quests);
  assert.equal(at(13).change.proof.minutes, 25);
  assert.equal(at(5).change.proof.minutes, 15);
  assert.equal(at(9), null);
});
check('a quest with no number can only be offered as optional', () => {
  const q = quest('a', { proof: { type: 'photo' } });
  const run = done => Mind.proposeAdjustment(Mind.analyze(player([q]), logWith('a', done), TODAY), [q]);
  assert.deepEqual(run(2).change, { required: false });
  assert.equal(run(14), null);
});
check('a refused adjustment stays quiet for 14 days', () => {
  const a = Mind.analyze(player(), logWith('a', 14), TODAY);
  assert.equal(Mind.proposeAdjustment(a, player().quests, { a: back(13) }), null);
  assert.ok(Mind.proposeAdjustment(a, player().quests, { a: back(14) }));
});
check('rest days do not count against a quest', () => {
  const log = d => ({ rest: true, c: {} });
  const a = Mind.analyze(player(), log, TODAY);
  assert.equal(a.rate, null);
  assert.equal(Mind.chooseMode(a), 'steady');
});
check('the week review names the strong and neglected areas', () => {
  const lines = Mind.weekReview(player(), logWith('a', 7), TODAY).join(' ');
  assert.match(lines, /100%/);
  assert.match(lines, /Strongest area: Strength/);
  assert.match(lines, /Most neglected: Calm/);
  assert.equal(Mind.weekReview(player([]), () => null, TODAY), null);
});
check('the AI brief holds only the listed fields', () => {
  const log = d => ({ c: { a: { t: 'Quest a', s: 's1', st: 'filed', proof: { text: 'PRIVATE WRITEUP', note: 'PRIVATE NOTE' } } }, v: { weight: 77 } });
  const S = player([quest('a')], { email: 'me@example.com', hashes: ['abc'] });
  const a = Mind.analyze(S, log, TODAY);
  const brief = Mind.aiBrief(S, a, 'steady', { goals: ['get fit'], obstacles: 'no time', minutes: 30 });
  assert.deepEqual(Object.keys(brief).sort(), ['areas', 'completion', 'goals', 'minutes', 'mode', 'obstacles', 'perQuest', 'quests']);
  const sent = Mind.aiPrompt(brief, TODAY, []);
  for (const secret of ['Secret Name', 'me@example.com', 'PRIVATE', '77', 'abc']) assert.ok(!sent.includes(secret), `${secret} leaked`);
});
check('AI quests are cleaned: unsafe, repeated and oversized ones cannot get through', () => {
  const S = player();
  const out = Mind.cleanAi([
    { title: 'Try a 3 day water fast', rank: 'E', proof: { type: 'text' } },
    { title: 'Put your savings into crypto', rank: 'E', proof: { type: 'text' } },
    { title: 'Quest a', rank: 'E', proof: { type: 'text' } },
    { title: 'Meditate for hours', rank: 'S', area: 'calm', proof: { type: 'timer', minutes: 500 } },
    { title: 'Log a workout somehow', rank: 'nonsense', proof: { type: 'workout' } },
    null
  ], S, 'steady', { minutes: 30 }, ['Quest a']);
  assert.deepEqual(out.map(q => q.title), ['Meditate for hours', 'Log a workout somehow']);
  assert.equal(out[0].rank, 'D');
  assert.equal(out[0].statId, 's2');
  assert.equal(out[0].proof.minutes, 30);
  assert.equal(out[1].rank, 'E');
  assert.equal(out[1].proof.type, 'text');
  assert.deepEqual(Mind.cleanAi('not a list', S, 'steady', profile), []);
});
console.log(`\n${passed} checks passed`);
