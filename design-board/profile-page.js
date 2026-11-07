import {installProfileShowcase} from './profile-showcase.js';
installProfileShowcase().catch(error=>{document.getElementById('profile-main').textContent='The local profile preview could not load. Reload to try again.';});
