const test = require('node:test');
const assert = require('node:assert/strict');

test('mistakes filter by subject and type', () => {
  const bank = [
    { id: 'q1', subject: 'math', type: 'tossup', text: 'Math TU' },
    { id: 'q2', subject: 'math', type: 'bonus', text: 'Math Bonus' },
    { id: 'q3', subject: 'phys', type: 'tossup', text: 'Physics TU' },
    { id: 'q4', subject: 'bio', type: 'bonus', text: 'Bio Bonus' },
  ];
  const qById = id => bank.find(q => q.id === id);

  const mistakes = [
    { t: 1000, m: 'bank', q: 'q1' },
    { t: 1001, m: 'bank', q: 'q2' },
    { t: 1002, m: 'bank', q: 'q3' },
    { t: 1003, m: 'bank', q: 'q4' },
    { t: 1004, m: 'dict', target: {} }, // generated dictation is Math tossup
    { t: 1005, m: 'calc', target: {} }, // generated calc is Math tossup
  ];

  function getMistakeSubject(m) {
    if (m.m === 'bank') {
      const q = qById(m.q);
      return q ? (q.subject || 'math') : 'math';
    }
    return 'math';
  }

  function getMistakeType(m) {
    if (m.m === 'bank') {
      const q = qById(m.q);
      return q ? (q.type || 'tossup') : 'tossup';
    }
    return 'tossup';
  }

  function filterMistakes(list, f) {
    return list.filter(m => {
      if (f.subject !== 'all' && getMistakeSubject(m) !== f.subject) return false;
      if (f.type !== 'all' && getMistakeType(m) !== f.type) return false;
      return true;
    });
  }

  // All
  assert.equal(filterMistakes(mistakes, { subject: 'all', type: 'all' }).length, 6);

  // Filter by subject
  const mathOnly = filterMistakes(mistakes, { subject: 'math', type: 'all' });
  assert.equal(mathOnly.length, 4); // q1, q2, dict, calc

  const physOnly = filterMistakes(mistakes, { subject: 'phys', type: 'all' });
  assert.equal(physOnly.length, 1);
  assert.equal(physOnly[0].q, 'q3');

  const bioOnly = filterMistakes(mistakes, { subject: 'bio', type: 'all' });
  assert.equal(bioOnly.length, 1);
  assert.equal(bioOnly[0].q, 'q4');

  // Filter by type
  const tossupOnly = filterMistakes(mistakes, { subject: 'all', type: 'tossup' });
  assert.equal(tossupOnly.length, 4); // q1, q3, dict, calc

  const bonusOnly = filterMistakes(mistakes, { subject: 'all', type: 'bonus' });
  assert.equal(bonusOnly.length, 2); // q2, q4

  // Filter by both subject and type
  const mathBonus = filterMistakes(mistakes, { subject: 'math', type: 'bonus' });
  assert.equal(mathBonus.length, 1);
  assert.equal(mathBonus[0].q, 'q2');

  const physBonus = filterMistakes(mistakes, { subject: 'phys', type: 'bonus' });
  assert.equal(physBonus.length, 0);
});

test('bank manual add to mistakes', () => {
  const mistakes = [];
  const q = { id: 'math-123', subject: 'math', type: 'tossup', tags: ['cat_square'] };

  // Add question
  const exists = mistakes.some(m => m.q === q.id);
  assert.equal(exists, false);

  mistakes.unshift({
    t: Date.now(),
    m: 'bank',
    q: q.id,
    c: (q.tags || [])[0] || null,
    got: '—',
    manual: true
  });

  assert.equal(mistakes.length, 1);
  assert.equal(mistakes[0].q, 'math-123');
  assert.equal(mistakes[0].manual, true);

  // Toggle off
  const idx = mistakes.findIndex(m => m.q === q.id);
  assert.ok(idx >= 0);
  mistakes.splice(idx, 1);
  assert.equal(mistakes.length, 0);
});

test('timer duration determination for tossup vs bonus', () => {
  const settings = { buzz: 5, bonus: 20 };

  function getSecs(type) {
    return type === 'bonus' ? settings.bonus : settings.buzz;
  }

  assert.equal(getSecs('tossup'), 5);
  assert.equal(getSecs('bonus'), 20);
});
