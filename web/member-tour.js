const VERSION = '1';
const seen = new Set();
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const action = (text, fn, cls = 'secondary') => { const b = node('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
export function showMemberTour({ userId, shell, force = false } = {}) {
  if (!userId || document.querySelector('.member-tour')) return;
  const key = `finfolk:member-tour:${VERSION}:${userId}`;
  if (!force) { try { if (localStorage.getItem(key)) return; } catch {} if (seen.has(key)) return; }
  const intro = document.querySelector('.welcome-dialog');
  if (intro) { intro.close(); intro.remove(); }
  try { localStorage.setItem('finfolk:welcome', '1'); } catch {}
  const previous = document.activeElement, dialog = node('dialog', undefined, 'member-tour');
  dialog.setAttribute('aria-labelledby', 'member-tour-title');
  let step = 0;
  function close(destination) {
    seen.add(key); try { localStorage.setItem(key, 'done'); } catch {}
    dialog.close(); dialog.remove(); previous?.focus?.();
    if (destination) shell?.navigate(destination);
  }
  const steps = [
    ['Welcome to your water community', 'FinFolk brings your beach research, dive log and local diving community together. Try these interface examples, then use the shortcuts at the end.'],
    ['Find a beach worth returning to', 'Open Discover to search beaches and regions, or use search at the top of Map. Open a beach for depth references, access notes, nearby stays and the folk there. Survey coverage varies; the map is a research tool, not live conditions.'],
    ['Pick your favourite spots', 'Open Check In → Profile & privacy. Under “Beaches you’re interested in”, search and select up to 20 beaches, then Save profile. These choices help buddy compatibility; they do not count as visits.'],
    ['Save a session', 'Open My sessions, then the new-session form. Choose the beach or location, date, duration, maximum depth and notes, then save. Sessions start private. A saved session and a beach check-in are separate records.'],
    ['Check in and become a regular', 'At the beach, open its details and “The folk here”, then Check in. Visits are self-reported. Three distinct visit days in the last 30 days make you a regular. The window keeps moving, so regular status expires when visits fall outside it.'],
    ['Meet people at your spots', 'Open “The folk here” for regulars and suggested buddies. Suggestions use shared interests and preferences, not a safety qualification. Send a buddy request; they choose whether to accept. Manage requests in Your buddies.'],
    ['Choose what you share', 'Profiles start Closed. Open lets you appear in discovery. Activity stats require both Open divers to have 3 recent visit days; dive summaries require 5. Accepted buddies bypass visit gates, but only see statistics you permit. Closed pauses discovery; it does not revoke accepted buddies.'],
    ['Take it into the water', 'Your setup is yours to control. Keep photos and videos on Instagram or TikTok and add profile links in Profile & privacy. Those links do not verify ownership or grant follower-only access. Ready to make FinFolk yours?'],
  ];
  function demo(host) {
    const label = node('small', 'INTERACTIVE EXAMPLE · nothing here is saved', 'tour-demo-label'); host.append(label);
    if (step === 1) {
      const input = node('input'); input.type = 'search'; input.placeholder = 'Search beaches or regions'; input.setAttribute('aria-label', 'Example beach search');
      const result = action('Bondi Beach · Eastern Beaches', () => { details.hidden = !details.hidden; });
      const details = node('p', 'Depth references · Access & sources · Camping & stays · The folk here'); details.hidden = true;
      input.oninput = () => { result.hidden = !'bondi beach eastern beaches'.includes(input.value.toLowerCase()); }; host.append(input, result, details);
    } else if (step === 2) {
      const selection = node('p', 'No example spots selected');
      for (const title of ['Bondi Beach', 'Edithvale Beach']) {
        const b = action('♡ ' + title, () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); b.textContent = (on ? '♥ ' : '♡ ') + title; selection.textContent = [...host.querySelectorAll('[aria-pressed=true]')].map(n => n.textContent.slice(2)).join(' · ') || 'No example spots selected'; }); b.setAttribute('aria-pressed', 'false'); host.append(b);
      } host.append(selection);
    } else if (step === 3) {
      const form = node('form');
      for (const [title, type, value] of [['Location', 'text', 'Bondi Beach'], ['Date', 'date', new Date().toISOString().slice(0, 10)], ['Notes', 'text', 'Easy session with my buddy'], ['Duration (minutes)', 'number', '30'], ['Maximum depth (metres)', 'number', '8']]) { const l = node('label', title), input = node('input'); input.type = type; input.value = value; l.append(input); form.append(l); }
      const save = node('button', 'Save example session', 'primary'); save.type = 'submit'; const status = node('p'); status.setAttribute('role','status'); form.onsubmit = e => { e.preventDefault(); status.textContent = 'Example saved · Private. Your real sessions live in My sessions.'; }; form.append(save, status); host.append(form);
    } else if (step === 4) {
      let visits = 0; const progress = node('p', '0 / 3 example visit days'); const b = action('Add an example visit day', () => { visits = Math.min(3, visits + 1); progress.textContent = `${visits} / 3 example visit days${visits === 3 ? ' · Regular' : ''}`; b.disabled = visits === 3; }); host.append(progress, b);
    } else if (step === 5) {
      host.append(node('strong', 'Example diver · shared beach and ocean swimming'));
      const status = node('p'); status.setAttribute('role','status'); host.append(action('Send example buddy request', () => { status.textContent = 'Request sent · Waiting for them to accept. This is a demonstration.'; }), status);
    } else if (step === 6) {
      const toggle = node('label', 'Open profile '), input = node('input'); input.type = 'checkbox'; toggle.append(input); const status = node('p', 'Closed · discovery paused'); input.onchange = () => { status.textContent = input.checked ? 'Open · discovery enabled; field-level sharing still applies' : 'Closed · discovery paused'; }; host.append(toggle, status);
    } else host.append(node('p', step === 0 ? 'Discover → Pick spots → Log sessions → Check in → Meet regulars' : 'Explore freely. Choose your spots. Share on your terms.'));
  }
  function draw() {
    dialog.replaceChildren(); const top = node('div', undefined, 'tour-top'); top.append(node('small', `HOW FINFOLK WORKS · ${step + 1} / ${steps.length}`), action('Close walkthrough', () => close()));
    const title = node('h2', steps[step][0]); title.id = 'member-tour-title'; title.tabIndex = -1;
    const preview = node('section', undefined, 'tour-demo'); preview.setAttribute('aria-label', 'FinFolk interface example'); demo(preview);
    const controls = node('div', undefined, 'tour-controls'); if (step) controls.append(action('Back', () => { step--; draw(); }));
    if (step === steps.length - 1) controls.append(action('Choose favourite spots', () => { close('account'); document.getElementById('social-profile')?.scrollIntoView?.(); }, 'primary'), action('Log a session', () => close('logbook')), action('Explore beaches', () => close('discover')));
    else controls.append(action('Next', () => { step++; draw(); }, 'primary'));
    dialog.append(top, title, node('p', steps[step][1], 'tour-description'), preview, controls); title.focus();
  }
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); }); document.body.append(dialog); draw(); dialog.showModal();
}
