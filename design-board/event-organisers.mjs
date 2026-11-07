import {loadManagement,role} from './management-model.mjs';
// Shared local page eligibility. These records do not authorize production actions.
export const EVENT_PAGES=Object.freeze([
 {id:'tideline',name:'Tideline Freediving',published:true,claimed:false,role:'owner'},
 {id:'saltwater',name:'Saltwater Sundays',published:true,claimed:true,role:'admin'},
 {id:'maya',name:'Maya Laurent',published:true,claimed:true,role:'owner'},
]);
export function eventEligibility(page){
 const reasons=[];
 if(!page?.published)reasons.push('The page must be published.');
 if(!page?.claimed)reasons.push('Page ownership must be verified.');
 if(!['owner','admin'].includes(page?.role))reasons.push('You must be the page owner or an admin.');
 return {eligible:reasons.length===0,reasons};
}

export function loadEventPages(storage,collection){const s=loadManagement(storage,collection);return s.pages.map(p=>({...p,published:p.published&&!p.archived,role:role(p)}));}
