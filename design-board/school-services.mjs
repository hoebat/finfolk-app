// School-published offerings, checked 2026-11-04. These records stay outside
// editable local demo state; they describe published courses, not a registry audit.
const item=(label,source,note)=>({label,source,...(note?{note}:{})});
const path=(agency,source,programs,note)=>({agency,source,programs,...(note?{note}:{})});
const fa='https://www.freedivingaustralia.com',aa='https://apneaaustralia.com.au',fc='https://freedivingcentral.com',os='https://oceansense.com.au',ru='https://rustyfreediving.com',ta='https://www.freedivetasmania.com';
export const SCHOOL_SERVICES={
 'freediving-australia':{
  services:[item('Discover Freediving',fa+'/discover-course','An introductory freediving experience.'),item('Beginner freediving courses',fa+'/wave-1','Theory, pool practice and open-water training.'),item('Spearfishing courses',fa+'/spearfishing-courses'),item('Course equipment hire',fa+'/wave-1','Included in the published Wave 1 package.')],
  pathways:[path('Molchanovs',fa+'/wave-1',[item('Wave 1',fa+'/wave-1')])],
 },
 'apnea-australia':{
  services:[item('Beginner to advanced freediving courses',aa+'/freediving/stage-a/'),item('Breath-hold clinics',aa+'/freediving/stage-a-2/'),item('Surf survival & breath training',aa+'/surf-survival/'),item('Instructor development',aa+'/freediving/instructor-development/'),item('Corporate breath-training workshops',aa+'/corporate/breath-training-for-performance/')],
  pathways:[path('Apnea International',aa+'/',[item('Stage A',aa+'/freediving/stage-a/'),item('Stage B',aa+'/freediving/stage-b/'),item('Stage C',aa+'/freediving/stage-c/')])],
 },
 'freediving-central':{
  services:[item('Introductory & progression courses',fc+'/shop/courses/level-1-wave-1-freediving-course/'),item('Private freediving coaching',fc+'/shop/courses/private-freediving-coaching-in-sydney-central-coast/'),item('Pool training',fc+'/shop/courses/pool-training-sydney-central-coast/'),item('Depth training',fc+'/shop/courses/depth-training-sessions-in-sydney-central-coast/'),item('Equalisation & surf-survival courses',fc+'/'),item('Spearfishing courses',fc+'/'),item('Online breath-hold course',fc+'/shop/courses/improve-breath-hold-freediving-course/'),item('Social dives & freediving trips',fc+'/'),item('Instructor training',fc+'/shop/courses/freediving-instructor-course/')],
  pathways:[
   path('Molchanovs',fc+'/molchanovs-education-system/',[item('Wave 1',fc+'/shop/courses/level-1-wave-1-freediving-course/'),item('Wave 2',fc+'/shop/courses/level-2-wave-2-freediving-course/'),item('Wave 3',fc+'/shop/courses/master-freediving-course-lake-eacham/')]),
   path('SSI',fc+'/ssi-freediving-education-system/',[item('Level 1',fc+'/shop/courses/level-1-wave-1-freediving-course/'),item('Level 2',fc+'/shop/courses/level-2-wave-2-freediving-course/'),item('Level 3',fc+'/shop/courses/master-freediving-course-lake-eacham/'),item('Freediving Instructor',fc+'/shop/courses/freediving-instructor-course/')]),
  ],
 },
 'oceansense':{
  services:[item('Beginner, advanced & master courses',os+'/learn-freediving/'),item('Pool training',os+'/freedive-training-coaching/freediving-pool-training/'),item('Private coaching',os+'/freedive-training-coaching/freediving-coaching/'),item('Equalisation workshops',os+'/learn-freediving/freediving-equalization/'),item('Spearfishing workshops',os+'/learn-freediving/freediving-for-spearfishing/'),item('Freediving retreats',os+'/freediving-retreats/'),item('Instructor training',os+'/learn-freediving/freediving-instructor-course/')],
  pathways:[
   path('SSI',os+'/learn-freediving/level-1-freediving-course/',[item('Pool Freediver',os+'/learn-freediving/level-1-freediving-course/'),item('Freediving Level 1',os+'/learn-freediving/level-1-freediving-course/'),item('Freediving Instructor',os+'/learn-freediving/freediving-instructor-course/')]),
   path('Molchanovs',os+'/learn-freediving/level-1-freediving-course/',[item('Lap 1',os+'/learn-freediving/level-1-freediving-course/'),item('Wave 1',os+'/learn-freediving/level-1-freediving-course/'),item('Freediving Instructor',os+'/learn-freediving/freediving-instructor-course/')]),
   path('PADI',os+'/learn-freediving/level-1-freediving-course/',[item('Basic Freediver',os+'/learn-freediving/level-1-freediving-course/'),item('Freediver',os+'/learn-freediving/level-1-freediving-course/')]),
  ],
  note:'Certification agency and pool or ocean options depend on the location and course selected. Ask the school which pathway your booking follows.',
 },
 'rusty-freediving':{
  services:[item('Try Freediving',ru+'/products/trial-freediving-course-perth'),item('Freediving courses',ru+'/collections/freediving-course-perth'),item('Private courses & coaching',ru+'/products/private-courses-and-coaching'),item('Pool training squads',ru+'/collections/freediving-course-perth'),item('Depth training',ru+'/'),item('Instructor training',ru+'/collections/freediving-course-perth'),item('Equipment hire',ru+'/')],
  pathways:[path('SSI',ru+'/collections/freediving-course-perth',[item('Freediving Level 1',ru+'/collections/freediving-course-perth'),item('Freediving Level 2',ru+'/collections/freediving-course-perth'),item('Freediving Level 3',ru+'/collections/freediving-course-perth'),item('Freediving Instructor',ru+'/collections/freediving-course-perth')])],
  centre:item('SSI Freediving Training Centre & Instructor Training Centre',ru+'/','Listed by Rusty Freediving on its website.'),
 },
 'freedive-tasmania':{
  services:[item('Discover Freediving',ta+'/product-page/discover-freediving'),item('Beginner & advanced freediving courses',ta+'/courses'),item('Pool training',ta+'/pool-training'),item('Freediving & women’s retreats',ta+'/product-page/freediving-retreat'),item('Guided snorkelling, seal & kelp tours',ta+'/product-page/guided-dives-and-coaching'),item('Spearfishing workshops',ta+'/product-page/spearfishing-2-day-workshop'),item('Mermaiding courses',ta+'/mermaid-courses')],
  pathways:[
   path('PADI',ta+'/product-page/padi-freediver-molchanov-wave-1',[item('Freediver',ta+'/product-page/padi-freediver-molchanov-wave-1'),item('Advanced Freediver',ta+'/product-page/padi-advanced-freediver'),item('Mermaid',ta+'/product-page/padi-mermaid'),item('Advanced Mermaid',ta+'/product-page/padi-advanced-mermaid')]),
   path('Molchanovs',ta+'/product-page/padi-freediver-molchanov-wave-1',[item('Wave 1',ta+'/product-page/padi-freediver-molchanov-wave-1'),item('Wave 2',ta+'/product-page/padi-advanced-freediver')]),
  ],
  note:'The beginner and advanced freediving courses list PADI or Molchanovs certification. Confirm your preferred pathway with the school.',
 },
};
