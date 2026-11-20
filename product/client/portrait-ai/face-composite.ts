export type Point={x:number;y:number};
export type Eyes=[Point,Point];
export type FaceFrame={width:number;height:number;eyes:Eyes};
export function faceTransform(source:FaceFrame,target:FaceFrame){
 for(const frame of [source,target])for(const p of frame.eyes)if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw new Error('双眼位置需在照片范围内。');
 const [sl,sr]=source.eyes.map(p=>({x:p.x*source.width,y:p.y*source.height})),[tl,tr]=target.eyes.map(p=>({x:p.x*target.width,y:p.y*target.height}));
 const sx=sr.x-sl.x,sy=sr.y-sl.y,tx=tr.x-tl.x,ty=tr.y-tl.y,den=sx*sx+sy*sy,distance=Math.hypot(tx,ty);
 if(Math.sqrt(den)<8||distance<8||sx<=0||tx<=0)throw new Error('请按画面从左到右标记两只眼睛，并拉开距离。');
 const a=(tx*sx+ty*sy)/den,b=(ty*sx-tx*sy)/den;
 return {a,b,x:tl.x-a*sl.x+b*sl.y,y:tl.y-b*sl.x-a*sl.y,cx:(tl.x+tr.x)/2,cy:(tl.y+tr.y)/2+distance*.28,rx:distance*1.05,ry:distance*1.45};
}
export function drawFaceComposite(output:HTMLCanvasElement,source:CanvasImageSource,template:CanvasImageSource,sourceFrame:FaceFrame,targetFrame:FaceFrame,makeCanvas=(width:number,height:number)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;}){
 const placement=faceTransform(sourceFrame,targetFrame);
 output.width=targetFrame.width;output.height=targetFrame.height;
 const ctx=output.getContext('2d'),layer=makeCanvas(output.width,output.height),face=layer.getContext('2d');
 if(!ctx||!face)throw new Error('当前环境无法预合成人脸。');
 ctx.drawImage(template,0,0,output.width,output.height);
 face.setTransform(placement.a,placement.b,-placement.b,placement.a,placement.x,placement.y);face.drawImage(source,0,0);face.resetTransform();
 face.globalCompositeOperation='destination-in';face.translate(placement.cx,placement.cy);face.scale(placement.rx,placement.ry);
 const feather=face.createRadialGradient(0,0,.82,0,0,1);feather.addColorStop(0,'#fff');feather.addColorStop(1,'#ffffff00');face.fillStyle=feather;face.fillRect(-1,-1,2,2);
 ctx.drawImage(layer,0,0);
 return placement;
}
