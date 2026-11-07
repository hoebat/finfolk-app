import {installFeatureDemos,FEATURE_DEMOS} from '../web/feature-demos.js';
export function onboardingWalkthrough({doc,parent,kind,label}){
 const section=doc.createElement('section');section.className='onboarding-walkthrough';
 const figure=doc.createElement('figure');figure.className='feature-demo';figure.dataset.featureDemo=kind;figure.setAttribute('aria-label',label||(kind==='instagram-setup'?'Animated walkthrough: connect your Instagram account':'Animated walkthrough: add Instagram posts to your profile'));
 const controls=doc.createElement('div');controls.className='onboarding-animation-controls';const nodes=[];
 for(const [label,id]of [['Previous frame','previous'],['Pause animation','pause'],['Next frame','next']]){const b=doc.createElement('button');b.type='button';b.textContent=label;b.className='onboarding-button';b.dataset.animationControl=id;controls.append(b);nodes.push(b);}
 section.append(figure,controls);parent.append(section);
 const playback=installFeatureDemos({doc});let manuallyPaused=doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function sync(){nodes[1].textContent=manuallyPaused?'Play animation':'Pause animation';nodes[1].setAttribute('aria-pressed',String(manuallyPaused));}
 function seek(offset){manuallyPaused=true;playback.setPaused(true);const count=FEATURE_DEMOS[kind].durations.length;playback.seek(figure,(Number(figure.dataset.step)+offset+count)%count);sync();}
 nodes[0].onclick=()=>seek(-1);nodes[2].onclick=()=>seek(1);nodes[1].onclick=()=>{manuallyPaused=!manuallyPaused;playback.setPaused(manuallyPaused);sync();};sync();
 const motion=doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)'),changed=e=>{manuallyPaused=e.matches;sync();};motion.addEventListener('change',changed);
 return {destroy(){motion.removeEventListener('change',changed);playback.destroy();}};
}
