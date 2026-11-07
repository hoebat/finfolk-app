export function showWelcome() {
  const dialog = document.createElement('dialog');
  dialog.className = 'welcome-dialog';
  let step = 0;
  const steps = [
    [
      'Pick your spot.',
      'Search freediving locations by state and region. View maps, access information and available depth data.',
      '⌁',
    ],
    [
      'Post your logs.',
      'Record your freediving and training sessions. Sessions start private. Choose which logs to publish.',
      '◉',
    ],
    [
      'Discover your FinFolk.',
      'Check in at your locations and meet other freedivers. 10 separate visit days within the last 30 days make you a Regular at that location. You choose what to share.',
      '↗',
    ],
  ];
  function close() {
    try {
      localStorage.setItem('finfolk:welcome', '1');
    } catch {}
    dialog.close();
    dialog.remove();
  }
  function draw() {
    dialog.replaceChildren();
    const [title, text, icon] = steps[step],
      art = document.createElement('div');
    art.className = 'welcome-art';
    art.textContent = icon;
    const heading = document.createElement('h2');
    heading.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    const progress = document.createElement('small');
    progress.textContent = `${step + 1} / 3`;
    const next = document.createElement('button');
    next.className = 'primary';
    next.textContent = step === 2 ? 'Done' : 'Next';
    next.onclick = () => {
      if (step === 2) close();
      else {
        step++;
        draw();
      }
    };
    const skip = document.createElement('button');
    skip.textContent = 'Skip';
    skip.onclick = close;
    dialog.append(art, progress, heading, p, next, skip);
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  draw();
  dialog.showModal();
}
export function welcomeOnFirstVisit() {
  try {
    if (!localStorage.getItem('finfolk:welcome')) showWelcome();
  } catch {
    /* Browsing remains available when storage is blocked. */
  }
}
