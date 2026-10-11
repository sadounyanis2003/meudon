/* Meudon — coherent URLs, restored journeys and practical agenda. */
'use strict';
const v6Base={pageTop,home,districtContent,associationView,filterAssociations,directoryView,updateDirectory,updateSaved};
const v6Agenda={period:'toutes',query:'',free:false,year:2026};
let v6Entry=null,v6ScrollFrame=0,v6Rendering=false,v6RouteStamp=0;
const v6Path=()=> (location.hash.slice(1)||'/').split('?')[0];
const v6Params=()=>new URLSearchParams((location.hash.split('?')[1]||''));
const v6Hash=(path,values)=>{const p=new URLSearchParams();Object.entries(values).forEach(([k,v])=>{if(v!==''&&v!==null&&v!==undefined&&v!==false)p.set(k,String(v))});return '#'+path+(p.size?'?'+p:'')};
function v6FocusKey(el){if(!el||el===document.body)return null;if(el.id)return {id:el.id};const a=el.closest?.('a[href]');if(a)return {href:a.getAttribute('href')};if(el.dataset?.action)return {action:el.dataset.action,value:el.dataset.value||'',id:el.dataset.id||''};return null}
function v6FindFocus(key){if(!key)return null;if(key.id&&!key.action)return document.getElementById(key.id);if(key.href)return $$('main a[href]').find(a=>a.getAttribute('href')===key.href);return $$('[data-action]').find(b=>b.dataset.action===key.action&&(b.dataset.value||'')===key.value&&(b.dataset.id||'')===key.id)}
function v6Remember(){if(!v6Entry||v6Rendering)return;v6Entry.scroll=window.scrollY;v6Entry.focus=v6FocusKey(document.activeElement);history.replaceState({...history.state,meudon:v6Entry},'');}
function v6NewEntry(from,options={}){return {id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),from:from||null,scroll:options.preserveScroll?window.scrollY:0,focus:options.preserveScroll?v6FocusKey(document.activeElement):null};}
function v6Navigate(hash,options={}){
  if(!hash.startsWith('#/'))return;
  if(hash===location.hash){closeDialog();closeMenu();return;}
  v6Remember();const from={hash:location.hash||'#/',entry:v6Entry?.id};
  const entry=options.replace?{...v6Entry}:v6NewEntry(from,options);
  history[options.replace?'replaceState':'pushState']({meudon:entry},'',hash);
  v6Entry=entry;v6Render(true,{restore:!!options.preserveScroll,focus:entry.focus});
}
function v6ReplaceFilter(key,value){const p=v6Params();if(value===null||value===''||value===false)p.delete(key);else p.set(key,String(value));v6Remember();history.replaceState({...history.state,meudon:v6Entry},'',v6Hash(v6Path(),Object.fromEntries(p)));}
function v6SetFilters(changes,options={}){const p=v6Params();Object.entries(changes).forEach(([key,value])=>{if(value===null||value===''||value===false)p.delete(key);else p.set(key,String(value))});v6Navigate(v6Hash(v6Path(),Object.fromEntries(p)),{preserveScroll:true,...options});}
function v6RestoreFilters(route,p){
  if(route==='/services')Object.assign(directoryState,{category:directoryCategories.includes(p.get('categorie'))?p.get('categorie'):'Tous',query:p.get('q')||'',savedOnly:p.get('favoris')==='1',sort:p.get('tri')==='az'?'az':'usage'});
  if(route==='/associations'){associationState.query=p.get('q')||'';state.assocFilter=['Sport','Culture','Solidarité','Nature'].includes(p.get('categorie'))?p.get('categorie'):'Tout';}
  if(route==='/famille')state.age=['Moins de 3 ans','3 à 5 ans','6 à 10 ans','11 ans et plus'].includes(p.get('age'))?p.get('age'):'Tous les âges';
  if(route==='/quartiers'){const remembered=window.MeudonDiscovery?.followed?.();const n=p.has('quartier')?Number(p.get('quartier')):(remembered??0);state.district=Number.isInteger(n)&&n>=0&&n<5?n:0;}
  if(route==='/agenda'){
    Object.assign(agendaExtra,{district:districts.some(d=>d.name===p.get('quartier'))?p.get('quartier'):'Tous',organizer:['ville','association'].includes(p.get('organisateur'))?p.get('organisateur'):'Tous',audience:['famille','adulte'].includes(p.get('public'))?p.get('public'):'Tous'});
    state.agendaFilter=['Culture','Nature','En famille','Sport'].includes(p.get('categorie'))?p.get('categorie'):'Tout';state.savedOnly=p.get('favoris')==='1';
    const month=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(p.get('mois')||'');state.agendaMonth=month?Number(month[2]):10;
    Object.assign(v6Agenda,{period:['aujourdhui','semaine','weekend','mois'].includes(p.get('periode'))?p.get('periode'):'toutes',query:p.get('q')||'',free:p.get('gratuit')==='1',year:month?Number(month[1]):2026});
  }
}
function v6Date(e){return new Date(2026,e.month-1,e.day);}
function v6PeriodMatch(e,period,now=new Date()){
  const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()),d=v6Date(e);let start=day,end=new Date(day);
  if(period==='toutes')return true;
  if(period==='mois')return e.month===state.agendaMonth&&v6Agenda.year===2026;
  if(period==='semaine'){start=new Date(day);start.setDate(start.getDate()-((start.getDay()+6)%7));end=new Date(start);end.setDate(end.getDate()+6);}
  if(period==='weekend'){start=new Date(day);start.setDate(start.getDate()+(day.getDay()===0?-1:6-day.getDay()));end=new Date(start);end.setDate(end.getDate()+1);}
  return d>=start&&d<=end;
}
function v6AgendaList(now=new Date()){
  const q=MeudonSearch.clean(v6Agenda.query);
  return events.filter(e=>(state.savedOnly?saved.includes(e.id):v6PeriodMatch(e,v6Agenda.period,now))&&(state.agendaFilter==='Tout'||e.category===state.agendaFilter)&&(agendaExtra.district==='Tous'||e.district===agendaExtra.district)&&(agendaExtra.organizer==='Tous'||e.orgType===agendaExtra.organizer)&&(agendaExtra.audience==='Tous'||e.audience===agendaExtra.audience)&&(!v6Agenda.free||e.free===true)&&(!q||q.split(' ').every(w=>MeudonSearch.clean(e.title+' '+e.place+' '+e.category+' '+e.desc).includes(w)))).sort((a,b)=>v6Date(a)-v6Date(b));
}
events.forEach(e=>{e.free=true;}); // These six records are explicitly fictional demonstration events.
function v6AgendaSummary(){const labels=[];if(state.savedOnly)labels.push('Mes favoris · toutes les dates');else if(v6Agenda.period!=='toutes')labels.push(({aujourdhui:'Aujourd’hui',semaine:'Cette semaine',weekend:'Ce week-end',mois:new Date(v6Agenda.year,state.agendaMonth-1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})})[v6Agenda.period]);if(state.agendaFilter!=='Tout')labels.push(state.agendaFilter);if(agendaExtra.district!=='Tous')labels.push(agendaExtra.district);if(agendaExtra.organizer!=='Tous')labels.push(agendaExtra.organizer==='association'?'Associations':'Ville et équipements');if(agendaExtra.audience!=='Tous')labels.push(agendaExtra.audience==='famille'?'En famille':'Adultes');if(v6Agenda.free)labels.push('Gratuit');if(v6Agenda.query)labels.push('« '+v6Agenda.query+' »');return labels;}
function v6AgendaView(){return `${pageTop('Agenda','Les sorties à Meudon','Un rendez-vous aujourd’hui, une sortie en famille ou une idée pour le week-end.')}<section class="wrap page-content agenda-page"><div class="demo-notice">Programmation de démonstration · les 6 événements d’octobre et novembre 2026 sont fictifs.</div><div class="v6-agenda-periods filter-row" aria-label="Choisir une période">${[['toutes','Toutes les dates'],['aujourdhui','Aujourd’hui'],['semaine','Cette semaine'],['weekend','Ce week-end']].map(([v,t])=>`<button id="period-${v}" class="chip ${!state.savedOnly&&v6Agenda.period===v?'active':''}" data-action="v6-period" data-value="${v}" aria-pressed="${!state.savedOnly&&v6Agenda.period===v}">${t}</button>`).join('')}<button id="agenda-favorites" class="chip ${state.savedOnly?'active':''}" data-action="v6-favorites" aria-pressed="${state.savedOnly}">${icon('bookmark')} Mes favoris <span id="saved-count">(${saved.length})</span></button></div><div class="v6-agenda-search"><label class="page-search">${icon('search')}<input id="v6-agenda-search" type="search" value="${esc(v6Agenda.query)}" placeholder="Un événement, un lieu…" aria-label="Rechercher un événement"></label><label class="v6-month-label">Un mois précis<input id="v6-agenda-month" type="month" value="${v6Agenda.period==='mois'&&!state.savedOnly?v6Agenda.year+'-'+String(state.agendaMonth).padStart(2,'0'):''}"></label></div><div class="agenda-selects"><label>Quartier<select id="agenda-district"><option value="Tous">Tous les quartiers</option>${districts.map(d=>`<option ${agendaExtra.district===d.name?'selected':''}>${d.name}</option>`).join('')}</select></label><label>Organisateur<select id="agenda-organizer"><option value="Tous">Tous les organisateurs</option><option value="ville" ${agendaExtra.organizer==='ville'?'selected':''}>Ville et équipements</option><option value="association" ${agendaExtra.organizer==='association'?'selected':''}>Associations</option></select></label><label>Public<select id="agenda-audience"><option value="Tous">Tous les publics</option><option value="famille" ${agendaExtra.audience==='famille'?'selected':''}>En famille</option><option value="adulte" ${agendaExtra.audience==='adulte'?'selected':''}>Adultes</option></select></label></div><div class="v6-agenda-bottom"><div class="filter-row" id="agenda-filters">${chips(['Tout','Culture','Nature','En famille','Sport'],'agenda-filter',state.agendaFilter)}</div><label class="v6-checkbox"><input id="v6-agenda-free" type="checkbox" ${v6Agenda.free?'checked':''}> Gratuit</label></div><div id="v6-active-filters" class="v6-active-filters"></div><p id="agenda-count" role="status" aria-live="polite"></p><div class="event-grid" id="agenda-events"></div><a class="text-link v6-official-agenda" href="https://www.meudon.fr/agenda/" ${externalAttrs()}>Consulter la programmation réelle sur meudon.fr ${icon('external')}<span class="sr-only">Nouvel onglet</span></a></section>`;}
function v6FilterAgenda(){const list=v6AgendaList(),labels=v6AgendaSummary();$('#agenda-count').textContent=`${list.length} événement${list.length>1?'s':''}${state.savedOnly?' enregistré'+(list.length>1?'s':''):''} dans cette sélection`;$('#v6-active-filters').innerHTML=labels.length?`<span>Sélection : ${labels.map(esc).join(' · ')}</span><a href="#/agenda" class="text-link">Tout effacer ${icon('x')}</a>`:'';$('#agenda-events').innerHTML=list.length?list.map(eventCard).join(''):`<div class="empty-state"><h3>${state.savedOnly?'Aucun favori avec ces critères.':'Aucun événement dans cette sélection.'}</h3><p>${state.savedOnly?'Les favoris couvrent toutes les dates. Retirez les autres filtres ou enregistrez un événement.':'Les exemples sont limités à octobre et novembre 2026. Une sélection vide ne signifie pas qu’aucune sortie réelle n’est proposée.'}</p><a class="button outline" href="${state.savedOnly?'#/agenda?favoris=1':'#/agenda'}">${state.savedOnly?'Voir tous mes favoris':'Voir tous les exemples'}</a><a class="text-link" href="https://www.meudon.fr/agenda/" ${externalAttrs()}>L’agenda officiel ${icon('external')}<span class="sr-only">Nouvel onglet</span></a></div>`;hydrate($('#agenda-events'));}
function v6EventView(id){const e=events.find(x=>x.id===Number(id));if(!e)return notFound();return `${pageTop('Agenda',e.title,e.desc)}<section class="wrap page-content"><div class="demo-notice">Événement fictif · fiche de démonstration, aucune réservation possible.</div><div class="v6-event-detail"><figure>${img(e.image,'',true)}</figure><div><span class="eyebrow">${esc(e.category)}</span><h2>Votre rendez-vous</h2><dl class="portal-facts"><div><dt>Date</dt><dd>${v6Date(e).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</dd></div><div><dt>Horaire</dt><dd>${e.time.replace(':','h')}</dd></div><div><dt>Lieu</dt><dd>${esc(e.place)} · ${esc(e.district)}</dd></div><div><dt>Public</dt><dd>${e.audience==='famille'?'En famille':'Adultes'}</dd></div><div><dt>Tarif</dt><dd>Gratuit · exemple fictif</dd></div><div><dt>Organisateur</dt><dd>${esc(e.organizer)}</dd></div></dl><div class="modal-actions"><button class="button primary" data-action="save-event" data-id="${e.id}" aria-pressed="${saved.includes(e.id)}">${icon('bookmark')}<span>${saved.includes(e.id)?'Retirer de mes favoris':'Enregistrer ce rendez-vous'}</span></button><button class="button outline" data-action="ical" data-id="${e.id}">${icon('download')} Exporter l’exemple (.ics)</button></div><p class="form-note">Favoris conservés sur cet appareil. Le calendrier exporté porte la mention « exemple ».</p><a class="text-link" href="#/agenda?quartier=${encodeURIComponent(e.district)}">Les sorties de ce quartier ${icon('arrow-right')}</a></div></div></section>`;}
function v6NewResidentView(){const ids=['inscription-scolaire','famille','stationnement','dechets','elections','mediatheques'];return `${pageTop('Bienvenue à Meudon','Vous vous installez à Meudon ?','Retrouvez les démarches et les services utiles pour prendre vos repères.')}<section class="wrap page-content"><div class="v6-journey-steps"><a href="#/autour-de-moi"><span>01</span><h2>Repérer les lieux utiles</h2><p>Équipements, services et adresses autour de votre quartier.</p>${icon('arrow-right')}</a><a href="#/famille"><span>02</span><h2>Organiser la vie de famille</h2><p>École, accueil des enfants, réservations et factures.</p>${icon('arrow-right')}</a><a href="#/quartiers"><span>03</span><h2>Connaître votre quartier</h2><p>Projets, conseils de quartier et informations de proximité.</p>${icon('arrow-right')}</a></div><div class="portal-home-grid">${ids.map(portalById).filter(Boolean).map(s=>networkLink(s,true)).join('')}</div><div class="subtle-box">${icon('phone')}<p><strong>Un interlocuteur pour vous orienter</strong><br>La mairie vous aide à identifier les démarches adaptées à votre situation.</p><a class="button outline" href="#/contact">Horaires et contacts ${icon('arrow-right')}</a></div></section>`;}
function v6PageTop(eye,title,desc,action=''){
  const socialRoute=['/retrouvez-nous','/reseaux'].includes(currentRoute);
  const parent=socialRoute?['La Ville','/mairie']:currentRoute.startsWith('/service/')?['Démarches & services','/services']:currentRoute.startsWith('/association/')?['Associations','/associations']:currentRoute.startsWith('/album/')?['Albums photo','/galerie']:currentRoute.startsWith('/evenement/')?['Agenda','/agenda']:null;
  const crumb=parent?`<a href="#${parent[1]}">${parent[0]}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(socialRoute?'Retrouvez-nous':String(title).replace(/<[^>]+>/g,' '))}</span>`:`<span aria-current="page">${esc(eye)}</span>`;
  return `<section class="wrap page-top"><nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="#/">Accueil</a><span aria-hidden="true">/</span>${crumb}</nav><div class="page-title-row"><div><span class="eyebrow">${eye}</span><h1>${title}</h1><p class="lead">${desc}</p></div>${action}</div></section>`;
}
function v6AddReturn(){const detail=/^\/(service|association|album|evenement)\//.test(currentRoute);if(!detail)return;const from=v6Entry?.from;if(!from?.hash||from.hash===location.hash)return;const label=from.hash.startsWith('#/recherche')?'Retour aux résultats de recherche':from.hash.startsWith('#/activites')?'Retour aux activités':from.hash.startsWith('#/autour-de-moi')?'Retour aux lieux':from.hash.startsWith('#/agenda')?'Retour à ma sélection':'Revenir à la page précédente';const a=document.createElement('a');a.href=from.hash;a.className='v6-context-return text-link';a.dataset.action='v6-return';a.innerHTML=icon('arrow-left')+label;$('.breadcrumb')?.insertAdjacentElement('afterend',a);}
function v6Render(animate=true,options={}){
  const stamp=++v6RouteStamp,route=v6Path()==='/annuaire'?'/services':v6Path(),p=v6Params();
  v6Rendering=true;currentRoute=route;closeDialog();closeMenu();v6RestoreFilters(route,p);
  const scenic=['/','/decouvrir','/galerie'].includes(route)||route.startsWith('/album/');document.body.classList.toggle('practical-route',!scenic);document.body.classList.toggle('restoring-route',!!options.restore);
  let view=views[route];if(route.startsWith('/service/'))view=()=>servicePage(route.slice(9));if(route.startsWith('/association/'))view=()=>associationPage(route.slice(13));if(route.startsWith('/album/'))view=()=>albumView(route.slice(7));if(route.startsWith('/evenement/'))view=()=>v6EventView(route.slice(11));
  $('#main').innerHTML=(view||notFound)();hydrate();if(route==='/services')updateDirectory();if(route==='/agenda')filterAgenda();if(route==='/quartiers'){$('#district-content').innerHTML=districtContent();hydrate();}if(route==='/associations'&&$('#assoc-list'))filterAssociations();
  v6AddReturn();syncNavigation(route);if(route==='/autour-de-moi')$$('[data-menu=quartiers]').forEach(e=>{e.classList.add('nav-current');e.setAttribute('aria-current','true');});
  document.title=($('#main h1')?.textContent||'Meudon')+' — Meudon';animateCounters();document.dispatchEvent(new CustomEvent('meudon:route'));
  const finish=()=>{if(stamp!==v6RouteStamp)return;const y=options.restore?Math.max(0,Number(v6Entry?.scroll)||0):0;window.scrollTo({top:y,behavior:'instant'});const target=options.restore?v6FindFocus(options.focus||v6Entry?.focus):null;if(target)target.focus({preventScroll:true});else if(animate)$('#main').focus({preventScroll:true});v6Rendering=false;};
  finish();
}
pageTop=v6PageTop;agendaView=v6AgendaView;filterAgenda=v6FilterAgenda;render=v6Render;
updateSaved=function(id){const active=document.activeElement;const buttons=$$('#agenda-events [data-action="save-event"]');const index=buttons.indexOf(active);v6Base.updateSaved(id);if(index>=0&&!active.isConnected){const remaining=$$('#agenda-events [data-action="save-event"]');(remaining[Math.min(index,remaining.length-1)]||$('#agenda-favorites'))?.focus({preventScroll:remaining.length>0});}};
directoryView=function(){return v6Base.directoryView().replace('<div class="directory-searchbar">',`<nav class="v6-frequent-actions" aria-label="Démarches fréquentes">${[['Payer la cantine','famille'],['Carte d’identité et passeport','identite'],['Signaler un problème','signaler']].map(([label,id])=>`<a href="#/service/${id}">${label} ${icon('arrow-right')}</a>`).join('')}<a href="#/famille">Inscrire mon enfant ${icon('arrow-right')}</a></nav><div class="directory-searchbar">`).replace('<div id="directory-results">','<div id="v6-directory-active" class="v6-active-filters"></div><div id="directory-results">');};
updateDirectory=function(){v6Base.updateDirectory();const box=$('#v6-directory-active');if(box){const active=[directoryState.category!=='Tous'?directoryState.category:'',directoryState.savedOnly?'Mes raccourcis':'',directoryState.query?'« '+directoryState.query+' »':'',directoryState.sort==='az'?'A à Z':''].filter(Boolean);box.innerHTML=active.length?`<span>${active.map(esc).join(' · ')}</span><a href="#/services" class="text-link">Tout effacer ${icon('x')}</a>`:'';}};
if(typeof v6ServicePage==='function')servicePage=v6ServicePage;
if(typeof v6AssociationPage==='function')associationPage=v6AssociationPage;
if(typeof v6FamilyView==='function')familyView=v6FamilyView;
if(typeof v6ActivitiesView==='function')activitiesView=v6ActivitiesView;
Object.assign(views,{'/retrouvez-nous':window.retrouvezNousView,'/reseaux':window.retrouvezNousView,'/services':directoryView,'/annuaire':directoryView,'/agenda':v6AgendaView,'/famille':familyView,'/activites':activitiesView,'/recherche':v6SearchView,'/autour-de-moi':v6AroundView,'/autour':v6AroundView,'/nouvel-arrivant':v6NewResidentView});
districtContent=function(){return v6Base.districtContent()+(typeof v6DistrictExtras==='function'?v6DistrictExtras(state.district):'');};
if(typeof v6AssociationDirectoryView==='function')views['/associations']=v6AssociationDirectoryView;
menuGroups.quartiers.items.unshift(['Autour de moi','Équipements, services et carte','map','#/autour-de-moi']);
menuGroups.quotidien.items.push(['Je m’installe à Meudon','Les premiers repères','compass','#/nouvel-arrivant']);
menuGroups.sortir.items.splice(2,0,['Trouver un équipement','Adresses et carte des lieux','pin','#/autour-de-moi']);
home=function(){return v6Base.home().replace('<section class="wrap practical-band"',`<section class="wrap v6-proximity-entry"><a href="#/autour-de-moi">${icon('map')}<span><strong>Autour de moi</strong><small>Les équipements et les services sur une carte</small></span>${icon('arrow-right')}</a><a href="#/nouvel-arrivant">${icon('compass')}<span><strong>Je m’installe à Meudon</strong><small>Mes premiers repères et démarches</small></span>${icon('arrow-right')}</a></section><section class="wrap practical-band"`);};views['/']=home;
// Only local routes are intercepted; modified clicks retain the browser's normal behavior.
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]'),action=b?.dataset.action;
  if(action==='v6-return'){e.preventDefault();e.stopImmediatePropagation();if(v6Entry?.from?.entry)history.back();else v6Navigate(b.getAttribute('href'));return;}
  const a=e.target.closest('a[href^="#/"]');if(a&&(!a.dataset.action||a.dataset.action==='close-link')&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();v6Navigate(a.getAttribute('href'));return;}
  if(!b)return;
  let changes=null;
  if(action==='event'){e.preventDefault();e.stopImmediatePropagation();v6Navigate('#/evenement/'+b.dataset.id);return;}
  if(action==='v6-period')changes={periode:b.dataset.value==='toutes'?null:b.dataset.value,mois:null,favoris:null};
  if(action==='v6-favorites')changes={favoris:state.savedOnly?null:'1',periode:null,mois:null};
  if(action==='agenda-filter')changes={categorie:b.dataset.value==='Tout'?null:b.dataset.value};
  if(action==='directory-filter')changes={categorie:b.dataset.value==='Tous'?null:b.dataset.value};
  if(action==='directory-saved')changes={favoris:directoryState.savedOnly?null:'1'};
  if(action==='assoc-filter')changes={categorie:b.dataset.value==='Tout'?null:b.dataset.value};
  if(action==='family-age')changes={age:b.dataset.value==='Tous les âges'?null:b.dataset.value};
  if(['reset-directory','reset-associations','reset-agenda'].includes(action)){e.preventDefault();e.stopImmediatePropagation();v6Navigate('#'+currentRoute,{preserveScroll:true});return;}
  if(changes){e.preventDefault();e.stopImmediatePropagation();v6SetFilters(changes);}
},true);
document.addEventListener('change',e=>{
  const id=e.target.id,options={'agenda-district':'quartier','agenda-organizer':'organisateur','agenda-audience':'public','directory-sort':'tri'};
  if(options[id]){e.stopImmediatePropagation();v6SetFilters({[options[id]]:['Tous','usage'].includes(e.target.value)?null:e.target.value});}
  if(id==='v6-agenda-free'){e.stopImmediatePropagation();v6SetFilters({gratuit:e.target.checked?'1':null});}
  if(id==='v6-agenda-month'){e.stopImmediatePropagation();v6SetFilters({mois:e.target.value||null,periode:e.target.value?'mois':null,favoris:null});}
},true);
document.addEventListener('input',e=>{
  if(e.target.id==='directory-search'||e.target.id==='association-search')v6ReplaceFilter('q',e.target.value);
  if(e.target.id==='v6-agenda-search'){v6Agenda.query=e.target.value;v6ReplaceFilter('q',e.target.value);filterAgenda();}
});
window.addEventListener('scroll',()=>{if(!v6ScrollFrame)v6ScrollFrame=requestAnimationFrame(()=>{v6ScrollFrame=0;v6Remember();});},{passive:true});
function v6HistoryChanged(){const next=history.state?.meudon;if(next?.id===v6Entry?.id&&v6Path()===currentRoute)return;v6Entry=next||v6NewEntry(null);history.replaceState({...history.state,meudon:v6Entry},'');v6Render(true,{restore:!!next});}
window.addEventListener('popstate',v6HistoryChanged);window.addEventListener('hashchange',v6HistoryChanged);
window.addEventListener('pagehide',v6Remember);
window.MeudonV6={navigate:v6Navigate,replaceFilter:v6ReplaceFilter,setFilters:v6SetFilters,render:()=>v6Render(false,{restore:true})};
history.scrollRestoration='manual';const v6InitialEntry=history.state?.meudon;v6Entry=v6InitialEntry||v6NewEntry(null);history.replaceState({...history.state,meudon:v6Entry},'');v6Render(false,{restore:!!v6InitialEntry});
