const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../services/startLocation.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject, require: () => ({ Accuracy: { High: 4 } }), Date, setTimeout, clearTimeout });
const { getStartLocation, usableStartLocation } = exportsObject;
const gps = (age = 0, accuracy = 10) => ({ timestamp: Date.now() - age, coords: { latitude: 26, longitude: 91, accuracy } });
test('recent accurate GPS avoids waiting for a new fix', async () => {
  const cached = gps(); let fresh = 0;
  assert.equal(await getStartLocation({ getLastKnownPositionAsync: async () => cached, getCurrentPositionAsync: async () => { fresh++; return gps(); } }), cached);
  assert.equal(fresh, 0);
});
test('stale, inaccurate and missing cached GPS request a fresh fix', async () => {
  for (const cached of [gps(16000), gps(0, 80), null]) {
    let fresh = 0;
    const result = await getStartLocation({ getLastKnownPositionAsync: async () => cached, getCurrentPositionAsync: async () => { fresh++; return gps(); } });
    assert.equal(fresh, 1); assert.equal(usableStartLocation(result), true);
  }
});
test('cached GPS read failure falls back to fresh GPS', async () => {
  const result = await getStartLocation({ getLastKnownPositionAsync: async () => { throw Error('No cache'); }, getCurrentPositionAsync: async () => gps() });
  assert.equal(usableStartLocation(result), true);
});
test('weak fresh GPS, future timestamp and invalid coordinates cannot start', async () => {
  await assert.rejects(getStartLocation({ getLastKnownPositionAsync: async () => null, getCurrentPositionAsync: async () => gps(0, 100) }));
  assert.equal(usableStartLocation(gps(-10000)), false);
  assert.equal(usableStartLocation({ ...gps(), coords: { latitude: NaN, longitude: 91, accuracy: 10 } }), false);
});
test('GPS wait is bounded and does not produce a late start', async () => {
  await assert.rejects(getStartLocation({ getLastKnownPositionAsync: async () => null, getCurrentPositionAsync: () => new Promise(() => {}) }, 10), /Location unavailable/);
});
