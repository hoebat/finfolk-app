// Drive real controls to reveal the requested production UI state.
export function prepareScreen(){
 const screen=new URL(location.href).searchParams.get('atelier-screen');
 if(!screen)return;
 let openedPlace=false,finished=false;
 const buttons=(selector)=>[...document.querySelectorAll(selector)];
 function reveal(){
  if(finished)return;
  if(screen==='welcome'){
   finished=true;
   import('/preview/welcome.js').then(({showWelcome})=>showWelcome());
  }else if(screen==='new-session'){
   const button=buttons('#logbook-page button').find(button=>button.textContent==='Log a session');
   if(button){finished=true;button.click();}
  }else if(screen==='tools'){
   if(document.getElementById('place-title')?.textContent==='Bondi Beach'){finished=true;document.getElementById('map-tools-callout').click();}
  }else if(screen==='place'||screen==='stays'){
   if(!openedPlace&&document.getElementById('place-title')?.textContent==='Bondi Beach'){
    const search=document.getElementById('map-search');
    search.value='Bondi';search.dispatchEvent(new Event('input',{bubbles:true}));
    const match=buttons('.map-match').find(button=>button.textContent.includes('Bondi Beach'));
    if(match){openedPlace=true;match.click();}
   }
   if(openedPlace&&!document.getElementById('data-panel').hidden){
    if(screen==='place')finished=true;
    else{const tab=buttons('.place-tab').find(button=>button.textContent==='Camping & stays');if(tab){finished=true;tab.click();}}
   }
  }else finished=true;
  if(finished)observer.disconnect();
 }
 const observer=new MutationObserver(reveal);
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 reveal();
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}
