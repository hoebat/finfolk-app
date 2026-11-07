import {makePreviewClient,SAMPLE_USER_ID} from '/board/preview-data.mjs';
let client;
export async function createLogbookClient(){
 if(!client){
  const screen=new URL(location.href).searchParams.get('atelier-screen');
  client=makePreviewClient({guest:screen==='signin'||screen==='welcome'});
  try{localStorage.setItem('finfolk:member-tour:3:'+SAMPLE_USER_ID,'1');}catch{}
 }
 return client;
}
