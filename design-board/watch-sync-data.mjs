// Proposed journeys, not live integrations or verified vendor interface replicas.
export const WATCH_JOURNEYS = [
 {id:'garmin',name:'Garmin',device:'Descent',app:'Garmin Connect',tag:'Connect once / proposed',intro:'Your Descent records it. Your logbook keeps it.',requirement:'Requires Garmin access and validation of complete freediving records.',steps:[
  ['Choose your connection.','Open Watch connections in your FinFolk logbook and choose Garmin.','connect','Connect Garmin'],
  ['Give FinFolk permission.','Sign in with Garmin and choose whether to allow access to your activities. You can disconnect later.','permission','Garmin account'],
  ['Dive as you usually do.','Record your session on your Descent, then let it sync with Garmin Connect on your phone.','watch','Sync with Garmin Connect'],
  ['Let the session come to you.','Once Garmin makes the activity available, FinFolk receives it and adds the recorded dives.','transfer','Receiving your session'],
  ['Back on shore. Already in your logbook.','Your session arrives privately. Confirm the dive site, add a story and choose what to share.','ready','Private session']
 ]},
 {id:'suunto',name:'Suunto',device:'Ocean',app:'Suunto app',tag:'Connect once / proposed',intro:'From your Suunto to your own little corner of the coast.',requirement:'Requires Suunto partner access and device-specific dive validation.',steps:[
  ['A home for your Suunto dives.','Choose Suunto in Watch connections in your FinFolk logbook.','connect','Connect Suunto'],
  ['You decide what connects.','Sign in with Suunto and approve the connection to FinFolk.','permission','Suunto account'],
  ['Finish your dive. Sync as usual.','Record on your Ocean and let the session reach the Suunto app on your phone.','watch','Sync with Suunto'],
  ['No file to move.','Suunto tells FinFolk a session is available. FinFolk retrieves the record and prepares your dives.','transfer','Receiving your session'],
  ['The dives, all together.','Review the private session, confirm its location and bring your notes and photos alongside it.','ready','Private session']
 ]},
 {id:'apple',name:'Apple Watch',device:'Watch Ultra',app:'Apple Health',tag:'iPhone companion / concept',intro:'A small bridge between your iPhone and your logbook.',requirement:'Concept to validate: depends on the recording app’s Health data. Full Oceanic+ profiles are not confirmed.',steps:[
  ['Start on your iPhone.','The proposed FinFolk companion app connects your iPhone to your FinFolk account.','connect','FinFolk for iPhone'],
  ['Choose your Health permissions.','Allow access to the underwater records you want to bring into FinFolk. Available data depends on your recording app.','permission','Apple Health'],
  ['Keep using your watch app.','Record with your usual dive app. It must save the relevant underwater data to Apple Health.','watch','Save to Apple Health'],
  ['Your iPhone carries it across.','The companion checks for new permitted records and uploads them when iOS allows. Sync may take a little time.','transfer','Checking available records'],
  ['See what came through.','Review the available readings in a private session. Missing profiles stay missing; use an export for fuller records where available.','ready','Review available readings']
 ]},
 {id:'file',name:'Import a file',device:'Dive watch',app:'Your dive app',tag:'Any supported export / proposed',intro:'Older dives. Another watch. Still your story.',requirement:'Planned formats: Garmin FIT, Suunto FIT/JSON, UDDF and Subsurface XML. Compatibility must be verified with real exports.',steps:[
  ['Start with your dive app.','Sync your watch with its usual app and open the session you want to bring across.','connect','Open your dive app'],
  ['Export the dive record.','Use your app’s export option. The format depends on the app: for example FIT or UDDF.','permission','Export your session'],
  ['Bring the file to FinFolk.','Save the export to Files, then choose it from Import watch data in your FinFolk logbook.','watch','Choose an export'],
  ['Check before you save.','Preview the dives, units, dates and any missing readings. Possible duplicates are flagged for review.','transfer','Review your import'],
  ['Make it part of your logbook.','Confirm the import to create a private session or attach the record to an existing outing.','ready','Save private session']
 ]}
];
