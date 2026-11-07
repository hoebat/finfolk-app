// Installed only by the local preview bridge, never by the published app.
import {installLocalNavigation,localNavigationURL} from './local-navigation.js';
export function installProfilePreviewLinks(doc=document){
 const nav=doc.querySelector('.primary-nav'),rail=doc.querySelector('.app-rail')||nav?.parentElement;if(!nav||!rail||nav.querySelector('[data-profile-preview-link]'))return;
 const context=()=>new URL(doc.defaultView.location.href).searchParams.get('site')||'';
 const people=doc.createElement('a');people.href=localNavigationURL('people',context());people.textContent='People';people.dataset.profilePreviewLink='people';
 const mine=doc.createElement('a');mine.href=localNavigationURL('me',context());mine.textContent='My profile';mine.dataset.profilePreviewLink='me';
 nav.insertBefore(people,nav.querySelector('[data-view=logbook]'));nav.append(mine);
 return installLocalNavigation({doc,nav,rail,context});
}
