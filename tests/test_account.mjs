import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readFile } from 'node:fs/promises';
const window = new Window({ url: 'https://finfolk.test/?view=account&tab=settings&messaging=connected' });
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
    instagram: 'https://www.instagram.com/alice.dives/',
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
assert.equal(document.getElementById('account-settings').hidden, false, 'OAuth return opens Settings');
assert.equal(document.getElementById('account-tab-settings').getAttribute('aria-selected'), 'true');
assert.ok(
  document
    .getElementById('account-page')
    .textContent.includes('Closed pauses discovery'),
);
assert.ok(document.querySelector('[aria-label="Social menu"]')?.textContent.includes('Your buddies'));
assert.ok(document.querySelector('[aria-label="Social menu"]')?.textContent.includes('Check in at a beach'));
assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Link Instagram'));
document.getElementById('account-tab-instagram').click();
assert.equal(document.getElementById('account-instagram').hidden,false);
assert.ok(document.getElementById('account-instagram').textContent.includes('Link Instagram'));
document.getElementById('account-tab-profile').click();
assert.equal(document.querySelector('#account-profile [name=instagram]'),null,'Instagram is managed in its own tab');
assert.equal(document.querySelector('[name=open]').checked, false);
document.querySelector('[name=open]').checked = true;
document.querySelector('[name=visits]').checked = true;
document.getElementById('account-tab-profile').click();
const form = document.querySelector('#account-profile form');
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
[...document.querySelectorAll('#account-profile button')].find(b=>b.textContent==='Manage Instagram').click();
assert.equal(document.getElementById('account-instagram').hidden,false);
document.getElementById('account-tab-settings').click();
assert.equal(document.getElementById('account-settings').hidden, false);
assert.equal(document.getElementById('account-profile').hidden, true);
assert.equal(document.querySelector('[name=theme]'),null,'Appearance belongs to global Settings');
assert.ok(document.getElementById('account-settings').textContent.includes('Open Settings'));
document.getElementById('account-tab-checkin').click();
assert.equal(document.getElementById('account-checkin').hidden, false);
const beach = document.querySelector('#account-checkin select');
beach.value = 'bondi';
document.querySelector('#account-checkin form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 30));
assert.equal(calls.find(c => c.action === 'checkin').beachId, 'bondi');
assert.ok(document.querySelector('.checkin-success').textContent.includes('Bondi Beach'));
document.querySelector('.member-tour')?.dispatchEvent(new window.Event('cancel', {cancelable:true}));
window.happyDOM.abort();
console.log(
  'Account UI passed: Closed default, beach selection, field-level sharing, save and existing session entry point.',
);
