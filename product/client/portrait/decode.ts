export function decodePhoto(blob:Blob,signal:AbortSignal) {
    return new Promise<ImageBitmap>((resolve,reject)=>{
        if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>15*1024*1024){reject(new Error('照片类型或大小不支持。'));return;}
        const worker=new Worker(new URL('./image.worker.ts',import.meta.url),{type:'module'});
        let settled=false;
        const timeout=setTimeout(()=>finish(new Error('照片解码超时，已停止。')),20000);
        function finish(error?:Error,bitmap?:ImageBitmap){if(settled){bitmap?.close();return;}settled=true;clearTimeout(timeout);worker.terminate();signal.removeEventListener('abort',abort);if(error)reject(error);else if(bitmap)resolve(bitmap);}
        function abort(){finish(new Error('已取消照片读取。'));}signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
        worker.onmessage=(event:MessageEvent<unknown>)=>{const value=event.data;if(value&&typeof value==='object'&&'bitmap' in value&&value.bitmap instanceof ImageBitmap)finish(undefined,value.bitmap);else finish(new Error(value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:'照片解码失败。'));};
        worker.onerror=()=>finish(new Error('照片解码器无法运行。'));worker.postMessage(blob);
    });
}
