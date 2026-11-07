// Regional creative identities, not exclusive ranges or a marine hazard guide.
// Small Australian coastal species, supported by local collections and authorities.
export const STATE_MOTIFS=Object.freeze([
 {state:'NSW',name:'New South Wales',animal:'bluebottle',species:'Physalia spp.',size:'Float 2–15 cm',hazard:'Stinging tentacles',source:'https://australian.museum/learn/animals/jellyfish/bluebottle/'},
 {state:'VIC',name:'Victoria',animal:'octopus',species:'Hapalochlaena maculosa',size:'Mantle about 6 cm',hazard:'Venomous bite',source:'https://vfa.vic.gov.au/commercial-fishing/commercial-fishing-guide-and-supplements/Octopus-supplement.pdf'},
 {state:'QLD',name:'Queensland',animal:'bluedragon',species:'Glaucus atlanticus',size:'About 4 cm',hazard:'Retains stinging cells from its prey',source:'https://collections.museumsvictoria.com.au/specimens/607047',hazardSource:'https://www.surg.org.au/species/glaucus-atlanticus-forster-1777/'},
 {state:'WA',name:'Western Australia',animal:'conesnail',species:'Fish-eating Conus species',size:'Around 10 cm',hazard:'Venomous harpoon',source:'https://museum.wa.gov.au/explore/blogs/katherine-veness/west-coast-marine-molluscs/index.html',hazardSource:'https://www.aims.gov.au/docs/projectnet/cone-shell.html'},
 {state:'SA',name:'South Australia',animal:'toadfish',species:'Tetractenos glaber',size:'Up to 15 cm',hazard:'Toxic if eaten',source:'https://australian.museum/learn/animals/fishes/smooth-toadfish/'},
 {state:'TAS',name:'Tasmania',animal:'seaurchin',species:'Heliocidaris erythrogramma',size:'Up to 14 cm',hazard:'Puncturing spines',source:'https://fishing.tas.gov.au/species/sea-urchin-shortspined'},
 {state:'NT',name:'Northern Territory',animal:'irukandji',species:'Irukandji jellyfish',size:'Bell about 1–2 cm',hazard:'Venomous sting',source:'https://health.nt.gov.au/public-health-notifiable-diseases/irukandji-syndrome',hazardSource:'https://lifesaving.com.au/safety-info/marine-stingers'},
].map(Object.freeze));
export function stateMotif(id){return STATE_MOTIFS.find(motif=>motif.state===(id==='JBT'?'NSW':id))||null;}
