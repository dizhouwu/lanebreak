const { Match } = require('../src/match.js');
const { HEROES } = require('../src/rules.json');

const ids = Object.keys(HEROES);
const maxSeconds = 40 * 60;
const rounds = 4;
function simulate(heroes, bots, seed) {
  const match = new Match({ heroes, bots, seed });
  match.step(1 / 60, maxSeconds * 60);
  return match.snapshot(0);
}

const wins = Object.fromEntries(ids.map(id => [id, 0]));
const times = [];
for (const left of ids) for (const right of ids) {
  for (let round = 0; round < rounds; round++) {
    const match = simulate([left, right], ['normal', 'normal'], 101 + round);
    if (match.winner == null) continue;
    times.push(match.time);
    wins[[left, right][match.winner]]++;
  }
}
times.sort((a, b) => a - b);
const median = times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : 0;
console.log({ format: 'Normal vs Normal', finished: times.length, matches: ids.length ** 2 * rounds, medianMinutes: +(median / 60).toFixed(2), wins });
for (const difficulty of ['easy', 'normal']) {
  const result = { hardWins: 0, opponentWins: 0, timeout: 0 };
  for (const hero of ids) for (let round = 0; round < 3; round++) {
    const match = simulate([hero, hero], ['hard', difficulty], 401 + round);
    result[match.winner == null ? 'timeout' : match.winner === 0 ? 'hardWins' : 'opponentWins']++;
  }
  console.log({ format: 'Hard vs ' + difficulty, ...result });
}
