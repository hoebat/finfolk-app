import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readFile } from 'node:fs/promises';
const window = new Window({ url: 'https://finfolk.test/?view=account' });
window.document.write(
  await readFile(new URL('../web/index.html', import.meta.url), 'utf8'),
);
for (const key of [
  'window',
  'document',
  'location',
  'localStorage',
  'navigator',
])
  Object.defineProperty(globalThis, key, {
    value: window[key],
    configurable: true,
  });
const { installCommunity } = await import('../web/community.js');
const profile = {
    displayName: 'Alice',
    bio: 'Hello',
    open: false,
    beaches: ['bondi'],
    sharing: {},
    activities: [],
    availability: [],
  },
  calls = [];
const client = {
  user: { uid: 'alice', emailVerified: true },
  call: async (action, data) => {
    calls.push({ action, ...data });
    if (action === 'me') return { profile };
    if (action === 'preferences') return { profile: data.profile };
    return [];
  },
};
const shell = { route: { view: 'account' }, subscribe() {}, navigate() {} };
installCommunity({
  shell,
  getBeaches: () => [
    { id: 'bondi', name: 'Bondi Beach', area_name: 'Eastern Beaches' },
  ],
  loadConfig: async () => ({ enabled: true, authUrl: 'https://auth.test' }),
  loadClient: async () => ({ createLogbookClient: async () => client }),
});
await new Promise((r) => setTimeout(r, 30));
assert.ok(
  document
    .getElementById('account-page')
    .textContent.includes('Closed pauses discovery'),
);
assert.ok(document.querySelector('[aria-label="Social menu"]')?.textContent.includes('Your buddies'));
assert.ok(document.querySelector('[aria-label="Social menu"]')?.textContent.includes('Check in at a beach'));
assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Instagram & actions'));
document.querySelector('[name=instagram]').value = '@alice.dives';
assert.equal(document.querySelector('[name=open]').checked, false);
document.querySelector('[name=open]').checked = true;
document.querySelector('[name=visits]').checked = true;
const form = document.querySelector('#account-page form');
form.dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true }),
);
await new Promise((r) => setTimeout(r, 20));
const saved = calls.find((c) => c.action === 'preferences');
assert.equal(saved.profile.instagram, 'https://www.instagram.com/alice.dives/');
assert.ok([...document.querySelectorAll('a')].some(a => a.textContent === 'Your Instagram profile ↗' && a.href === saved.profile.instagram));

assert.equal(saved.profile.open, true);
assert.equal(saved.profile.sharing.visits, true);
assert.equal(saved.profile.sharing.depth, false);
assert.deepEqual(saved.profile.beaches, ['bondi']);
assert.ok(
  document.getElementById('account-page').textContent.includes('Saved.'),
);
document.querySelector('.member-tour')?.dispatchEvent(new window.Event('cancel', {cancelable:true}));
window.happyDOM.abort();
console.log(
  'Account UI passed: Closed default, beach selection, field-level sharing, save and existing session entry point.',
);
