import {SCHOOL_WEBSITE} from './school-website.mjs';
export function schoolWebsite({doc,parent,school}){
 const items=SCHOOL_WEBSITE[school.id]||[];
 if(!items.length)return;
 const el=(tag,text,host,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;host.append(n);return n;};
 const section=el('section',null,parent,'school-website');section.id='school-stories';section.setAttribute('aria-label','From the school’s website');
 el('p','A WINDOW INTO THEIR WORLD',section,'profile-eyebrow');el('h2','Meet the school.',section);
 const grid=el('div',null,section,'school-story-grid');
 for(const item of items){
  const card=el('article',null,grid,'school-story-card'),figure=el('figure',null,card);
  const img=el('img',null,figure);img.src=item.image;img.alt=item.alt;img.loading='eager';img.decoding='async';
  el('figcaption',item.credit||'Image via '+school.name,figure);
  const body=el('div',null,card,'school-story-body');el('p',item.topic.toUpperCase(),body,'profile-eyebrow');el('h3',item.title,body);el('p',item.summary,body);
  const a=el('a','Explore with '+school.name+' ↗',body,'school-story-link');a.href=item.source;a.target='_blank';a.rel='noopener noreferrer';
 }
 el('p','Images from the school’s website; summaries by FinFolk. Details checked 4 November 2026.',section,'school-story-note');
}
export function schoolWebsitePhoto({doc,parent,school,eager=false}){
 const item=SCHOOL_WEBSITE[school.id]?.[0];if(!item)return null;
 const figure=doc.createElement('figure');figure.className='school-photo';
 const img=doc.createElement('img');img.className='school-art';img.src=item.image;img.alt=item.alt;img.loading='eager';img.decoding='async';if(eager)img.fetchPriority='high';
 const caption=doc.createElement('figcaption'),a=doc.createElement('a');a.textContent='Image via '+school.name+' ↗';a.href=item.source;a.target='_blank';a.rel='noopener noreferrer';caption.append(a);figure.append(img,caption);parent.append(figure);return figure;
}
