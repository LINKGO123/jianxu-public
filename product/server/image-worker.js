import {parentPort,workerData} from 'node:worker_threads';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {imageSize} from '../shared/image-size.js';
try{
 const bytes=Buffer.from(workerData.bytes);imageSize(bytes,workerData.mime);
 const image=await loadImage(bytes);
 if(!image.width||!image.height||image.width*image.height>24000000)throw new Error('像素超限');
 const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const png=canvas.toBuffer('image/png');if(png.length>15*1024*1024)throw new Error('编码超限');
 parentPort.postMessage({base64:png.toString('base64'),width:image.width,height:image.height});
}catch{parentPort.postMessage({error:'照片签名、解码或大小无效。'});}
