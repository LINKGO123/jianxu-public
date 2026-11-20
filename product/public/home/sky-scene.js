/* A single lossless texture, regional motion, one pausable clock. No generated frames. */
(()=>{
  'use strict';
  const hero=document.querySelector('.hero'),scene=document.querySelector('.sky-scene');
  let canvas=document.querySelector('#sky-canvas');
  const button=document.querySelector('#sky-motion-toggle');
  const label=document.querySelector('#sky-motion-label'),root=document.documentElement;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const params=new URLSearchParams(location.search),still=params.has('still'),capture=params.has('capture');
  if(params.has('scene-only'))root.classList.add('sky-inspect');
  let gl,program,image,frame=0,previous=0,elapsed=0,visible=true,ready=false,paused=false,failed=false,introStarted=false;
  let enterTimer,resourceTimer,ro,observer;
  const uniforms={};
  let renderer="static",context2d,skyMask,waterMask,chairMask,motionSource,layer,layerContext;
  const svgNS="http://www.w3.org/2000/svg";
  const waveOverlay=document.createElementNS(svgNS,"svg");waveOverlay.classList.add("sky-water-waves");waveOverlay.setAttribute("aria-hidden","true");
  const waveRings=Array.from({length:1},()=>{const ring=document.createElementNS(svgNS,"ellipse");ring.setAttribute("fill","none");ring.setAttribute("stroke","#e8f9ff");ring.setAttribute("stroke-width","1");waveOverlay.append(ring);return ring;});
  // Wave crests pass behind the chair, rather than drawing white lines over its wood.
  const defs=document.createElementNS(svgNS,'defs'),waveMask=document.createElementNS(svgNS,'mask');
  waveMask.id='chair-wave-occlusion';waveMask.setAttribute('maskUnits','userSpaceOnUse');waveMask.setAttribute('x','0');waveMask.setAttribute('y','0');waveMask.setAttribute('width','1672');waveMask.setAttribute('height','941');
  const white=document.createElementNS(svgNS,'rect');white.setAttribute('width','1672');white.setAttribute('height','941');white.setAttribute('fill','white');waveMask.append(white);
  const wood=document.createElementNS(svgNS,'path');wood.setAttribute('fill','black');
  wood.setAttribute('d','M1192 609L1332 611L1334 633L1192 630Z M1195 622L1207 622L1197 714L1187 714Z M1239 627L1251 627L1258 713L1246 713Z M1270 609L1282 609L1294 723L1281 723Z M1317 612L1330 612L1346 716L1334 716Z');waveMask.append(wood);defs.append(waveMask);waveOverlay.append(defs);
  waveRings.forEach(ring=>ring.setAttribute('mask','url(#chair-wave-occlusion)'));
  scene.append(waveOverlay);
  const vertex=`attribute vec2 a_position;varying vec2 v_uv;
    void main(){v_uv=vec2((a_position.x+1.0)*0.5,(1.0-a_position.y)*0.5);gl_Position=vec4(a_position,0.0,1.0);}`;
  const fragment=`precision mediump float;
    varying vec2 v_uv;uniform sampler2D u_image;uniform vec2 u_view;uniform vec2 u_imageSize;
    uniform float u_intro;uniform float u_time;uniform float u_still;uniform float u_align;
    const float PI=3.14159265359;const float H=0.627;
    float box(vec2 p,vec2 lo,vec2 hi,float f){vec2 a=smoothstep(lo-vec2(f),lo,p);vec2 b=1.0-smoothstep(hi,hi+vec2(f),p);return a.x*a.y*b.x*b.y;}
    float solidChair(vec2 uv,vec3 rgb){
      float luminance=dot(rgb,vec3(0.2126,0.7152,0.0722));
      float wood=(1.0-smoothstep(0.68,0.84,luminance))*smoothstep(-0.055,0.015,rgb.r-rgb.b);
      return box(uv,vec2(0.708,0.553),vec2(0.805,0.765),0.0018)*wood;
    }
    void main(){
      float scale=max(u_view.x/u_imageSize.x,u_view.y/u_imageSize.y);
      vec2 span=u_view/(u_imageSize*scale);
      vec2 uv=vec2((1.0-span.x)*u_align,(1.0-span.y)*0.5)+v_uv*span;
      vec4 original=texture2D(u_image,uv);
      if(u_still>0.5){gl_FragColor=original;return;}
      float introLand=smoothstep(1.8,2.4,u_intro);
      float water=smoothstep(H-0.002,H+0.002,uv.y);
      // A reflected cloud samples the same displacement as its source above the horizon.
      vec2 above=vec2(uv.x,mix(uv.y,2.0*H-uv.y,water));
      float luminance=dot(original.rgb,vec3(0.2126,0.7152,0.0722));
      float wood=(1.0-smoothstep(0.68,0.84,luminance))*smoothstep(-0.055,0.015,original.r-original.b);
      float chair=box(uv,vec2(0.708,0.553),vec2(0.805,0.765),0.0018)*wood;
      float chairReflection=box(uv,vec2(0.696,0.766),vec2(0.813,0.973),0.018);
      float reflectionInk=1.0-smoothstep(0.52,0.76,dot(original.rgb,vec3(0.2126,0.7152,0.0722)));
      float objectMask=max(chair,chairReflection*reflectionInk);
      // All cloud regions share one wind field; height only changes perspective speed.
      float depth=0.22+0.78*smoothstep(0.02,0.48,H-above.y);
      float mask=(1.0-objectMask);
      vec2 shift=vec2(0.028*sin(2.0*PI*u_time/120.0),0.0008*sin(2.0*PI*u_time/60.0));
      shift*=mask*depth*introLand;shift.y*=mix(1.0,-1.0,water);
      // Perspective-flattened wave fronts originate at the chair's water contact.
      vec2 radial=vec2(uv.x-0.757,(uv.y-0.766)*2.5);
      float distance=length(radial),ripple=0.0,crest=0.0;
      float rippleStrength=smoothstep(0.0,1.5,u_time)*(1.0-smoothstep(118.0,120.0,u_time));
      for(int i=0;i<1;i++){
        float age=mod(u_time+float(i)*10.0,10.0);
        float radius=0.007+min(age,5.5)*0.014;
        float fade=smoothstep(0.0,0.8,age)*(1.0-smoothstep(3.5,5.5,age));
        float delta=(distance-radius)/0.007;
        float band=exp(-delta*delta)*fade;
        ripple+=band*sin(delta*2.0);crest+=band;
      }
      float rippleArea=smoothstep(H+0.01,H+0.04,uv.y)*(1.0-chair)*rippleStrength*introLand;
      vec2 direction=radial/max(distance,0.001);
      shift+=vec2(direction.x,direction.y/2.5)*ripple*0.0010*rippleArea;
      // The chair itself stays still. Its reflection is water, so it refracts too.
      float waterDepth=smoothstep(H,0.96,uv.y);
      float waterArea=water*(1.0-chair)*rippleStrength*introLand;
      float swell=sin(uv.y*65.0-u_time*2.0*PI/12.0)+0.4*sin(uv.y*115.0+u_time*2.0*PI/20.0);
      shift.x+=swell*0.0009*waterDepth*waterArea;
      shift.y+=sin(uv.y*85.0-u_time*2.0*PI/12.0)*0.0003*waterDepth*waterArea;
      float reflectionBend=chairReflection*smoothstep(0.758,0.9,uv.y)*waterArea;
      shift.x+=0.0014*sin(uv.y*80.0-u_time*2.0*PI/15.0)*reflectionBend;
      shift.y+=0.0004*sin(uv.y*66.0-u_time*2.0*PI/20.0)*reflectionBend;
      vec2 sampleUV=clamp(uv+shift,vec2(0.001),vec2(0.999));
      vec4 color=texture2D(u_image,sampleUV);
      // Check both ends of the sample: moving background may never import a second chair.
      if(solidChair(uv,original.rgb)>0.10||solidChair(sampleUV,color.rgb)>0.10){
        sampleUV=uv;color=original;
      }
      float horizonFog=exp(-abs(uv.y-H)*110.0)*(1.0-objectMask);
      float fogWave=sin(2.0*PI*u_time/20.0)*0.004;
      float chairLight=sin(2.0*PI*u_time/30.0)*0.008*objectMask;
      color.rgb+=introLand*(vec3(fogWave)*horizonFog+color.rgb*chairLight);
      color.rgb+=vec3(0.011,0.014,0.016)*crest*rippleArea;
      // The landscape resolves by region. No layer extraction or fabricated hidden scenery.
      float skyReveal=smoothstep(0.0,0.9,u_intro-0.08*(1.0-uv.y));
      float waterReveal=smoothstep(0.4,1.4,u_intro);
      float chairReveal=smoothstep(0.9,1.8,u_intro);
      float reveal=mix(skyReveal,waterReveal,water);
      reveal=mix(reveal,chairReveal,objectMask);
      vec3 empty=vec3(0.514,0.784,0.961);
      gl_FragColor=vec4(mix(empty,color.rgb,reveal),1.0);
    }`;
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;previous=0;}
  function updateButton(){button.setAttribute('aria-pressed',String(paused));label.textContent=paused?'播放背景动画':'暂停背景动画';}
  function fallback(){
    if(failed)return;
    stop();
    if(image?.naturalWidth&&renderer!=="canvas2d"){
      try{installCanvas();return;}catch{}
    }
    failed=true;ready=false;clearTimeout(resourceTimer);clearTimeout(enterTimer);
    root.classList.remove('sky-pending','sky-entering');scene.dataset.renderer='static';button.hidden=true;
  }
  function shader(type,source){
    const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
    if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){gl.deleteShader(item);throw Error('Sky shader could not compile');}
    return item;
  }
  function draw(){
    if(!ready)return;
    drawWaveOverlay();
    if(renderer==="canvas2d"){drawCanvas();return;}
    if(gl.isContextLost())return;
    gl.useProgram(program);gl.uniform1f(uniforms.u_intro,Math.min(2.4,elapsed));
    gl.uniform1f(uniforms.u_time,Math.max(0,elapsed-2.4)%120);
    gl.uniform1f(uniforms.u_still,still||motion.matches?1:0);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function resize(){
    if(!ready)return;
    const rect=hero.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,innerWidth<=640?1.25:1.5);
    const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;if(renderer==="webgl")gl.viewport(0,0,width,height);}
    if(renderer==="canvas2d"){draw();return;}
    gl.useProgram(program);gl.uniform2f(uniforms.u_view,width,height);gl.uniform1f(uniforms.u_align,innerWidth<=640?0.78:0.5);draw();
  }
  function shouldRun(){return ready&&!failed&&!still&&!capture&&!paused&&!motion.matches&&visible&&!document.hidden;}
  function tick(now){
    frame=0;if(!shouldRun()){previous=0;return;}
    if(!previous)previous=now;
    const dt=now-previous;
    // Rendering is limited to 30fps (24fps on phones), the clock pauses off screen.
    if(dt>=1000/(innerWidth<=640?24:30)-1){elapsed+=Math.min(dt,100)/1000;previous=now;draw();}
    frame=requestAnimationFrame(tick);
  }
  function sync(){stop();if(!ready)return;draw();if(shouldRun())frame=requestAnimationFrame(tick);}
  function startIntro(){
    if(introStarted||!ready||(!visible&&!still&&!motion.matches))return;
    introStarted=true;root.classList.remove('sky-pending');
    if(still||motion.matches||capture){elapsed=still||motion.matches?2.4:0;draw();return;}
    root.classList.add('sky-entering');
    enterTimer=setTimeout(()=>root.classList.remove('sky-entering'),3000);
  }
  function install(){
    if(params.get('renderer')==='canvas')throw Error('Canvas renderer requested');
    gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:capture});
    if(!gl)throw Error('WebGL unavailable');
    program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Sky shader could not link');
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const attribute=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Sky texture upload failed');
    for(const name of ['u_view','u_imageSize','u_intro','u_time','u_still','u_align'])uniforms[name]=gl.getUniformLocation(program,name);
    gl.uniform1i(gl.getUniformLocation(program,'u_image'),0);gl.uniform2f(uniforms.u_imageSize,image.naturalWidth,image.naturalHeight);
    activate('webgl');
  }
  function activate(kind){
    renderer=kind;ready=true;failed=false;clearTimeout(resourceTimer);resize();scene.dataset.renderer=kind;
    button.hidden=still||motion.matches;updateButton();startIntro();sync();
    window.__skyScene={
      seek(seconds){if(!Number.isFinite(seconds)||seconds<0)return;stop();elapsed=seconds;draw();},
      get state(){return {ready,paused,elapsed,visible,reduced:motion.matches,renderer:scene.dataset.renderer};}
    };
  }
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  function makeCanvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
  function installCanvas(){
    // A canvas cannot change from WebGL to 2D; replace the rendering surface.
    const replacement=document.createElement('canvas');replacement.id='sky-canvas';canvas.replaceWith(replacement);canvas=replacement;
    context2d=canvas.getContext('2d',{alpha:false});if(!context2d)throw Error('Canvas unavailable');
    const w=image.naturalWidth,h=image.naturalHeight;
    skyMask=makeCanvas(w,h);waterMask=makeCanvas(w,h);chairMask=makeCanvas(w,h);layer=makeCanvas(w,h);layerContext=layer.getContext('2d');
    const a=skyMask.getContext('2d'),b=waterMask.getContext('2d'),sky=a.createImageData(w,h),water=b.createImageData(w,h),body=a.createImageData(w,h);
    layerContext.drawImage(image,0,0);const pixels=layerContext.getImageData(0,0,w,h).data;
    function box(x,y,x0,y0,x1,y1,f){return smooth(x0-f,x0,x)*(1-smooth(x1,x1+f,x))*smooth(y0-f,y0,y)*(1-smooth(y1,y1+f,y));}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/w,v=y/h,reflection=v>0.627,above=reflection?1.254-v:v;
      const k=(y*w+x)*4,luma=(pixels[k]*.2126+pixels[k+1]*.7152+pixels[k+2]*.0722)/255;
      const ink=1-smooth(.52,.76,luma);
      const wood=(1-smooth(.68,.84,luma))*smooth(-.055,.015,(pixels[k]-pixels[k+2])/255);
      const chair=box(u,v,.708,.553,.805,.765,.0018)*wood;body.data[k+3]=chair>.10?255:0;
      const object=Math.max(chair,box(u,v,.696,.766,.813,.973,.018)*ink);
      const cloud=1;
      const data=reflection?water.data:sky.data;data[(y*w+x)*4+3]=Math.round(255*cloud*(1-object));
    }
    a.putImageData(sky,0,0);b.putImageData(water,0,0);chairMask.getContext('2d').putImageData(body,0,0);
    // The animated source has transparent wood, so shifted copies cannot carry extra legs.
    motionSource=makeCanvas(w,h);const sourceContext=motionSource.getContext('2d');sourceContext.drawImage(image,0,0);
    sourceContext.globalCompositeOperation='destination-out';sourceContext.drawImage(chairMask,0,0);sourceContext.globalCompositeOperation='source-over';
    activate('canvas2d');
  }
  function drawCanvas(){
    const w=image.naturalWidth,h=image.naturalHeight,cw=canvas.width,ch=canvas.height;
    const scale=Math.max(cw/w,ch/h),align=innerWidth<=640?.78:.5;
    const x=(cw-w*scale)*align,y=(ch-h*scale)*.5;
    context2d.setTransform(1,0,0,1,0,0);context2d.fillStyle='#83c8f5';context2d.fillRect(0,0,cw,ch);
    context2d.save();context2d.translate(x,y);context2d.scale(scale,scale);
    // Canvas fallback resolves the original as one image, then animates two local masks.
    context2d.globalAlpha=still||motion.matches?1:smooth(0,1.8,elapsed);
    context2d.drawImage(image,0,0);
    if(!still&&!motion.matches&&elapsed>2.4){
      const t=(elapsed-2.4)%120,dx=w*.028*Math.sin(2*Math.PI*t/120),dy=h*.0008*Math.sin(2*Math.PI*t/60);
      for(const [mask,reflected] of [[skyMask,false],[waterMask,true]]){
        layerContext.clearRect(0,0,w,h);layerContext.globalCompositeOperation='source-over';
        layerContext.drawImage(motionSource,0,0,w,h);
        const start=reflected?Math.floor(.627*h):0,end=reflected?h:Math.ceil(.627*h);
        for(let row=start;row<end;row+=3){
          const count=Math.min(3,end-row),v=row/h,above=reflected?1.254-v:v;
          const depth=.22+.78*smooth(.02,.48,.627-above),sx=dx*depth,sy=dy*depth*(reflected?-1:1);
          const sourceY=Math.max(0,Math.min(h-count,row+sy));
          layerContext.drawImage(motionSource,0,sourceY,w,count,-sx,row,w,count);
        }
        layerContext.globalCompositeOperation='destination-in';layerContext.drawImage(mask,0,0);layerContext.globalCompositeOperation='source-over';
        context2d.drawImage(layer,0,0);
      }
    }
    if(!still&&!motion.matches&&elapsed>2.4){
      drawWaterSurface((elapsed-2.4)%120,w,h,x,y,scale);
      drawRipples((elapsed-2.4)%120,w,h,x,y,scale);
    }
    if(renderer==="canvas2d"&&!still&&!motion.matches)restoreChair();
    context2d.restore();context2d.globalAlpha=1;
  }
  function drawWaterSurface(time,w,h,x,y,scale){
    const strength=smooth(0,1.5,time)*(1-smooth(118,120,time));
    if(strength<=0)return;
    layerContext.globalCompositeOperation='source-over';layerContext.clearRect(0,0,w,h);
    layerContext.drawImage(canvas,-x/scale,-y/scale,canvas.width/scale,canvas.height/scale);
    clearChairFromLayer();
    context2d.save();context2d.beginPath();context2d.rect(0,h*.627,w,h*.373);
    context2d.clip();
    for(let row=Math.ceil(h*.627);row<h;row+=2){
      const v=row/h,depth=smooth(.627,.96,v)*strength,count=Math.min(2,h-row);
      const dx=(Math.sin(v*65-time*2*Math.PI/12)+.4*Math.sin(v*115+time*2*Math.PI/20))*w*.0012*depth;
      const dy=Math.sin(v*85-time*2*Math.PI/12)*h*.00045*depth,sourceY=Math.max(0,Math.min(h-count,row+dy));
      context2d.drawImage(layer,0,sourceY,w,count,-dx,row,w,count);
    }
    context2d.restore();

  }
  function clearChairFromLayer(){
    // Refraction and ring scaling sample the same wood-free snapshot, then one chair is restored.
    layerContext.globalCompositeOperation='destination-out';layerContext.drawImage(chairMask,0,0);
    layerContext.globalCompositeOperation='source-over';
  }
  function restoreChair(){
    // The chair is a pixel silhouette, not an exclusion rectangle containing still water.
    layerContext.globalCompositeOperation='source-over';layerContext.clearRect(0,0,layer.width,layer.height);
    layerContext.drawImage(image,0,0);layerContext.globalCompositeOperation='destination-in';layerContext.drawImage(chairMask,0,0);
    layerContext.globalCompositeOperation='source-over';context2d.drawImage(layer,0,0);
  }
  function drawRipples(time,w,h,x,y,scale){
    const strength=smooth(0,1.5,time)*(1-smooth(118,120,time));
    if(strength<=0)return;
    // Snapshot the already composed scene once; refract only the thin annular bands.
    layerContext.globalCompositeOperation='source-over';layerContext.clearRect(0,0,w,h);
    layerContext.drawImage(canvas,-x/scale,-y/scale,canvas.width/scale,canvas.height/scale);
    clearChairFromLayer();
    const cx=w*.757,cy=h*.766;
    context2d.save();context2d.beginPath();context2d.rect(0,h*.65,w,h*.35);
    context2d.clip();
    for(let i=0;i<1;i++){
      const age=(time+i*10)%10,fade=smooth(0,.8,age)*(1-smooth(3.5,5.5,age))*strength;
      if(fade<.001)continue;
      const radius=.007+Math.min(age,5.5)*.014,rx=radius*w,ry=radius*h/2.5;
      context2d.save();context2d.beginPath();
      context2d.ellipse(cx,cy,rx+4,ry+2,0,0,Math.PI*2);
      context2d.ellipse(cx,cy,Math.max(.1,rx-4),Math.max(.1,ry-2),0,0,Math.PI*2);context2d.clip('evenodd');
      context2d.translate(cx,cy);context2d.scale(1+.0015*fade,1+.003*fade);context2d.drawImage(layer,-cx,-cy);context2d.restore();

    }
    context2d.restore();
  }
  function drawWaveOverlay(){
    if(!image)return;
    const w=image.naturalWidth,h=image.naturalHeight,rect=hero.getBoundingClientRect();
    const scale=Math.max(rect.width/w,rect.height/h),viewW=rect.width/scale,viewH=rect.height/scale;
    const left=(w-viewW)*(innerWidth<=640?.78:.5),top=(h-viewH)*.5;
    waveOverlay.setAttribute('viewBox',`${left} ${top} ${viewW} ${viewH}`);
    const time=Math.max(0,elapsed-2.4)%120;
    const strength=still||motion.matches||elapsed<2.4?0:smooth(0,1.2,time)*(1-smooth(118,120,time));
    waveRings.forEach((ring,i)=>{
      const age=(time+i*10)%10,radius=.007+Math.min(age,5.5)*.014,fade=smooth(0,.8,age)*(1-smooth(3.5,5.5,age))*strength;
      ring.setAttribute('cx',w*.757);ring.setAttribute('cy',h*.768);
      ring.setAttribute('rx',radius*w);ring.setAttribute('ry',radius*h/2.5);
      ring.setAttribute('opacity',(.11*fade).toFixed(3));
    });
  }
  button.addEventListener('click',()=>{
    paused=!paused;
    // Pausing freezes the existing frame; the clock resumes from that same moment.
    if(paused){elapsed=Math.max(elapsed,2.4);root.classList.remove('sky-entering');}
    updateButton();sync();
  });
  motion.addEventListener('change',()=>{
    if(motion.matches){root.classList.remove('sky-pending','sky-entering');elapsed=Math.max(elapsed,2.4);}
    button.hidden=!ready||still||motion.matches;sync();
  });
  document.addEventListener('visibilitychange',sync);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();});
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;if(visible)startIntro();sync();
  },{threshold:0.01});observer.observe(hero);}
  if('ResizeObserver' in window){ro=new ResizeObserver(resize);ro.observe(hero);}else addEventListener('resize',resize);
  if(still){root.classList.remove('sky-pending');scene.dataset.renderer='static';return;}
  // HTTP production uses the original image once; no file:// base64 duplicate.
  resourceTimer=setTimeout(fallback,12000);
  image=new Image();image.onload=()=>{if(failed)return;try{install();}catch{fallback();}};
  image.onerror=fallback;image.src='/home/assets/sky-mirror-aged-chair.png';
  addEventListener('pagehide',()=>{stop();clearTimeout(enterTimer);});
  addEventListener('pageshow',event=>{if(event.persisted)sync();});
})();
