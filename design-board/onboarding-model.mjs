import {LOCATIONS} from './profile-data.mjs';
export const ONBOARDING_STEPS=['profile','locations','privacy','instagram-connect','instagram','review','done'];
export const ONBOARDING_KEY='finfolk:atelier:onboarding:v1';
export function cleanOnboarding(value={}){
 if(!value||typeof value!=='object')value={};
 return {step:ONBOARDING_STEPS.includes(value.step)?value.step:'profile',displayName:String(value.displayName||'').slice(0,80),bio:String(value.bio||'').slice(0,500),beaches:[...new Set(Array.isArray(value.beaches)?value.beaches:[])].filter(id=>LOCATIONS.some(p=>p.id===id)),open:value.open===true,instagramLater:value.instagramLater!==false,completed:value.completed===true};
}
export function onboardingErrors(step,draft){
 if(step==='profile'&&!draft.displayName.trim())return {displayName:'What would you like us to call you?'};
 if(step==='profile'&&draft.displayName.trim().length>80)return {displayName:'Use up to 80 characters.'};
 return {};
}
export function onboardingNext(step){const i=ONBOARDING_STEPS.indexOf(step);return ONBOARDING_STEPS[Math.min(i+1,ONBOARDING_STEPS.length-1)];}
