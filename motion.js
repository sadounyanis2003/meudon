/* Meudon — choreography. Native animations, no loop while the page is idle. */
(()=>{
  'use strict';
  const main=document.getElementById('main');
  const header=document.querySelector('.site-header');
  const progress=document.querySelector('.reading-progress span');
  const dialog=document.getElementById('dialog');
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const smallScreen=matchMedia('(max-width: 760px)');
  const reduced=()=>motionPreference.matches||document.body.classList.contains('reduce-motion');
  const easing='cubic-bezier(.16,1,.3,1)';
  const active=new Set(), seen=new WeakSet();
  let observer, frame=0, refreshFrame=0, photoRequest=0, pointer=null, pointerTarget=null;
  let hero=null, media=[], chapters=[], chapterButtons=[];

  function play(el,keyframes,options={}){
    if(reduced()||!el?.isConnected||!el.animate)return null;
    const animation=el.animate(keyframes,{duration:700,easing,fill:"backwards",...options});
    active.add(animation);
    animation.finished.then(()=>active.delete(animation),()=>active.delete(animation));
    return animation;
  }
  function cancelAnimations(){active.forEach(a=>a.cancel());active.clear()}
  function resetPointer(){
    if(pointerTarget){pointerTarget.style.removeProperty('--pointer-x');pointerTarget.style.removeProperty('--pointer-y');pointerTarget.classList.remove('has-depth-pointer')}
    pointer=null;pointerTarget=null;
  }
  function reveal(){
    observer?.disconnect();
    if(reduced()||document.body.classList.contains('practical-route')||document.body.classList.contains('restoring-route')||!('IntersectionObserver' in window))return;
    const selector='[data-reveal],.section-header,.event-card,.association-card,.album-card,.album-home-grid>a,.quick-item,.city-story-photo,.city-panorama,.feature-story';
    const candidates=[...main.querySelectorAll(selector)];
    const targets=candidates.filter(el=>!el.querySelector(selector));
    observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
      visible.forEach((entry,i)=>{
        const el=entry.target;observer.unobserve(el);
        if(seen.has(el))return;seen.add(el);
        const isPhoto=el.matches('.city-story-photo,.city-panorama,.feature-story');
        const isCard=el.matches('.event-card,.album-card,.album-home-grid>a');
        const isQuick=el.matches('.quick-item');
        const delay=Math.min(i,3)*65;
        if(isPhoto){
          play(el,[{opacity:.25,clipPath:'inset(7% 0 0 0)'},{opacity:1,clipPath:'inset(0% 0 0 0)'}],{duration:1000,delay});
        }else{
          play(el,[{opacity:0,transform:`translateY(${isCard?30:isQuick?12:20}px)`},{opacity:1,transform:'translateY(0)'}],{duration:isCard?820:650,delay});
        }
      });
    },{threshold:.09,rootMargin:'0px 0px -18px 0px'});
    targets.forEach(el=>{if(!seen.has(el))observer.observe(el)});
  }
  function introduction(){
    if(reduced())return;
    main.querySelectorAll('.headline-line>span').forEach((el,i)=>play(el,[{transform:'translateY(105%)',opacity:.3},{transform:'translateY(0)',opacity:1}],{duration:950,delay:i*100}));
    const kicker=main.querySelector('.city-kicker');
    if(kicker)play(kicker,[{opacity:0,transform:'translateX(-12px)'},{opacity:1,transform:'translateX(0)'}],{duration:750});
    const picture=main.querySelector('.hero-photo-stage');
    if(picture)play(picture,[{clipPath:'inset(0 0 0 8%)',opacity:.45},{clipPath:'inset(0 0 0 0%)',opacity:1}],{duration:1100});
    const controls=main.querySelector('.hero-photo-bottom');
    if(controls)play(controls,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:800,delay:180});
  }
  function cache(){
    hero=main.querySelector('.city-hero-photo');
    media=[...main.querySelectorAll('.city-panorama,.city-story-photo,.culture-feature>div,.feature-story')];
    chapters=[...main.querySelectorAll('.chapter-target')];
    chapterButtons=[...main.querySelectorAll('.city-chapter-nav button')];
  }
  function refresh(){refreshFrame=0;cache();reveal();queue()}
  function queueRefresh(){if(!refreshFrame)refreshFrame=requestAnimationFrame(refresh)}
  function tick(){
    frame=0;
    const reduce=reduced(), mobile=smallScreen.matches;
    const top=window.scrollY, viewport=window.innerHeight;
    // Read geometry first; write only after every measurement has been collected.
    const total=document.documentElement.scrollHeight-viewport;
    const heroBounds=hero?.getBoundingClientRect();
    const measurements=media.map(el=>({el,rect:el.getBoundingClientRect()}));
    let current=chapters[0]?.id;
    for(const section of chapters){if(section.getBoundingClientRect().top<205)current=section.id}
    const pointerBounds=pointerTarget?.getBoundingClientRect();
    header.classList.toggle('is-scrolled',top>15);
    if(progress)progress.style.transform=`scaleX(${Math.max(0,Math.min(1,total>0?top/total:0))})`;
    if(heroBounds&&heroBounds.bottom>0&&heroBounds.top<viewport){
      hero.style.setProperty('--scene-y',!reduce&&!mobile?Math.min(24,Math.max(-16,top*.065))+'px':'0px');
    }
    for(const {el,rect} of measurements){
      if(rect.bottom<0||rect.top>viewport)continue;
      const offset=!reduce&&!mobile?Math.max(-20,Math.min(20,(viewport/2-rect.top-rect.height/2)*.055)):0;
      el.style.setProperty('--scene-y',offset+'px');
    }
    if(pointerBounds&&pointer&&!reduce&&finePointer.matches){
      const x=Math.max(-.5,Math.min(.5,(pointer.x-pointerBounds.left)/pointerBounds.width-.5));
      const y=Math.max(-.5,Math.min(.5,(pointer.y-pointerBounds.top)/pointerBounds.height-.5));
      pointerTarget.style.setProperty('--pointer-x',x.toFixed(3));
      pointerTarget.style.setProperty('--pointer-y',y.toFixed(3));
      pointerTarget.classList.add('has-depth-pointer');
    }
    chapterButtons.forEach(button=>{
      const on=button.dataset.target===current;
      if(on&&button.getAttribute('aria-current')!=='true')button.setAttribute('aria-current','true');
      else if(!on&&button.hasAttribute('aria-current'))button.removeAttribute('aria-current');
    });
  }
  function queue(){if(!frame)frame=requestAnimationFrame(tick)}
  function route(){
    photoRequest++;cancelAnimations();resetPointer();
    refresh();if(!document.body.classList.contains('restoring-route'))introduction();
  }
  function motionChanged(){
    cancelAnimations();resetPointer();
    if(reduced()){
      observer?.disconnect();
      main.querySelectorAll('[style*="--scene-y"]').forEach(el=>el.style.removeProperty('--scene-y'));
    }else reveal();
    queue();
  }
  async function selectPhoto(n){
    const request=++photoRequest,stage=document.getElementById('hero-photo-stage');
    if(!stage||![0,1,2].includes(n))return;
    if(Number(stage.dataset.photo)===n){stage.removeAttribute('aria-busy');return}
    stage.setAttribute('aria-busy','true');
    const incoming=document.createElement('img');
    incoming.src='assets/'+photos[n].file;incoming.alt=photos[n].alt;
    incoming.width=n===0?1920:1200;incoming.height=n===0?1285:n===1?540:900;
    incoming.decoding='async';
    try{await incoming.decode()}catch{
      if(request===photoRequest&&stage.isConnected){stage.removeAttribute('aria-busy');toast('Cette photographie n’a pas pu être chargée. Réessayez.')}
      return;
    }
    if(request!==photoRequest||!stage.isConnected)return;
    // Complete the current layer before removing older ones during rapid input.
    active.forEach(animation=>{if(animation.effect?.target?.parentElement===stage)animation.finish()});
    const outgoing=stage.lastElementChild;
    [...stage.children].forEach(el=>{if(el!==outgoing)el.remove()});
    stage.append(incoming);stage.dataset.photo=String(n);stage.removeAttribute('aria-busy');syncHeroPhoto(n);
    const animation=play(incoming,[{opacity:0,clipPath:'inset(0 0 0 16%)'},{opacity:1,clipPath:'inset(0 0 0 0%)'}],{duration:850});
    if(animation)animation.finished.then(()=>outgoing?.remove(),()=>outgoing?.remove());
    else outgoing?.remove();
    const caption=document.getElementById('hero-place-label');
    play(caption,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:550});
  }
  window.MeudonMotion={selectPhoto};
  document.addEventListener('meudon:route',route);
  new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(node=>node.nodeType===1&&!node.matches('img'))))queueRefresh();
  }).observe(main,{childList:true,subtree:true});
  let previousReduced=reduced();
  new MutationObserver(()=>{
    const current=reduced();
    if(current!==previousReduced){previousReduced=current;motionChanged()}
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  motionPreference.addEventListener('change',motionChanged);
  finePointer.addEventListener('change',resetPointer);
  smallScreen.addEventListener('change',()=>{resetPointer();queue()});
  window.addEventListener('scroll',queue,{passive:true});
  window.addEventListener('resize',queue,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimations();resetPointer()}else queue()});
  document.addEventListener('pointermove',event=>{
    if(reduced()||event.pointerType!=='mouse'||!finePointer.matches)return;
    const target=event.target.closest('.city-hero-photo,.neighborhood-preview,.feature-story,.album-home-grid>a');
    if(target!==pointerTarget){resetPointer();pointerTarget=target}
    if(!target)return;
    pointer={x:event.clientX,y:event.clientY};queue();
  },{passive:true});
  document.addEventListener('pointerout',event=>{
    if(pointerTarget&&!pointerTarget.contains(event.relatedTarget))resetPointer();
  },{passive:true});
  document.addEventListener('keydown',event=>{
    const control=event.target.closest('[data-action=hero-photo]');
    if(!control||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const next=(Number(control.dataset.id)+(event.key==='ArrowRight'?1:2))%3;
    const button=main.querySelector(`[data-action=hero-photo][data-id="${next}"]`);
    button?.focus({preventScroll:true});button?.click();
  });
  new MutationObserver(records=>{
    if(!records.some(r=>r.target===document.getElementById('dialog-body')))return;
    const photo=dialog.querySelector('.lightbox img,.modal-hero');
    if(photo)play(photo,[{opacity:.3,transform:'scale(.98)'},{opacity:1,transform:'scale(1)'}],{duration:650});
    const content=dialog.querySelector('.dialog-content,.lightbox-footer');
    if(content)play(content,[{opacity:.2,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:460});
  }).observe(document.getElementById('dialog-body'),{childList:true});
  refresh();introduction();
})();
