const storageKey = 'finfolk-theme';
const themes = [
  ['coastal', 'Coastal', 'Fresh aqua & cream', '#009db2', '#fffdf0'],
  ['sand', 'Sand', 'Warm shores & olive', '#657b50', '#faf2df'],
  ['night', 'Night swim', 'Deep blue & sea glass', '#72d9d0', '#132e3a'],
];
export function applySavedTheme() {
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch {}
  document.documentElement.dataset.theme = themes.some(([id]) => id === saved) ? saved : 'coastal';
}
export function themeSettings() {
  const section = document.createElement('section');
  section.className = 'account-card theme-settings';
  const heading = document.createElement('h2');
  heading.textContent = 'Appearance';
  const description = document.createElement('p');
  description.textContent = 'Choose your colours. Your theme is saved on this device.';
  const choices = document.createElement('fieldset');
  choices.className = 'theme-choices';
  const legend = document.createElement('legend');
  legend.textContent = 'App theme';
  choices.append(legend);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  for (const [id, name, detail, accent, surface] of themes) {
    const label = document.createElement('label');
    label.className = 'theme-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'theme';
    input.value = id;
    input.checked = document.documentElement.dataset.theme === id;
    const swatch = document.createElement('span');
    swatch.className = 'theme-swatch';
    swatch.style.background = `linear-gradient(145deg, ${surface} 55%, ${accent} 55%)`;
    swatch.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = name;
    const copy = document.createElement('small');
    copy.textContent = detail;
    label.append(input, swatch, title, copy);
    input.onchange = () => {
      if (!input.checked) return;
      document.documentElement.dataset.theme = id;
      try {
        localStorage.setItem(storageKey, id);
        status.textContent = `${name} theme saved.`;
      } catch { status.textContent = `${name} theme applied. Storage is unavailable, so it won’t persist after you leave.`; }
    };
    choices.append(label);
  }
  const note = document.createElement('small');
  note.textContent = 'Map and depth colours stay consistent across themes.';
  section.append(heading, description, choices, status, note);
  return section;
}
