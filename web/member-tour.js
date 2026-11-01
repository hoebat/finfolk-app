const VERSION = '3';
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
  let step = 0, timer, frames = [], frameIndex = 0, caption, pointer, preview;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let playing = !reduced, playButton;
  function stop() { clearTimeout(timer); timer = null; }
  function scheduleFrame() {
    stop();
    if (!playing || document.hidden || !dialog.isConnected || frameIndex >= frames.length) return;
    const frame = frames[frameIndex];
    timer = setTimeout(() => { if (!playing || !dialog.isConnected) return; frameIndex++; frame.run(); scheduleFrame(); }, frame.delay);
  }
  function pause() { playing = false; stop(); if (playButton) playButton.textContent = 'Play demonstration'; }
  function aim(target, text) {
    caption.textContent = text;
    preview.querySelectorAll('.tour-highlight').forEach(n => n.classList.remove('tour-highlight'));
    if (!target) return;
    target.classList.add('tour-highlight');
    const box = preview.getBoundingClientRect(), rect = target.getBoundingClientRect();
    pointer.style.left = `${rect.left - box.left + Math.min(rect.width / 2, 100)}px`;
    pointer.style.top = `${rect.top - box.top + rect.height / 2}px`;
    pointer.hidden = false;
  }
  function animateScene() {
    frames = []; frameIndex = 0;
    const add = (run, delay = 1300) => frames.push({run, delay});
    const buttons = [...preview.querySelectorAll('button')], inputs = [...preview.querySelectorAll('input')];
    const press = (b, text) => { add(() => aim(b, text)); add(() => { b?.click(); pointer.classList.remove('tour-click'); void pointer.offsetWidth; pointer.classList.add('tour-click'); }, 650); };
    const type = (input, value, text) => { input.value = ''; add(() => aim(input, text)); for (let i = 1; i <= value.length; i++) add(() => { input.value = value.slice(0, i); input.dispatchEvent(new window.Event('input', {bubbles:true})); }, 65); };
    if (step === 1) { type(inputs[0], 'Bondi', 'Search for a beach or coastal region.'); press(buttons[0], 'Open the beach to inspect depth references and community details.'); }
    else if (step === 2) { press(buttons[0], 'Choose a beach you return to.'); press(buttons[1], 'Add another favourite. Save these choices in Profile & privacy.'); }
    else if (step === 3) { type(inputs[0], 'Bondi Beach', 'Choose your session location.'); type(inputs[2], 'Easy session with my buddy', 'Add notes to remember the session.'); type(inputs[3], '30', 'Record time in the water.'); type(inputs[4], '8', 'Record your maximum depth.'); press(buttons[0], 'Save the session. It starts private.'); }
    else if (step === 4) { for (let i = 1; i <= 3; i++) press(buttons[0], `Example visit day ${i}: each visit must be on a different day.`); }
    else if (step === 5) press(buttons[0], 'Send a request. The other diver decides whether to accept.');
    else if (step === 6) { press(inputs[0], 'Open enables discovery. You still control each shared statistic.'); press(inputs[0], 'Switch back to Closed to pause discovery.'); }
    else if (step === 7) { press(buttons[0], 'Send /connect in Instagram to receive a connection code.'); press(buttons[1], 'Follow @finfolk.com.au, send /connect, then enter the reply code on FinFolk.'); }
    else if (step === 8) press(buttons[0], 'Confirm only your own dive. FinFolk keeps the draft private.');
    else if (step === 9) press(buttons[0], 'Share your real invite link with friends. Points follow verified joins.');
    else add(() => { caption.textContent = step === 0 ? 'Watch the controls move, or pause and try them yourself.' : 'Use the shortcuts below to start with your real account.'; });
    add(() => { caption.textContent = 'Demonstration complete. Continue when you’re ready, or replay this step.'; playing = false; playButton.textContent = 'Play demonstration'; pointer.hidden = true; });
    scheduleFrame();
  }
  const visibility = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', visibility);
  function close(destination) {
    stop(); document.removeEventListener('visibilitychange', visibility);
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
    ['Connect Instagram', 'Follow @finfolk.com.au and send /connect in Instagram. Enter the code from its reply in Your FinFolk → Instagram. Codes expire after ten minutes.'],
    ['Turn mentions into actions', 'On a public Instagram post, mention @finfolk.com.au with a request such as log Bondi Beach depth 8m duration 30min. FinFolk prepares an action. Confirm your own dive details or exact public stats reply in My actions. Administrators review replies and awards. Private-post mentions are unavailable.'],
    ['Invite your people', 'Open Invite friends to copy your invite link and see joins and verified connections. A new member can accept your invitation and verify Instagram to unlock a referral point for you. These are FinFolk referrals, not verified Instagram mutuals. Public points are opt-in.'],
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
    } else if (step === 7) {
      const status=node('p');status.setAttribute('role','status');host.append(action('Show example connection command',()=>{status.textContent='/connect · Example only, not a valid code.';}),action('Simulate following and sending',()=>{status.textContent='Example: follow and sender verified → Instagram connected. No real message was sent.';}),status);
    } else if (step === 8) {
      host.append(node('strong','Dive action · Awaiting your confirmation'),node('p','Example: Bondi Beach · 8m · 30min'));
      const status=node('p');status.setAttribute('role','status');host.append(action('Confirm example action',()=>{status.textContent='Example confirmed · Waiting for administrator review. No real session saved.';}),status);
    } else if (step === 9) {
      host.append(node('strong','Invitation statistics · Example'),node('p','3 joins · 1 verified Instagram connection · 1 referral point'));
      const status=node('p');status.setAttribute('role','status');host.append(action('Show example invite link',()=>{status.textContent='Your real invite link is available in Instagram & actions → Invite friends.';}),status);
    } else host.append(node('p', step === 0 ? 'Discover → Pick spots → Log sessions → Check in → Meet regulars' : 'Explore freely. Choose your spots. Share on your terms.'));
  }
  function draw() {
    stop(); dialog.replaceChildren(); const top = node('div', undefined, 'tour-top'); top.append(node('small', `HOW FINFOLK WORKS · ${step + 1} / ${steps.length}`), action('Close walkthrough', () => close()));
    const title = node('h2', steps[step][0]); title.id = 'member-tour-title'; title.tabIndex = -1;
    preview = node('section', undefined, 'tour-demo'); preview.setAttribute('aria-label', 'FinFolk interface example'); preview.dataset.screen = ['Welcome', 'Discover · Beach search', 'Check In · Profile & privacy', 'My sessions · New session', 'Beach · The folk here', 'Beach · Suggested buddies', 'Check In · Sharing', 'Instagram · Claim account', 'My actions · Confirm', 'Invite friends · Statistics', 'Your FinFolk'][step]; demo(preview);
    const controls = node('div', undefined, 'tour-controls'); if (step) controls.append(action('Back', () => { step--; playing = !reduced; draw(); }));
    if (step === steps.length - 1) controls.append(action('Choose favourite spots', () => { close('account'); document.getElementById('account-tab-profile')?.click(); document.getElementById('social-profile')?.scrollIntoView?.(); }, 'primary'), action('Log a session', () => close('logbook')), action('Explore beaches', () => close('discover')));
    else controls.append(action('Next', () => { step++; playing = !reduced; draw(); }, 'primary'));
    pointer = node('span', '↖', 'tour-pointer'); pointer.setAttribute('aria-hidden', 'true'); pointer.hidden = true; preview.append(pointer);
    caption = node('p', 'Press Play to watch, or try the controls yourself.', 'tour-caption');
    const playback = node('div', undefined, 'tour-playback');
    playButton = action(playing ? 'Pause demonstration' : 'Play demonstration', () => {
      if (playing) pause(); else { playing = true; playButton.textContent = 'Pause demonstration'; if (frameIndex >= frames.length) { draw(); } else scheduleFrame(); }
    });
    playback.append(playButton, action('Replay step', () => { playing = !reduced; draw(); }));
    preview.addEventListener('pointerdown', pause);
    preview.addEventListener('keydown', pause);
    dialog.append(top, title, node('p', steps[step][1], 'tour-description'), playback, preview, caption, controls); title.focus();
    animateScene();
  }
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); }); document.body.append(dialog); draw(); dialog.showModal();
}
