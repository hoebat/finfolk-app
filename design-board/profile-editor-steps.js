// Keep every field mounted so moving between steps preserves the draft.
export function installProfileEditorSteps({doc,form,layout,preview,actions,error}){
 const steps=[['Add posts','Collect the posts that tell your story.'],['Craft profile','Review your bio, portrait and details.'],['Review','Choose what to share, then save your profile.']];
 const nav=doc.createElement('nav');nav.className='profile-builder-steps';nav.setAttribute('aria-label','Profile builder steps');
 const heading=doc.createElement('h2');heading.className='profile-step-heading';heading.tabIndex=-1;
 const description=doc.createElement('p');description.className='profile-step-description';
 form.prepend(nav,heading,description);
 const panels=steps.map((_,i)=>{const panel=doc.createElement('section');panel.className='profile-step-panel';panel.id='profile-step-'+(i+1);panel.setAttribute('aria-label',steps[i][0]);form.insertBefore(panel,error);return panel;});
 for(const group of [...form.children].filter(el=>el.tagName==='FIELDSET')){
  const title=group.querySelector('legend')?.textContent;
  const index=title==='Build from Instagram'?0:['Featured social posts','Featured published logs','Visibility & statistics'].includes(title)?2:1;
  panels[index].append(group);
 }
 const suggestions=form.querySelector('.profile-builder-suggestions');if(suggestions)panels[1].prepend(suggestions);
 const review=doc.createElement('p');review.className='profile-review-note';review.textContent='Review your selected posts and visibility. Save keeps this draft in this browser.';panels[2].prepend(review);
 const back=doc.createElement('button');back.type='button';back.className='profile-action profile-step-back';back.textContent='Back';
 const next=doc.createElement('button');next.type='button';next.className='profile-action primary profile-step-next';
 const save=actions.querySelector('[type=submit]'),cancel=actions.querySelector('a');cancel.classList.add('profile-step-cancel');
 actions.prepend(back);actions.insertBefore(next,save);
 const buttons=steps.map(([label],i)=>{const b=doc.createElement('button');b.type='button';b.textContent=`${i+1}. ${label}`;b.setAttribute('aria-controls',panels[i].id);b.onclick=()=>show(i,true);nav.append(b);return b;});
 let current=0;
 function show(index,focus=false){
  current=index;layout.dataset.step=String(index+1);
  panels.forEach((panel,i)=>panel.hidden=i!==index);buttons.forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===index));if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  heading.textContent=steps[index][0];description.textContent=steps[index][1];back.hidden=index===0;next.hidden=index===2;save.hidden=index!==2;next.textContent=index===0?'Craft profile →':'Review profile →';
  // The full preview sits beside the form on desktop, after it on phones.
  preview.setAttribute('aria-label',index===2?'Profile review preview':'Profile draft preview');
  if(focus){heading.focus({preventScroll:true});const top=nav.getBoundingClientRect().top+doc.defaultView.scrollY-parseFloat(doc.defaultView.getComputedStyle(nav).scrollMarginTop||'0');doc.defaultView.scrollTo({top:Math.max(0,top),behavior:'instant'});}
 }
 back.onclick=()=>show(current-1,true);next.onclick=()=>show(current+1,true);
 show(0);
 return {show};
}
