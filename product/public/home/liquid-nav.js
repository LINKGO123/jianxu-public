(()=>{
  const header=document.querySelector('.site-header'),nav=header.querySelector('nav');
  const links=[...nav.querySelectorAll('a[href^="#"]')];
  nav.id='home-primary-nav';header.dataset.menuOpen='false';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='nav-menu-toggle';
  toggle.setAttribute('aria-label','展开顶部导航');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',nav.id);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  for(const [name,d] of [['menu-line-top','M5 8h14'],['menu-line-bottom','M5 16h14']]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('class',name);path.setAttribute('d',d);svg.append(path);}toggle.append(svg);
  header.append(toggle);
  function setOpen(open){header.dataset.menuOpen=String(open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'收起顶部导航':'展开顶部导航');}
  function current(id){links.forEach(link=>{if(link.hash===id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
  toggle.addEventListener('click',()=>{const open=header.dataset.menuOpen!=='true';setOpen(open);if(open)links[0]?.focus();});
  links.forEach(link=>link.addEventListener('click',()=>{current(link.hash);setOpen(false);}));
  document.addEventListener('pointerdown',event=>{if(!header.contains(event.target))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&header.dataset.menuOpen==='true'){setOpen(false);toggle.focus();}});
  header.addEventListener('focusout',event=>{if(event.relatedTarget&&!header.contains(event.relatedTarget))setOpen(false);});
  const narrow=matchMedia('(max-width:760px)');narrow.addEventListener('change',()=>setOpen(false));
  addEventListener('hashchange',()=>current(location.hash));current(location.hash);
  if('IntersectionObserver' in window){
    const active=new Map();
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>active.set(entry.target.id,entry.isIntersecting?entry.intersectionRatio:0));
      const best=[...active].filter(([,ratio])=>ratio>0).sort((a,b)=>b[1]-a[1])[0];
      if(best)current('#'+best[0]);
    },{rootMargin:'-100px 0px -50% 0px',threshold:[0,.05,.15,.3,.5]});
    links.forEach(link=>{const target=document.querySelector(link.hash);if(target)observer.observe(target);});
    const heroObserver=new IntersectionObserver(entries=>{
      const inHero=entries[0].isIntersecting&&entries[0].intersectionRatio>=.65;header.dataset.overContent=String(!inHero);
      if(inHero)current('');
    },{threshold:.65});
    heroObserver.observe(document.querySelector('.hero'));
  }
  const gentle=matchMedia('(hover:hover) and (prefers-reduced-motion:no-preference)');
  let pending=0,point;
  header.addEventListener('pointermove',event=>{
    if(!gentle.matches)return;point={x:event.clientX,y:event.clientY};if(pending)return;
    pending=requestAnimationFrame(()=>{pending=0;const rect=header.getBoundingClientRect();header.style.setProperty('--glass-x',`${point.x-rect.left}px`);header.style.setProperty('--glass-y',`${point.y-rect.top}px`);});
  });
})();
