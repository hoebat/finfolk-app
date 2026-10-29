import {normalise} from './discovery.js';
export function mapMatches(catalog,query){
  const needle=normalise(query);if(!needle)return [];
  const rows=[],byId=new Map(),areas=catalog.areas||[];
  const addBeach=(beach,rank=3,locality='')=>{
    const row={kind:'beach',id:beach.id,name:beach.name,detail:locality?`Near ${locality} · ${beach.area_name} · ${beach.state}`:`${beach.area_name} · ${beach.state}`,rank};
    const existing=byId.get(beach.id);if(existing){if(rank<existing.rank){Object.assign(existing,row);}return;}
    byId.set(beach.id,row);rows.push(row);
  };
  for(const beach of catalog.beaches){const names=[beach.name,beach.id,...(beach.aliases||[])],matched=names.some(name=>normalise(name).includes(needle))||[beach.area_name,beach.state,beach.state_id].some(name=>normalise(name).includes(needle));if(matched)addBeach(beach,names.some(name=>normalise(name)===needle)?0:normalise(beach.name).startsWith(needle)?1:3);}
  for(const area of areas){
    const localities=area.search_localities||[],locality=localities.find(name=>normalise(name).includes(needle)),matchedName=[area.name,area.id,area.state_id].find(name=>normalise(name).includes(needle));
    if(!locality&&!matchedName)continue;
    rows.push({kind:'area',id:area.id,name:area.name,detail:locality?`Around ${locality} · Region`:'Region',rank:normalise(locality||area.name)===needle?0:2});
    const linked=catalog.beaches.filter(beach=>beach.area_id===area.id);
    for(const beach of linked)addBeach(beach,locality?2:3,locality||'');
  }
  return rows.sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function installMapSearch({catalog,onBeach,onArea,onAll,onTyping=()=>{}}){const input=document.getElementById('map-search'),results=document.getElementById('map-search-results'),form=document.getElementById('map-search-form');let active=-1,buttons=[];
  function close(){results.hidden=true;input.setAttribute('aria-expanded','false');active=-1;input.removeAttribute('aria-activedescendant');}
  function render(){onTyping();const rows=mapMatches(catalog,input.value);results.replaceChildren();buttons=[];active=-1;input.removeAttribute('aria-activedescendant');if(!input.value.trim()){close();return;}for(const row of rows.slice(0,8)){const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.tabIndex=-1;b.id=`map-match-${row.kind}-${row.id}`;b.className='map-match';const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=row.name;detail.textContent=row.detail;b.append(name,detail);b.onclick=()=>{input.value=row.name;close();row.kind==='beach'?onBeach(row.id):onArea(catalog.areas.find(a=>a.id===row.id));};results.append(b);buttons.push(b);}if(!rows.length){const empty=document.createElement('p');empty.textContent='No matching beaches or regions.';results.append(empty);}const all=document.createElement('button');all.type='button';all.setAttribute('role','option');all.setAttribute('aria-selected','false');all.tabIndex=-1;all.id='map-match-all';all.className='map-search-all';all.textContent='All results in Discover';all.onclick=()=>{const query=input.value;close();onAll(query);};results.append(all);buttons.push(all);results.hidden=false;input.setAttribute('aria-expanded','true');}
  input.addEventListener('input',render);input.addEventListener('focus',()=>{if(input.value)render();});input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return;}if(results.hidden)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>{b.classList.toggle('active',i===active);b.setAttribute('aria-selected',String(i===active));});buttons[active].scrollIntoView?.({block:'nearest'});input.setAttribute('aria-activedescendant',buttons[active].id||'');}else if(e.key==='Enter'){e.preventDefault();(buttons[active<0?0:active])?.click();}});form.onsubmit=e=>e.preventDefault();document.addEventListener('pointerdown',e=>{if(!form.contains(e.target))close();});return {close,setSelection(beach){input.value=beach?.name||'';close();}};
}
