const dialogs = new Set();
const alphabet = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const normalize = value => value.toUpperCase().replace(/[\s-]/g, '');
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
export function closeInstagramConnectDialogs() {
  for (const close of [...dialogs]) close();
}
export function openInstagramConnect({ owner, api, onConnected, onDone = () => {} }) {
  closeInstagramConnectDialogs();
  const previous = document.activeElement, uid = api.user?.uid;
  const controller = new AbortController();
  const dialog = node('dialog', undefined, 'instagram-connect-dialog');
  dialog.setAttribute('aria-labelledby', 'instagram-connect-title');
  const title = node('h2', 'Connect Instagram'); title.id = 'instagram-connect-title';
  const feedback = node('p', '', 'connect-feedback'); feedback.setAttribute('role', 'status');
  const demo = node('section', undefined, 'connect-demo');
  demo.setAttribute('aria-label', 'Example: follow FinFolk, send /connect and receive a code');
  const heading = node('div', undefined, 'connect-demo-heading');
  heading.append(node('span', 'f', 'connect-avatar'), node('strong', 'finfolk.com.au'), node('small', 'EXAMPLE'));
  const follow = node('div', 'Follow @finfolk.com.au', 'connect-demo-follow');
  const sent = node('div', '/connect', 'connect-bubble connect-sent');
  const received = node('div', 'Your FinFolk code: •••• ••••\nEnter it on FinFolk within 10 minutes.', 'connect-bubble connect-received');
  const caption = node('p', 'Follow @finfolk.com.au on Instagram.', 'connect-caption');
  demo.append(heading, follow, sent, received);
  let timer, closed = false, busy = false, attempted = '', key, keyCode = '', completed = false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const button = (label, action, className = 'secondary') => {
    const b = node('button', label, className); b.type = 'button'; b.onclick = action; return b;
  };
  function stop() { clearTimeout(timer); }
  function replay() {
    stop(); sent.textContent = reduced ? '/connect' : ''; demo.dataset.stage = reduced ? '3' : '0';
    caption.textContent = 'Follow @finfolk.com.au, send /connect, then enter the code from our reply below.';
    if (reduced) return;
    const frames = [
      [1, 'Follow @finfolk.com.au on Instagram.'],
      [2, 'Send /connect as a direct message.'],
      [3, 'FinFolk replies with your one-time code. Enter your real code below.'],
    ];
    let frame = 0;
    const next = () => {
      if (closed) return;
      if (document.hidden) { timer = setTimeout(next, 500); return; }
      const [stage, text] = frames[frame++];
      demo.dataset.stage = String(stage); caption.textContent = text;
      if (stage === 2) {
        let length = 0;
        const type = () => {
          if (closed) return;
          sent.textContent = '/connect'.slice(0, ++length);
          if (length < 8) timer = setTimeout(type, 85);
          else timer = setTimeout(next, 1000);
        };
        type();
      } else if (frame < frames.length) timer = setTimeout(next, 1600);
    };
    timer = setTimeout(next, 500);
  }
  function close() {
    if (closed) return;
    closed = true; stop(); controller.abort(); observer.disconnect();
    input.value = ''; dialogs.delete(close); dialog.close(); dialog.remove();
    if (previous?.isConnected) previous.focus?.();
    else if (owner.isConnected) owner.querySelector('button')?.focus();
    if (completed) Promise.resolve(onDone()).catch(() => {});
  }
  const top = node('div', undefined, 'connect-dialog-top');
  top.append(node('small', 'YOUR INSTAGRAM · YOUR FINFOLK'), button('Close', close));
  const open = node('a', 'Open Instagram ↗', 'primary connect-open');
  open.href = 'https://www.instagram.com/finfolk.com.au/'; open.target = '_blank'; open.rel = 'noopener noreferrer';
  const actions = node('div', undefined, 'connect-dialog-actions');
  actions.append(open, button('Copy /connect', async () => {
    try { await navigator.clipboard.writeText('/connect'); feedback.textContent = 'Copied. Paste /connect into a message to @finfolk.com.au.'; }
    catch { feedback.textContent = 'Type /connect in a message to @finfolk.com.au.'; }
  }), button('Replay', replay));
  const form = node('form');
  const label = node('label', 'Code from your Instagram DM');
  const input = node('input'); input.name = 'instagram-connect-code'; input.type = 'text';
  input.autocomplete = 'one-time-code'; input.autocapitalize = 'characters'; input.spellcheck = false;
  input.placeholder = 'XXXX XXXX'; input.maxLength = 19; input.setAttribute('aria-describedby', 'instagram-connect-help');
  label.append(input);
  const help = node('p', 'Enter all 8 characters. We’ll connect automatically. Only use a code sent to your own Instagram account.', 'connect-code-help');
  help.id = 'instagram-connect-help';
  const retry = button('Retry', () => verify(true)); retry.hidden = true;
  async function verify(force = false) {
    const code = normalize(input.value);
    if (closed || completed || busy || !alphabet.test(code) || (!force && attempted === code)) return;
    if (api.user?.uid !== uid) { close(); return; }
    busy = true; attempted = code; input.readOnly = true; retry.hidden = true;
    feedback.textContent = 'Checking your code…'; input.removeAttribute('aria-invalid');
    if (keyCode !== code) { keyCode = code; key = crypto.randomUUID(); }
    try {
      const result = await api.request('/v1/me/instagram/connect', {method: 'POST', body: {code}, idempotencyKey: key, signal: controller.signal});
      if (closed || api.user?.uid !== uid || !owner.isConnected) return;
      completed = true; input.value = ''; form.hidden = true; actions.hidden = true; stop();
      feedback.textContent = 'Connected to @' + result.handle;
      dialog.append(feedback, button('Done', close, 'primary'));
      await onConnected(result);
    } catch (error) {
      if (completed) return;
      if (closed || error.name === 'AbortError') return;
      feedback.textContent = error.message || 'We couldn’t connect. Please try again.';
      input.setAttribute('aria-invalid', 'true');
      retry.hidden = error.status === 400 || error.status === 429;
      if (error.status === 401) close();
    } finally { busy = false; input.readOnly = false; }
  }
  input.oninput = () => { const code = normalize(input.value); if (code !== attempted) { feedback.textContent = ''; input.removeAttribute('aria-invalid'); } if (code.length >= 8 && !alphabet.test(code)) feedback.textContent = 'Enter the eight letters and numbers exactly as shown in your DM.'; verify(); };
  form.onsubmit = event => { event.preventDefault(); verify(true); };
  form.append(label, help, feedback, retry);
  dialog.append(top, title, node('p', 'Follow @finfolk.com.au and send us /connect to receive your connection code.'), demo, caption, actions, form);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  const observer = new MutationObserver(() => { if (!owner.isConnected) close(); });
  observer.observe(document.body, {childList: true, subtree: true});
  document.body.append(dialog); dialogs.add(close); dialog.showModal(); replay(); input.focus();
  return dialog;
}
