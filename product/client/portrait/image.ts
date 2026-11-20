export {imageSize} from '../../shared/image-size.js';
export type Crop={x:number;y:number;zoom:number;rotation:number;ratio:'3:4'|'1:1'};
export function cropGeometry(sourceWidth:number,sourceHeight:number,width:number,height:number,crop:Crop) {
    if(![sourceWidth,sourceHeight,width,height].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(crop.zoom)||crop.zoom<1||crop.zoom>5||![0,90,180,270].includes(crop.rotation)||![crop.x,crop.y].every(Number.isFinite))throw new Error('裁切参数无效。');
    const swap=crop.rotation%180!==0,rw=swap?sourceHeight:sourceWidth,rh=swap?sourceWidth:sourceHeight;
    const scale=Math.max(width/rw,height/rh)*crop.zoom;
    const x=Math.max(-(rw*scale-width)/2,Math.min((rw*scale-width)/2,crop.x*width));
    const y=Math.max(-(rh*scale-height)/2,Math.min((rh*scale-height)/2,crop.y*height));
    return {scale,x,y,crop:{...crop,x:x/width,y:y/height}};
}
export function drawCrop(canvas:HTMLCanvasElement,image:ImageBitmap,crop:Crop) {
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境无法绘制照片。');
    const geometry=cropGeometry(image.width,image.height,canvas.width,canvas.height,crop);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2+geometry.x,canvas.height/2+geometry.y);ctx.rotate(crop.rotation*Math.PI/180);ctx.drawImage(image,-image.width*geometry.scale/2,-image.height*geometry.scale/2,image.width*geometry.scale,image.height*geometry.scale);ctx.restore();return geometry.crop;
}
export function canvasBlob(canvas:HTMLCanvasElement) {
    return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片编码失败，未保存或下载空白图。')),'image/png'));
}

export function assertPhotoFile(file:File){const formats:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};const extension=file.name.toLowerCase().split('.').pop();if(!extension||formats[extension]!==file.type)throw new Error('照片扩展名与类型不匹配，请使用 JPEG、PNG 或 WebP。');}
