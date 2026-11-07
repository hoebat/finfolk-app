import {SCHOOL_SERVICES} from './school-services.mjs';
export function schoolServices({doc,parent,school}){
 const data=SCHOOL_SERVICES[school.id];if(!data)return;
 const el=(tag,text,host,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;host.append(n);return n;};
 const sourceLink=(text,url,host,cls)=>{const a=el('a',text+' ↗',host,cls);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const section=el('section',null,parent,'school-services');section.id='school-services';section.setAttribute('aria-label','Services and accreditations');
 el('p','FIND YOUR NEXT STEP',section,'profile-eyebrow');el('h2','Services & accreditations.',section);el('p',school.location,section,'school-services-location');
 const grid=el('div',null,section,'school-services-grid'),services=el('div',null,grid,'school-service-panel');el('h3','What you can do here',services);
 const list=el('ul',null,services,'school-service-list');
 for(const item of data.services){const li=el('li',null,list);sourceLink(item.label,item.source,li);if(item.note)el('p',item.note,li);}
 const qualifications=el('div',null,grid,'school-service-panel');el('h3','Certification pathways',qualifications);el('p','Agencies and qualifications listed by the school.',qualifications,'school-services-explainer');
 for(const pathway of data.pathways){const block=el('div',null,qualifications,'school-pathway');sourceLink(pathway.agency,pathway.source,block,'school-agency');const ul=el('ul',null,block);for(const program of pathway.programs){const li=el('li',null,ul);sourceLink(program.label,program.source,li);}if(pathway.note)el('p',pathway.note,block);}
 if(data.centre){const centre=el('div',null,qualifications,'school-centre-status');el('h4','Training-centre status',centre);sourceLink(data.centre.label,data.centre.source,centre);el('p',data.centre.note,centre);}
 if(data.note)el('p',data.note,qualifications,'school-pathway-note');
 el('p','School-published information · Checked 4 November 2026. Course availability varies; certification requires completing the selected course’s requirements.',section,'school-services-note');
}
export function schoolAgencyBadges({doc,parent,school}){
 const pathways=SCHOOL_SERVICES[school.id]?.pathways||[];const list=doc.createElement('ul');list.className='school-agency-badges';list.setAttribute('aria-label','Published certification agencies');
 for(const {agency} of pathways){const li=doc.createElement('li');li.textContent=agency;list.append(li);}parent.append(list);
}
