const styles = [
  {id:"editorial",name:"编辑式杂志",description:"用清晰的文字层级，把经历讲成一段有重点的职业叙事。",image:"/examples/editorial.png"},
  {id:"atelier",name:"法式编辑",description:"以克制的留白与柔和秩序，让内容显得从容而真诚。",image:"/examples/atelier.png"},
  {id:"grid",name:"几何极简",description:"用规整的网格和明确的层级，让关键信息更容易被快速读到。",image:"/examples/grid.png"},
  {id:"nordic",name:"北欧极简",description:"给文字留出呼吸的空间，保持轻盈、安静和易读。",image:"/examples/nordic.png"},
  {id:"developer",name:"开发者",description:"以精确而直接的方式，呈现技术经历与项目贡献。",image:"/examples/developer.png"},
  {id:"tokyo",name:"东京现代主义",description:"用鲜明对比建立视觉节奏，让重点更快进入视线。",image:"/examples/tokyo.png"}
];
const cards=[...document.querySelectorAll(".fan-card")];
const stage=document.querySelector("#fan-stage");
const modal=document.querySelector("#sample-modal");
const heroArt=document.querySelector(".hero-art");
const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
let selected=0;
let arrangement="fan";
let modalTrigger=null;
let storyTimer;
let storyVisible=!("IntersectionObserver" in window);

function setStoryState(state){
  heroArt.dataset.storyState=state;
}
function syncStoryPlayback(){
  clearTimeout(storyTimer);
  if(reducedMotion.matches){setStoryState("composed");return;}
  if(!storyVisible||document.hidden||heroArt.matches(":hover, :focus-within"))return;
  storyTimer=setTimeout(()=>{
    setStoryState(heroArt.dataset.storyState==="draft"?"composed":"draft");
    syncStoryPlayback();
  },heroArt.dataset.storyState==="draft"?1800:3600);
}
for(const event of ["pointerenter","pointerleave","focusin","focusout"])heroArt.addEventListener(event,syncStoryPlayback);
reducedMotion.addEventListener("change",syncStoryPlayback);
document.addEventListener("visibilitychange",syncStoryPlayback);
window.addEventListener("pagehide",()=>clearTimeout(storyTimer));
window.addEventListener("pageshow",syncStoryPlayback);
setStoryState("draft");
if("IntersectionObserver" in window){
  const storyObserver=new IntersectionObserver(entries=>{
    storyVisible=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.3);
    syncStoryPlayback();
  },{threshold:.3});
  storyObserver.observe(heroArt);
}
syncStoryPlayback();

function renderFan(){
  const mobile=window.innerWidth<=640;
  const cardWidth=window.innerWidth<=380?150:mobile?165:window.innerWidth<=1200?185:213;
  const width=stage.clientWidth||700;
  const fanStep=Math.max(22,Math.min(mobile?70:104,(width/2-cardWidth*.43-18)/3));
  const rowSideScale=mobile ? .88 : .94;
  const rowStep=Math.min(cardWidth*1.03+10,width/2-cardWidth*rowSideScale*.2);
  cards.forEach((card,index)=>{
    const distance=(index-selected+cards.length)%cards.length;
    const slot=distance<=cards.length/2?distance:distance-cards.length;
    const active=index===selected;
    const row=arrangement==="row";
    card.style.setProperty("--fan-x",`${slot*(row?rowStep:fanStep)}px`);
    card.style.setProperty("--fan-y",`${row ? (mobile ? 29 : 38) : Math.abs(slot)*17}px`);
    card.style.setProperty("--fan-angle",`${row?0:slot*6.5}deg`);
    card.style.setProperty("--fan-scale",String(row?(active?(mobile?1:1.04):rowSideScale):(active?1.08:Math.max(.72,.88-Math.abs(slot)*.04))));
    card.style.setProperty("--card-brightness",String(active?1:Math.max(.74,1-Math.abs(slot)*(row ? .07 : .08))));
    card.style.setProperty("--card-z",String(active?20:10-Math.abs(slot)));
    card.setAttribute("aria-pressed",String(active));
  });
  const current=styles[selected];
  document.querySelector("#style-count").textContent=`${String(selected+1).padStart(2,"0")} / 06`;
  document.querySelector("#style-name").textContent=current.name;
  document.querySelector("#style-description").textContent=current.description;
  for(const [buttonId,offset] of [["#peek-one",1],["#peek-two",2]]){
    const button=document.querySelector(buttonId);
    const target=(selected+offset)%styles.length;
    button.dataset.target=String(target);
    button.querySelector("img").src=styles[target].image;
    button.setAttribute("aria-label",`查看${styles[target].name}风格`);
  }
}

function chooseStyle(index){selected=(index+styles.length)%styles.length;renderFan()}
function setArrangement(mode){
  arrangement=mode==="row"?"row":"fan";
  stage.dataset.arrangement=arrangement;
  document.querySelector("#arrange-fan").setAttribute("aria-pressed",String(arrangement==="fan"));
  document.querySelector("#arrange-row").setAttribute("aria-pressed",String(arrangement==="row"));
  renderFan();
}
document.querySelector("#arrange-fan").addEventListener("click",()=>setArrangement("fan"));
document.querySelector("#arrange-row").addEventListener("click",()=>setArrangement("row"));
for(const button of document.querySelectorAll(".detail-thumbs button"))button.addEventListener("click",()=>chooseStyle(Number(button.dataset.target)));
cards.forEach((card,index)=>card.addEventListener("click",()=>chooseStyle(index)));
stage.addEventListener("keydown",event=>{
  if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
  event.preventDefault();
  chooseStyle(selected+(event.key==="ArrowRight"?1:-1));
  cards[selected].focus();
});
document.querySelector("#fan-prev").addEventListener("click",()=>chooseStyle(selected-1));
document.querySelector("#fan-next").addEventListener("click",()=>chooseStyle(selected+1));
window.addEventListener("resize",renderFan);
renderFan();

if(!reducedMotion.matches&&"IntersectionObserver" in window){
  const reveals=[...document.querySelectorAll(".journey-step,.showcase-header,.review-copy,.review-example")];
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      entry.target.classList.add("in-view");
      observer.unobserve(entry.target);
    }
  },{threshold:.12,rootMargin:"0px 0px -25px 0px"});
  document.documentElement.classList.add("motion-ready");
  reveals.forEach(element=>observer.observe(element));
}

function openSample(){
  const current=styles[selected];
  modalTrigger=document.activeElement;
  document.querySelector("#sample-title").textContent=`${current.name} · 完整示例`;
  const image=document.querySelector("#sample-image");
  image.src=current.image;
  image.alt=`${current.name}风格的完整简历参考`;
  modal.hidden=false;
  document.body.style.overflow="hidden";
  document.querySelector("#close-sample").focus();
}
function closeSample(){
  modal.hidden=true;
  document.body.style.overflow="";
  modalTrigger?.focus();
  modalTrigger=null;
}
document.querySelector("#open-sample").addEventListener("click",openSample);
document.querySelector("#close-sample").addEventListener("click",closeSample);
modal.addEventListener("click",event=>{if(event.target===modal)closeSample()});
document.addEventListener("keydown",event=>{
  if(modal.hidden)return;
  if(event.key==="Escape"){closeSample();return}
  if(event.key!=="Tab")return;
  const close=document.querySelector("#close-sample");
  const scroll=document.querySelector(".sample-scroll");
  if(event.shiftKey&&document.activeElement===close){event.preventDefault();scroll.focus()}
  else if(!event.shiftKey&&document.activeElement===scroll){event.preventDefault();close.focus()}
});
