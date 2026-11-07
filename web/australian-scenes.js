const places=[
 ['ningaloo','Ningaloo Reef','WA','.landing-hero'],
 ['great-barrier','Great Barrier Reef','QLD','.landing-story'],
 ['julian-rocks','Julian Rocks','NSW','.landing-social-feature'],
 ['port-phillip','Port Phillip Heads','VIC','.landing-regulars-feature'],
 ['bicheno','Bicheno','TAS','.landing-conditions'],
 ['point-lowly','Point Lowly','SA','.landing-last'],
];
export const AUSTRALIAN_SCENES=Object.freeze(places.map(([slug,name,state,section])=>({id:slug+'-acid',name:name+' · '+state,asset:'finfolk-underwater-'+slug+'-acid-v1',caption:name+' / '+state,note:'An underwater illustration inspired by '+name+'.',alt:'Illustrated underwater environment inspired by '+name+', '+state+'.',section,focus:'55% 50%',mobileFocus:'60% 50%',slug})));
export function landingSceneURL(scene,palette,mobile=false){return new URL('./scene-'+scene.slug+'-'+palette+(mobile?'-mobile':'')+'-v1.webp',import.meta.url).href;}
