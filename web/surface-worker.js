import {recolourSurface} from './surfaces.js';
self.onmessage=event=>{const {buffer,colours}=event.data;try{const pixels=new Uint8ClampedArray(buffer);recolourSurface(pixels,colours);self.postMessage({buffer:pixels.buffer},[pixels.buffer]);}catch(error){self.postMessage({error:error.message});}};
