import { imageSize } from './image.js';
self.onmessage=async(event:MessageEvent<Blob>)=>{try{
    imageSize(new Uint8Array(await event.data.arrayBuffer()),event.data.type);
    const bitmap=await createImageBitmap(event.data);
    if(bitmap.width*bitmap.height>24000000){bitmap.close();throw new Error('照片解码像素超出限制。');}
    self.postMessage({bitmap},{transfer:[bitmap]});
}catch(error){self.postMessage({error:error instanceof Error?error.message:'照片无法解码。'});}};
