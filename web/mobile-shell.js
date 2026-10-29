// One set of controls: move the existing nodes into a drawer at small widths.
// Markers restore their exact desktop positions without rebuilding listeners/data.
export function installMobileShell({onLayout=()=>{},onOpen=()=>{},media=globalThis.matchMedia?.('(max-width:900px)')}={}){
  if(!media)return {isMobile:()=>false,open(){},close(){},show(){}};
  const doc=document,sidebar=doc.getElementById('app-sidebar'),stage=doc.getElementById('mobile-map-stage'),toggle=doc.getElementById('mobile-menu-toggle'),closeButton=doc.getElementById('mobile-menu-close'),backdrop=doc.getElementById('mobile-menu-backdrop'),main=doc.querySelector('main');
  let mobile=false,opened=false,slots=[],originalSidebar=[],scroll,content;
  const afterLayout=fn=>(globalThis.requestAnimationFrame||(callback=>setTimeout(callback,0)))(()=>{if(doc.body?.isConnected)fn();});
  function move(node,target,before=null){if(!node)return;const marker=doc.createComment('desktop position');node.before(marker);slots.push({node,marker});target.insertBefore(node,before);}
  function close({focus=toggle}={}){
    if(!mobile)return;const system=doc.getElementById('system-panel');if(system&&!system.hidden)doc.getElementById('system-close').click();opened=false;stage.append(doc.getElementById('notice'));doc.body.classList.remove('mobile-menu-open');sidebar.inert=true;sidebar.removeAttribute('aria-modal');stage.inert=false;stage.removeAttribute('aria-hidden');toggle.inert=false;toggle.setAttribute('aria-expanded','false');backdrop.hidden=true;if(focus)focus.focus({preventScroll:true});
  }
  function open({focus=true}={}){
    if(!mobile)return;onOpen();opened=true;scroll.insertBefore(doc.getElementById('notice'),scroll.firstChild);sidebar.inert=false;sidebar.setAttribute('aria-modal','true');stage.inert=true;stage.setAttribute('aria-hidden','true');toggle.inert=true;toggle.setAttribute('aria-expanded','true');backdrop.hidden=false;doc.body.classList.add('mobile-menu-open');if(focus)closeButton.focus({preventScroll:true});
  }
  function show(id){if(!mobile)return;open({focus:false});afterLayout(()=>{const target=doc.getElementById(id);if(!target)return;target.scrollIntoView?.({block:'start',behavior:globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});});}
  function apply(){
    if(media.matches===mobile)return;
    if(media.matches){
      mobile=true;originalSidebar=[...sidebar.childNodes];const brand=sidebar.querySelector('.brand'),header=doc.createElement('div');header.className='mobile-sidebar-header';header.append(brand,closeButton);scroll=doc.createElement('div');scroll.className='mobile-sidebar-scroll';
      for(const node of originalSidebar)if(node!==brand&&node!==closeButton)scroll.append(node);sidebar.append(header,scroll);
      content=doc.createElement('div');content.className='mobile-sidebar-content';scroll.insertBefore(content,scroll.querySelector('.sidebar-bottom'));
      const nav=scroll.querySelector('.primary-nav');move(doc.getElementById('search-section'),scroll,nav.nextSibling);
      for(const node of [...main.children])move(node,content);
      move(doc.querySelector('.map-wrap'),stage);move(doc.getElementById('notice'),stage);
      move(doc.getElementById('measurement-visibility'),doc.querySelector('.measure-actions'));
      const layers=scroll.querySelector('.map-data');move(doc.querySelector('.survey-picker'),layers,layers.querySelector('.map-view-controls'));move(doc.querySelector('.header-actions'),layers,layers.querySelector('.map-view-controls').nextSibling);move(doc.getElementById('system-toggle'),scroll,layers.nextSibling);move(doc.getElementById('system-panel'),scroll,doc.getElementById('system-toggle').nextSibling);
      stage.hidden=false;toggle.hidden=false;closeButton.hidden=false;sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-label','Navigation and beach details');doc.body.classList.add('mobile-map-mode');close({focus:null});
      if(['discover','areas','guides'].includes(new URL(doc.defaultView.location.href).searchParams.get('view')))open({focus:false});
    }else{
      close({focus:null});mobile=false;sidebar.inert=false;stage.inert=false;stage.removeAttribute('aria-hidden');sidebar.removeAttribute('role');sidebar.removeAttribute('aria-label');sidebar.removeAttribute('aria-modal');
      for(const {node,marker} of slots.reverse())if(marker.parentNode)marker.replaceWith(node);slots=[];sidebar.replaceChildren(...originalSidebar);stage.hidden=true;toggle.hidden=true;toggle.inert=false;closeButton.hidden=true;backdrop.hidden=true;doc.body.classList.remove('mobile-map-mode','mobile-menu-open');
    }
    afterLayout(onLayout);
  }
  function focusables(){return [...sidebar.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].filter(node=>{
    if(node.disabled||node.tabIndex<0||node.closest('[hidden],[inert]'))return false;
    for(let parent=node.parentElement;parent&&parent!==sidebar;parent=parent.parentElement){if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector('summary')?.contains(node))return false;}
    const style=doc.defaultView.getComputedStyle(node);return style.display!=='none'&&style.visibility!=='hidden';
  });}
  toggle.onclick=()=>{if(opened)close();else{open();scroll.scrollTop=0;}};closeButton.onclick=()=>close();backdrop.onclick=()=>close();
  doc.addEventListener('keydown',event=>{
    if(!mobile||!opened||event.defaultPrevented||doc.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){const nodes=focusables(),first=nodes[0]||closeButton,last=nodes.at(-1)||closeButton;if(event.shiftKey&&(doc.activeElement===first||!sidebar.contains(doc.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(doc.activeElement===last||!sidebar.contains(doc.activeElement))){event.preventDefault();first.focus();}}
  });
  doc.addEventListener('click',event=>{if(!mobile)return;const button=event.target.closest?.('button[data-view]');if(button){if(button.dataset.view==='maps')close({focus:doc.getElementById('map')});else{open({focus:false});scroll.scrollTop=0;}}else if(event.target.closest?.('#zoom-in,#zoom-out,#home,#measurement-visibility'))close({focus:doc.getElementById('map')});});
  media.addEventListener('change',apply);apply();return {isMobile:()=>mobile,open,close,show};
}
