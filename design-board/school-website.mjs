// Website selections checked 2026-11-04. Images are local, optimised copies;
// exact image URLs and source pages are recorded in assets/schools/sources.json.
// Editorial summaries below are written for FinFolk, not quoted school posts.
const photo=(school,name,alt)=>({image:`/board/assets/schools/${school}-${name}.webp`,alt});
export const SCHOOL_WEBSITE={
 'freediving-australia':[
  {...photo('freediving-australia','community','Freedivers suspended beneath the surface beside underwater rock walls.'),topic:'Their community',title:'A family built around the water.',summary:'Founded by Adam Stern, Freediving Australia is part of Freediving Family. Its Australian courses centre on learning together, building confidence and finding a community in the ocean.',source:'https://www.freedivingaustralia.com/'},
  {...photo('freediving-australia','courses','A freediver resting at the surface beside a red float and a rocky shoreline.'),topic:'First steps',title:'From a first taste to Wave 1.',summary:'Discover Freediving and Molchanovs Wave 1 are the school’s main beginner pathways, with courses offered across several Australian locations.',source:'https://www.freedivingaustralia.com/'},
 ],
 'apnea-australia':[
  {...photo('apnea-australia','foundations','An instructor supporting a student during a pool breath-hold session.'),topic:'Stage A',title:'Start with the foundations.',summary:'Stage A brings together pool practice and two open-water sessions. The course covers buddy skills, efficient movement and equalisation as part of the Apnea International pathway.',source:'https://apneaaustralia.com.au/freediving/stage-a/'},
  {...photo('apnea-australia','training','A freediver moving underwater in a swimming pool, with another diver alongside.'),topic:'Learning together',title:'Pool practice, then open water.',summary:'Static and dynamic sessions form part of Stage A. Training-session planning and the different roles of diver and buddy are included in the course.',source:'https://apneaaustralia.com.au/freediving/stage-a/'},
 ],
 'freediving-central':[
  {...photo('freediving-central','courses','A freediver moving beside a submerged rock wall in clear turquoise water.'),topic:'Learn on your coast',title:'A pathway into the blue.',summary:'Freediving Central offers courses from introductory experiences through advanced and instructor training, with Sydney, the Central Coast and Jervis Bay among its locations.',source:'https://freedivingcentral.com/'},
  {...photo('freediving-central','community','A group of freedivers together on a grassy shoreline beside a calm bay.'),topic:'Keep showing up',title:'More time with your water people.',summary:'Pool sessions, depth training, private coaching and social dives give the community ways to keep learning beyond a course. The school also organises freediving trips.',source:'https://freedivingcentral.com/'},
 ],
 'oceansense':[
  {...photo('oceansense','courses','A freediver gliding above coral in clear blue water.'),topic:'Meet the school',title:'Small groups. Room to learn.',summary:'OceanSense focuses on freediving, with courses from beginner to master level. Its website emphasises small classes and individual attention from experienced instructors.',source:'https://oceansense.com.au/'},
  {...photo('oceansense','retreats','OceanSense retreat participants gathered around a long outdoor table in Bali.'),topic:'Away together',title:'Take your practice somewhere new.',summary:'OceanSense’s retreat programme combines new dive locations with guided learning. Its destinations include Amed in Bali and the Whitsundays, with trips for different experience levels.',source:'https://oceansense.com.au/freediving-retreats/'},
 ],
 'rusty-freediving':[
  {...photo('rusty-freediving','coaching','An instructor in the water beside training floats, with waterfront buildings behind.'),topic:'Perth, WA',title:'Coaching with a personal focus.',summary:'Rusty Freediving offers SSI courses, pool and depth training, and private coaching in Perth. The school describes a tailored approach that works with each diver’s goals.',source:'https://rustyfreediving.com/'},
  {...photo('rusty-freediving','courses','SSI Freediver course artwork showing a freediver above a reef.'),topic:'Course pathway',title:'Find your next step.',summary:'The school lists Try Freediving, Level 1, Level 2 and Level 3 courses, alongside private courses and coaching. Check with Rusty for current dates and availability.',source:'https://rustyfreediving.com/',credit:'SSI course artwork via Rusty Freediving'},
 ],
 'freedive-tasmania':[
  {...photo('freedive-tasmania','kelp','A seal swimming through a kelp forest in Tasmania.'),topic:'Tasmania underwater',title:'A whole world in the kelp.',summary:'Freedive Tasmania introduces visitors to local waters through experiences including seal-colony and giant-kelp-forest tours, alongside freediving and mermaiding courses.',source:'https://www.freedivetasmania.com/'},
  {...photo('freedive-tasmania','freediving','A freediver descending along a training line beneath a surface float.'),topic:'Build your practice',title:'Your next breath of adventure.',summary:'Discover Freediving, PADI Freediver and advanced courses sit alongside retreats and guided snorkelling. The school’s public offering brings learning and Tasmania’s underwater environments together.',source:'https://www.freedivetasmania.com/'},
 ],
};
