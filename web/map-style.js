// A navy ocean chart with legible blue/aqua survey contours.
export const OCEAN_COLOUR='#06162e';
export const DEPTH_COLOURS=[[0,[174,231,228]],[5,[83,196,218]],[10,[39,150,201]],[20,[29,96,158]],[30,[23,58,110]],[50,[6,22,46]]];
export function contourColour(depth){
  const stops=[[0,'#aee7e4'],[5,'#53c4da'],[10,'#62b8e8'],[20,'#87a9e2'],[30,'#abbce8'],[50,'#ccc9ef']];
  return stops.find(([limit])=>depth<=limit)?.[1]||stops.at(-1)[1];
}
export const isWaterPixel=(r,g,b)=>b-r>20&&g-r>8&&g>130&&b>145&&r<225;
export function styleShorePixels(pixels){
  // Style the existing OSM chart, preserving its shoreline geometry and labels.
  // This is cartographic water colour, never a bathymetric measurement.
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(isWaterPixel(r,g,b)){pixels[i]=6;pixels[i+1]=22;pixels[i+2]=46;}
    else{const shade=1-(.2126*r+.7152*g+.0722*b)/255;pixels[i]=Math.round(54+shade*67);pixels[i+1]=Math.round(69+shade*77);pixels[i+2]=Math.round(91+shade*88);}
  }
  return pixels;
}
export function shoreTile(image){
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;const m=mask.getContext('2d'),data=m.createImageData(mask.width,mask.height);for(let i=0;i<pixels.data.length;i+=4){const p=pixels.data;data.data[i+3]=isWaterPixel(p[i],p[i+1],p[i+2])?p[i+3]:0;}m.putImageData(data,0,0);canvas.waterMask=mask;
  styleShorePixels(pixels.data);context.putImageData(pixels,0,0);return canvas;
}
