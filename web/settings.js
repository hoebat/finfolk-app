import {applySavedTheme, themeSettings} from './theme.js';

export const MAP_CONTROLS = {depth:'depth-layer', contours:'contour-layer', context:'context-layer',
  pins:'pin-layer', coverage:'coverage-layer', basemap:'basemap-layer', measurement:'measurement-layer'};

export function installSettings({preferences, shell}) {
  applySavedTheme();
  document.getElementById('settings-appearance').append(themeSettings());
  const storageLink = document.createElement('button');
  storageLink.type='button'; storageLink.className='secondary'; storageLink.textContent='Open storage settings';
  storageLink.onclick=()=>shell.navigate('settings',{focus:true});
  document.getElementById('system-panel').append(storageLink);
  const status = document.getElementById('map-settings-status');
  function draw(values = preferences.get()) {
    for (const [key, id] of Object.entries(MAP_CONTROLS)) document.getElementById(id).checked = values[key];
    document.getElementById('interval').value = String(values.interval);
  }
  for (const [key, id] of Object.entries(MAP_CONTROLS)) {
    const input = document.getElementById(id);
    input.onchange = () => preferences.set(key, input.checked);
  }
  document.getElementById('interval').onchange = event => preferences.set('interval', Number(event.target.value));
  preferences.subscribe(values => {
    draw(values);
    status.textContent = preferences.persisted ? 'Map preferences saved on this device.' :
      'Preferences applied for this visit. Device storage is unavailable.';
  });
  draw();
  const availability = new Map();
  const settings = {updateAvailability(capabilities = {}) {
    const available = {depth:capabilities.raster || capabilities.surface, contours:capabilities.raster || capabilities.contours,
      context:capabilities.context, pins:capabilities.pins, coverage:capabilities.raster};
    for (const [key, supported] of Object.entries(available)) {
      const input = document.getElementById(MAP_CONTROLS[key]);
      let note = availability.get(key);
      if (!note) {
        note = document.createElement('small'); note.className = 'setting-availability';
        note.id = `setting-${key}-availability`;
        input.closest('label').querySelector('span').append(note);
        input.setAttribute('aria-describedby', note.id); availability.set(key, note);
      }
      note.textContent = supported ? '' : 'Applies where this data is available.';
      note.hidden = !!supported;
    }
    let intervalNote = document.getElementById('interval-availability');
    if (!intervalNote) {
      intervalNote = document.createElement('small'); intervalNote.id = 'interval-availability';
      document.getElementById('interval').closest('label').append(intervalNote);
      document.getElementById('interval').setAttribute('aria-describedby', intervalNote.id);
    }
    intervalNote.textContent = capabilities.fine ? '2 m contours are supported on this map.' :
      '2 m requires measured grids of 5 m or finer. Other maps use 5 m.';
  }};
  settings.updateAvailability();
  return settings;
}
