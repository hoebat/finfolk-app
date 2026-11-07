export const PAGE_ACCOUNTS={tideline:{id:'ig-tideline',handle:'tideline.example'},saltwater:{id:'ig-saltwater',handle:'saltwater.example'},maya:{id:'ig-maya',handle:'maya.example'}};
export const normalizeConnectCode=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'');
export function pageAccount(page){return page.instagramAccount||PAGE_ACCOUNTS[page.id]||null;}
