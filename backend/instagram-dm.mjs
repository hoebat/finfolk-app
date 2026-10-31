// Compatibility exports; all DM processing uses the versioned messaging engine.
export { parseInstagramCommand, commandHelp } from './instagram-dm-commands.mjs';
export { collectInstagramDM, processInstagramDM, reconcileInstagramDM } from './messaging-engine.mjs';
import { InstagramProvider } from './instagram-provider.mjs';
export const instagramSender=(sender,env,fetcher=fetch)=>new InstagramProvider({graphVersion:env.INSTAGRAM_MESSAGING_GRAPH_VERSION || env.INSTAGRAM_GRAPH_VERSION || 'v26.0',token:env.INSTAGRAM_MESSAGING_ACCESS_TOKEN || env.INSTAGRAM_ACCESS_TOKEN},fetcher).profile(sender);
