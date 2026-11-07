import {VISUAL_PALETTES,visualPalette} from '../web/visual-language.js';
const key='finfolk:atelier:palette:v1';
export function installVisualShell({onChange=()=>{}}={}){
 let saved;try{saved=localStorage.getItem(key);}catch{}
 const host=document.getElementById('shell-palettes');
 function choose(id,notify=false){const palette=visualPalette(id);document.documentElement.dataset.studioPalette=palette.id;for(const button of host.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.shellPalette===palette.id));if(notify){try{localStorage.setItem(key,palette.id);}catch{}onChange(palette);document.dispatchEvent(new window.CustomEvent('finfolk:palette',{detail:palette.id}));}}
 for(const palette of VISUAL_PALETTES){const button=document.createElement('button');button.type='button';button.dataset.shellPalette=palette.id;button.textContent=palette.name;button.onclick=()=>choose(palette.id,true);host.append(button);}
 choose(saved);
}
