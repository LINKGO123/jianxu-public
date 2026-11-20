import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {faceTransform,drawFaceComposite,type FaceFrame} from '../client/portrait-ai/face-composite.js';
const source:FaceFrame={width:200,height:300,eyes:[{x:.3,y:.4},{x:.7,y:.4}]},target:FaceFrame={width:200,height:300,eyes:[{x:.4,y:.35},{x:.6,y:.35}]};
test('local face placement maps both eyes exactly and rejects reversed, coincident or invalid points',()=>{
 for(const eyes of [source.eyes,[{x:.3,y:.42},{x:.7,y:.38}]] as FaceFrame['eyes'][]){
  const frame={...source,eyes},m=faceTransform(frame,target);
  for(let i=0;i<2;i++){const x=eyes[i].x*frame.width,y=eyes[i].y*frame.height;assert.ok(Math.abs(m.a*x-m.b*y+m.x-target.eyes[i].x*target.width)<1e-8);assert.ok(Math.abs(m.b*x+m.a*y+m.y-target.eyes[i].y*target.height)<1e-8);}
 }
 for(const eyes of [[{x:.7,y:.4},{x:.3,y:.4}],[{x:.4,y:.4},{x:.4,y:.4}],[{x:NaN,y:.4},{x:.7,y:.4}]] as FaceFrame['eyes'][])assert.throws(()=>faceTransform({...source,eyes},target));
});
test('real Canvas face composite keeps outside template pixels, copies source face pixels and feathers only the boundary',()=>{
 const original=createCanvas(200,300),style=createCanvas(200,300),output=createCanvas(1,1);original.getContext('2d').fillStyle='#ff0000';original.getContext('2d').fillRect(0,0,200,300);style.getContext('2d').fillStyle='#0000ff';style.getContext('2d').fillRect(0,0,200,300);
 drawFaceComposite(output as unknown as HTMLCanvasElement,original as unknown as CanvasImageSource,style as unknown as CanvasImageSource,source,target,(w,h)=>createCanvas(w,h) as unknown as HTMLCanvasElement);
 const ctx=output.getContext('2d'),pixel=(x:number,y:number)=>Array.from(ctx.getImageData(x,y,1,1).data);
 assert.deepEqual([output.width,output.height],[200,300]);assert.deepEqual(pixel(5,5),[0,0,255,255]);assert.deepEqual(pixel(100,120),[255,0,0,255]);const edge=pixel(139,116);assert.ok(edge[0]>0&&edge[0]<255&&edge[2]>0&&edge[2]<255);assert.deepEqual(pixel(195,295),[0,0,255,255]);
});
