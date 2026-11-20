export async function waitForFonts(signal:AbortSignal){
 let timer:ReturnType<typeof setTimeout>|undefined;let abort=()=>{};
 try{
  await Promise.race([window.document.fonts.ready,new Promise<never>((_resolve,reject)=>{abort=()=>reject(new Error('字体等待已取消。'));signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(new Error('字体未就绪，未生成图片，请重试。')),10000);if(signal.aborted)abort();})]);
  signal.throwIfAborted();
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
