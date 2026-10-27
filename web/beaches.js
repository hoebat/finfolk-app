const normalise=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

export function beachesForRegion(catalog,region,query=''){
  const needle=normalise(query);
  return (catalog?.beaches||[]).filter(beach=>beach.region===region&&(!needle||[beach.name,beach.id,beach.group,...(beach.aliases||[])].some(value=>normalise(value).includes(needle)))).sort((a,b)=>a.group.localeCompare(b.group)||a.name.localeCompare(b.name));
}

export function findBeach(catalog,value){
  const key=normalise(value);if(!key)return null;
  return (catalog?.beaches||[]).find(beach=>normalise(beach.id)===key)||(catalog?.beaches||[]).find(beach=>[beach.name,...(beach.aliases||[])].some(name=>normalise(name)===key))||null;
}
