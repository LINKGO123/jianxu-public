import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Only platform events and time are replaced; the complete production script runs here.
class Surface extends EventTarget {
  dataset: Record<string,string>={};attributes: Record<string,string>={};
  textContent='';hidden=false;src='';alt='';clientWidth=900;
  style={setProperty(){},overflow:''};classList={add(){}};
  children=new Map<string,Surface>();
  setAttribute(name:string,value:string){this.attributes[name]=value;}
  querySelector(selector:string){
    let child=this.children.get(selector);
    if(!child){child=new Surface();this.children.set(selector,child);}
    return child;
  }
  hovered=false;focused=false;
  matches(){return this.hovered||this.focused;}
  focus(){}
}
function page(reduced=false){
  const nodes=new Map<string,Surface>();
  function element(selector:string){
    let value=nodes.get(selector);
    if(!value){value=new Surface();nodes.set(selector,value);}
    return value;
  }
  const cards=Array.from({length:6},()=>new Surface());
  const document=Object.assign(new EventTarget(),{
    hidden:false,documentElement:new Surface(),body:new Surface(),activeElement:null,
    querySelector:element,querySelectorAll:(selector:string)=>selector==='.fan-card'?cards:[],
  });
  const preference=Object.assign(new EventTarget(),{matches:reduced});
  type Entry={isIntersecting:boolean;intersectionRatio:number};
  const observers=new Map<Surface,(entries:Entry[])=>void>();
  class Observer {
    constructor(private callback:(entries:Entry[])=>void){}
    observe(target:Surface){observers.set(target,this.callback);}
    unobserve(){}
  }
  const window=Object.assign(new EventTarget(),{innerWidth:1440,matchMedia:()=>preference,IntersectionObserver:Observer});
  let id=0;const timers=new Map<number,{callback:()=>void;delay:number}>();
  element('#sample-modal').hidden=true;
  runInNewContext(readFileSync(new URL('../public/home/app.js',import.meta.url),'utf8'),{
    document,window,IntersectionObserver:Observer,
    setTimeout:(callback:()=>void,delay:number)=>{timers.set(++id,{callback,delay});return id;},
    clearTimeout:(timer:number|undefined)=>{if(timer!==undefined)timers.delete(timer);},
  });
  return {
    element,document,window,preference,timers,
    visible(value:boolean){observers.get(element('.hero-art'))!([{isIntersecting:value,intersectionRatio:value?1:0}]);},
    advance(){const next=timers.entries().next().value;assert.ok(next);timers.delete(next[0]);next[1].callback();return next[1].delay;},
  };
}
test('home story automatically repeats draft/composed without clicks',()=>{
  const p=page();assert.equal(p.timers.size,0);p.visible(true);
  assert.equal(p.element('.hero-art').dataset.storyState,'draft');
  for(let cycle=0;cycle<2;cycle++){
    assert.equal(p.advance(),1800);assert.equal(p.element('.hero-art').dataset.storyState,'composed');
    assert.equal(p.advance(),3600);assert.equal(p.element('.hero-art').dataset.storyState,'draft');
    assert.equal(p.timers.size,1);
  }
});
test('home story pauses on hover, focus, offscreen, hidden page and exit, then resumes',()=>{
  const p=page();p.visible(true);
  const art=p.element('.hero-art');
  art.hovered=true;art.dispatchEvent(new Event('pointerenter'));assert.equal(p.timers.size,0);
  art.hovered=false;art.dispatchEvent(new Event('pointerleave'));assert.equal(p.timers.size,1);
  art.focused=true;art.dispatchEvent(new Event('focusin'));assert.equal(p.timers.size,0);
  art.focused=false;art.dispatchEvent(new Event('focusout'));assert.equal(p.timers.size,1);
  p.visible(false);assert.equal(p.timers.size,0);p.visible(true);assert.equal(p.timers.size,1);
  p.document.hidden=true;p.document.dispatchEvent(new Event('visibilitychange'));assert.equal(p.timers.size,0);
  p.document.hidden=false;p.document.dispatchEvent(new Event('visibilitychange'));assert.equal(p.timers.size,1);
  p.window.dispatchEvent(new Event('pagehide'));assert.equal(p.timers.size,0);
  p.window.dispatchEvent(new Event('pageshow'));assert.equal(p.timers.size,1);
});
test('reduced motion shows a composed still and follows preference changes',()=>{
  const p=page(true);p.visible(true);
  assert.equal(p.element('.hero-art').dataset.storyState,'composed');
  assert.equal(p.timers.size,0);
  p.preference.matches=false;p.preference.dispatchEvent(new Event('change'));
  assert.equal(p.timers.size,1);
  assert.equal(p.advance(),3600);assert.equal(p.element('.hero-art').dataset.storyState,'draft');
  p.preference.matches=true;p.preference.dispatchEvent(new Event('change'));
  assert.equal(p.element('.hero-art').dataset.storyState,'composed');assert.equal(p.timers.size,0);
});

test('home markup omits playback controls and development labels, keeping keyboard pause',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/story-control|story-toggle|story-status|演示|合成|测试|虚构|示意/);
  assert.match(html,/class="hero-art"[^>]*tabindex="0"/);
});
