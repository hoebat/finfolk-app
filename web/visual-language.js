import {animalPrint} from './animal-prints.js';
export const VISUAL_PALETTES=Object.freeze([
 {id:'yellow',name:'Acid Club',description:'Acid yellow · bold print',collection:'hyper',palette:{paper:'#edff35',surface:'#fffbea',ink:'#172440',accent:'#1641ff',muted:'#45516b'}},
 {id:'cobalt',name:'Blue Hour',description:'Electric cobalt · warm ivory',collection:'hyper',palette:{paper:'#1641ff',surface:'#2039b9',ink:'#fff4d8',accent:'#edff35',muted:'#d5ddff'}},
 {id:'navy-light',name:'Salt Paper',description:'Warm ivory · quiet navy ink',collection:'muted',palette:{paper:'#f2e8d6',surface:'#fffaf0',ink:'#172440',accent:'#83445e',muted:'#5a6170'}},
 {id:'navy',name:'Night Swim',description:'Midnight ink · restrained print',collection:'muted',palette:{paper:'#172440',surface:'#223351',ink:'#f2e8d6',accent:'#edb2c7',muted:'#bec9da'}},
]);
const aliases={acid:'yellow',pink:'yellow',coastal:'navy',sand:'navy',night:'navy'};
export function visualPalette(id){return VISUAL_PALETTES.find(p=>p.id===(aliases[id]||id))||VISUAL_PALETTES[0];}
export function paletteTheme(theme,id){const choice=visualPalette(id);return {...structuredClone(theme),enabled:true,name:choice.name,palette:{...choice.palette},collection:choice.collection,radius:24,printStyle:'two-tone',printPlacement:theme.printPlacement==='header'?'states':theme.printPlacement};}
export const PALETTE_OVERRIDES=['--account-bg','--account-surface','--account-ink','--account-accent','--account-muted','--finfolk-cream','--finfolk-ink','--finfolk-teal','--finfolk-print-collection','--finfolk-collection-print'];
export function applyPaletteVariables(choice,root=document.documentElement){const p=choice.palette;for(const [name,value] of Object.entries({'--account-bg':p.paper,'--account-surface':p.surface,'--account-ink':p.ink,'--account-accent':p.accent,'--account-muted':p.muted,'--finfolk-cream':p.paper,'--finfolk-ink':p.ink,'--finfolk-teal':p.accent,'--finfolk-print-collection':choice.collection,'--finfolk-collection-print':`url("${new URL('./'+animalPrint('octopus',choice.id),import.meta.url).href}")`}))root.style.setProperty(name,value);}
