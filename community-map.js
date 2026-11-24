/* Public, approved member profiles and project sites only; application responses stay private. */
(() => {
  const svg = document.querySelector('#community-map');
  const source = document.querySelector('#community-member-data');
  if (!svg || !source) return;
  const members = JSON.parse(source.textContent);
  const projects = JSON.parse(document.querySelector('#community-project-data')?.textContent || '[]');
  const entries = members.map(member => ({...member, type:'member', key:`member:${member.id}`}));
  // Each project has one representative pin, with all of its research sites in the popup.
  for (const project of projects) {
    const sites = (project.locations || []).filter(site =>
      Number.isFinite(site.longitude) && Number.isFinite(site.latitude) &&
      Math.abs(site.longitude) <= 180 && Math.abs(site.latitude) <= 90);
    if (!sites.length) continue;
    const country = sites.every(site => site.country === sites[0].country) ? sites[0].country : '';
    // Use a real research site as the representative marker, never an averaged point.
    const longitude = sites[0].longitude;
    const latitude = sites[0].latitude;
    entries.push({...project, ...sites[0], longitude, latitude,
      city:sites.length > 1 ? 'Multiple sites' : sites[0].city, country,
      siteNames:sites.map(site => [site.city, site.country].filter(Boolean).join(', ')),
      id:project.id, type:'project', key:`project:${project.id}`, location:`project-${project.id}`});
  }
  const menu = document.querySelector('#member-location');
  const pins = document.querySelector('#map-pins');
  const canvas = document.querySelector('.map-canvas');
  const popup = document.querySelector('#member-popup');
  const peopleFilter = document.querySelector('#map-show-people');
  const projectsFilter = document.querySelector('#map-show-projects');
  const empty = document.querySelector('#map-empty');
  const ns = 'http://www.w3.org/2000/svg';
  const world = { x: 0, y: 0, width: 1080, height: 435 };
  let view = { ...world };
  let activeEntry = null;
  let placements = [];
  let locations = [];
  const coordinateKey = entry => `${entry.longitude.toFixed(5)},${entry.latitude.toFixed(5)}`;
  const visibleEntries = () => entries.filter(entry => entry.type === 'member' ? peopleFilter.checked : projectsFilter.checked);
  const locationText = entry => [entry.label, entry.city, entry.country].filter(Boolean).join(', ');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function updateLocations() {
    const selected = menu.value;
    locations = [];
    for (const entry of visibleEntries()) {
      const coordinates = coordinateKey(entry);
      let location = locations.find(item => item.coordinates === coordinates);
      if (!location) {
        location = {id:entry.location, coordinates, label:[entry.city, entry.country].filter(Boolean).join(', '),
          x:(entry.longitude+180)*3, y:(85-entry.latitude)*3, entries:[]};
        locations.push(location);
      }
      location.entries.push(entry);
    }
    locations.sort((a,b) => a.label.localeCompare(b.label));
    menu.replaceChildren(new Option('Starting view','overview'), new Option('All locations','all'));
    for (const location of locations) menu.append(new Option(`${location.label} (${location.entries.length})`,location.id));
    menu.value = [...menu.options].some(option => option.value === selected) ? selected : 'overview';
    empty.hidden = visibleEntries().length > 0;
    empty.textContent = !peopleFilter.checked && !projectsFilter.checked
      ? 'Select People or Projects to see locations on the map.'
      : 'Project locations will appear here as projects are added.';
  }
  function node(tag, attributes) {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }
  function closePopup(restoreFocus = false) {
    const previous = activeEntry;
    activeEntry = null;
    popup.hidden = true;
    for (const pin of pins.querySelectorAll('.map-pin')) {
      pin.classList.remove('is-selected');
      pin.setAttribute('aria-expanded','false');
    }
    if (restoreFocus && previous) [...pins.children].find(pin => pin.dataset.entry === previous.key)?.focus();
  }
  function positionPopup() {
    if (!activeEntry) return;
    const placement = placements.find(p => p.entry.key === activeEntry.key);
    if (!placement) { closePopup(); return; }
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const left = Math.max(10,Math.min(canvas.clientWidth-width-10,placement.px-width/2));
    let top = placement.py-height-24;
    if (top < 10) top = placement.py+26;
    top = Math.max(10,Math.min(canvas.clientHeight-height-10,top));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }
  function paragraph(text, className) {
    const p = document.createElement('p');
    p.textContent = text;
    if (className) p.className = className;
    return p;
  }
  function openPopup(entry, keyboard) {
    activeEntry = entry;
    popup.replaceChildren();
    popup.classList.toggle('project-popup',entry.type === 'project');
    popup.setAttribute('aria-label',entry.name);
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'popup-close';
    close.setAttribute('aria-label', entry.type === 'project' ? 'Close project details' : 'Close member profile');
    close.textContent = '×'; close.addEventListener('click',() => closePopup(true));
    popup.append(close);
    const group = placements.find(placement => placement.entry.key === entry.key)?.entries || [entry];
    const displayed = [entry, ...group.filter(item => item.key !== entry.key)];
    const cards = document.createElement('div'); cards.className = 'popup-profiles';
    cards.setAttribute('aria-label', group.length > 1 ? 'People and projects at nearby locations' : 'Location details');
    if (group.length > 1) cards.tabIndex = 0;
    for (const item of displayed) {
      const card = document.createElement('article'); card.className = 'popup-profile';
      if (item.type === 'member' && item.image) {
        const image = document.createElement('img');
        image.src = item.image; image.alt = item.name; image.width = 76; image.height = 76;
        image.addEventListener('load',positionPopup,{once:true}); card.append(image);
      }
      const name = document.createElement('h3'); name.className = 'popup-name'; name.textContent = item.name; card.append(name);
      if (item.type === 'project') {
        if (item.pi) card.append(paragraph(`${item.leadLabel || 'PI'}: ${Array.isArray(item.pi) ? item.pi.join(', ') : item.pi}`));
        card.append(paragraph(item.siteNames.join(' · '),'popup-city'));
        if (item.summary) card.append(paragraph(`Topic: ${item.summary}`,'popup-summary'));
      } else {
        card.append(paragraph(item.institution),paragraph(locationText(item),'popup-city'));
        card.append(window.GEFIMemberRoles.render(item));
      }
      cards.append(card);
    }
    popup.append(cards);
    popup.hidden = false;
    for (const pin of pins.querySelectorAll('.map-pin')) {
      const active = pin.dataset.entry === entry.key;
      pin.classList.toggle('is-selected',active); pin.setAttribute('aria-expanded',String(active));
    }
    positionPopup();
    if (keyboard) close.focus();
  }
  function draw() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const height = view.width*rect.height/rect.width;
    view.y += (view.height-height)/2; view.height = height;
    svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
    const scale = rect.width/view.width;
    placements = []; pins.replaceChildren();
    const shown = visibleEntries();
    // At broad zoom levels, nearby locations share one numbered marker rather
    // than being displaced far from their actual coordinates. Zooming separates
    // the group automatically; its popup provides access to every item.
    const groups = [];
    for (const entry of shown) {
      const x = (entry.longitude+180)*3, y = (85-entry.latitude)*3;
      const px = (x-view.x)*scale, py = (y-view.y)*scale;
      let group = groups.find(item => Math.abs(item.px-px) < 18 && Math.abs(item.py-py) < 24);
      if (!group) {
        group = {entry, x, y, px, py, entries:[]};
        groups.push(group);
      }
      group.entries.push(entry);
    }
    for (const group of groups) {
      const {entry, x, y, px, py} = group;
      if (px < -30 || px > rect.width+30 || py < -30 || py > rect.height+30) continue;
      placements.push(group);
      const active = activeEntry?.key === entry.key;
      const pin = node('g',{
        transform:`translate(${x} ${y}) scale(${0.72/scale})`,
        class:`map-pin map-pin--${entry.type}${active?' is-selected':''}`, role:'button',tabindex:'0',
        'aria-label':group.entries.length > 1 ? `${group.entries.length} nearby locations — ${locationText(entry)}` : `${entry.type === 'project' ? 'Project' : 'Person'}: ${entry.name} — ${locationText(entry)}`,
        'aria-expanded':String(active),'aria-controls':'member-popup','aria-haspopup':'dialog',
        'data-entry':entry.key, [`data-${entry.type}`]:entry.id,
        'data-longitude':entry.longitude,'data-latitude':entry.latitude
      });
      const tooltip = node('title',{}); tooltip.textContent = `${entry.name} · ${entry.city}`;
      pin.append(tooltip,node('path',{d:'M0 0 C-3 -5 -12 -12 -12 -20 A12 12 0 1 1 12 -20 C12 -12 3 -5 0 0Z',class:'map-pin-shape'}));
      if (group.entries.length > 1) {
        const count = node('text',{x:0,y:-21,'text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true'});
        count.textContent = group.entries.length; pin.append(count);
      } else if (entry.type === 'project') {
        pin.append(node('path',{d:'M0 -29 L7 -22 L0 -15 L-7 -22 Z',fill:'#fff','aria-hidden':'true'}));
      } else {
        pin.append(node('circle',{cx:0,cy:-23,r:3,fill:'#fff','aria-hidden':'true'}),node('path',{d:'M-5 -15 Q-5 -19 0 -19 Q5 -19 5 -15 Z',fill:'#fff','aria-hidden':'true'}));
      }
      pin.addEventListener('keydown',event => {
        if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();openPopup(entry,true);}
      });
      pins.append(pin);
    }
    document.querySelector('#map-zoom-in').disabled = view.width <= 3;
    document.querySelector('#map-zoom-out').disabled = view.width >= world.width;
    positionPopup();
  }
  function fitLocations() {
    if (!locations.length) {reset();return;}
    const xs = locations.map(location => location.x), ys = locations.map(location => location.y);
    const rect = svg.getBoundingClientRect();
    const width = Math.max(45,Math.max(...xs)-Math.min(...xs)+85,(Math.max(...ys)-Math.min(...ys)+85)*rect.width/rect.height);
    setCamera(width,(Math.max(...xs)+Math.min(...xs))/2,(Math.max(...ys)+Math.min(...ys))/2);
  }
  function updateLayers() {
    closePopup();updateLocations();
    menu.value = 'all';fitLocations();
  }
  peopleFilter.addEventListener('change',updateLayers);
  projectsFilter.addEventListener('change',updateLayers);
  updateLocations();
  function setCamera(width, centerX, centerY) {
    const rect = svg.getBoundingClientRect();
    width = Math.max(3,Math.min(world.width,width));
    const height = width * rect.height / rect.width;
    view = {x:centerX-width/2,y:centerY-height/2,width,height};
    draw();
  }
  function zoomAt(factor, px, py) {
    const rect = svg.getBoundingClientRect();
    px ??= rect.width/2;
    py ??= rect.height/2;
    const x = view.x + px/rect.width*view.width;
    const y = view.y + py/rect.height*view.height;
    const width = Math.max(3,Math.min(world.width,view.width*factor));
    const height = width*rect.height/rect.width;
    view = {x:x-px/rect.width*width,y:y-py/rect.height*height,width,height};
    draw();
  }
  function reset() {
    closePopup();
    menu.value = 'overview';
    // Desktop fits the member locations with less polar space. Phones start closer
    // to the largest concentration, and the map can be dragged to every region.
    const rect = svg.getBoundingClientRect();
    const phone = rect.width < 600;
    setCamera(phone ? Math.min(310,350*rect.width/rect.height) : 920,phone ? 270 : 580,215);
  }
  menu.addEventListener('change', () => {
    closePopup();
    if (menu.value === 'overview') { reset(); return; }
    if (menu.value === 'all') {
      fitLocations();
      return;
    }
    const location = locations.find(item => item.id === menu.value);
    setCamera(svg.getBoundingClientRect().width < 600 ? 24 : 45,location.x,location.y);
  });
  document.querySelector('#map-zoom-in').addEventListener('click', () => zoomAt(.65));
  document.querySelector('#map-zoom-out').addEventListener('click', () => zoomAt(1/.65));
  document.querySelector('#map-reset').addEventListener('click', reset);
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const delta = event.deltaY*(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    zoomAt(Math.exp(Math.max(-100,Math.min(100,delta))*.003),event.clientX-rect.left,event.clientY-rect.top);
  },{passive:false});
  svg.addEventListener('dblclick', event => {
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    zoomAt(.5,event.clientX-rect.left,event.clientY-rect.top);
  });
  // Consume the compatibility click after pointerup. A popup may cover the tap
  // position, and that same gesture must never click its biography link.
  let suppressCompatibilityClick = false;
  canvas.addEventListener('pointerdown', () => { suppressCompatibilityClick=false; },true);
  canvas.addEventListener('click', event => {
    if (suppressCompatibilityClick && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
      suppressCompatibilityClick=false;
    }
  },true);
  const pointers = new Map();
  let gesture = null;
  let moved = false;
  let clickedEntry = null;
  function beginGesture() {
    const points = [...pointers.values()];
    const rect = svg.getBoundingClientRect();
    const mid = points.length > 1 ? {x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2} : points[0];
    gesture = {view:{...view},mid,distance:points.length>1?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0,
      worldX:view.x+(mid.x-rect.left)/rect.width*view.width,worldY:view.y+(mid.y-rect.top)/rect.height*view.height};
  }
  svg.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    if (!pointers.size) {
      moved=false;
      clickedEntry=event.target.closest('.map-pin')?.dataset.entry || null;
    } else { moved=true; clickedEntry=null; }
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    svg.setPointerCapture(event.pointerId);
    beginGesture();
  });
  svg.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const points=[...pointers.values()];
    const rect=svg.getBoundingClientRect();
    if (points.length > 1) {
      moved=true;
      closePopup();
      const mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      const width=Math.max(3,Math.min(1080,gesture.view.width*gesture.distance/Math.max(1,distance)));
      const height=width*rect.height/rect.width;
      view={x:gesture.worldX-(mid.x-rect.left)/rect.width*width,y:gesture.worldY-(mid.y-rect.top)/rect.height*height,width,height};
    } else {
      const dx=points[0].x-gesture.mid.x,dy=points[0].y-gesture.mid.y;
      if (!moved && Math.hypot(dx,dy)<4) return;
      if (!moved) closePopup();
      moved=true;
      view={...gesture.view,x:gesture.view.x-dx*gesture.view.width/rect.width,y:gesture.view.y-dy*gesture.view.height/rect.height};
    }
    canvas.classList.add('is-dragging');
    draw();
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (pointers.size) { beginGesture(); return; }
    canvas.classList.remove('is-dragging');
    suppressCompatibilityClick=true;
    if (!moved && event.type !== 'pointercancel') {
      if (clickedEntry) openPopup(entries.find(entry=>entry.key===clickedEntry),false);
      else closePopup();
    }
    gesture=null;
  }
  svg.addEventListener('pointerup',endPointer);
  svg.addEventListener('pointercancel',endPointer);
  svg.addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      closePopup();
      const rect=svg.getBoundingClientRect();
      const dx=event.key==='ArrowLeft'?-70:event.key==='ArrowRight'?70:0;
      const dy=event.key==='ArrowUp'?-70:event.key==='ArrowDown'?70:0;
      view.x+=dx*view.width/rect.width;view.y+=dy*view.height/rect.height;draw();
    } else if (event.key==='+' || event.key==='=') {event.preventDefault();zoomAt(.65);}
    else if (event.key==='-') {event.preventDefault();zoomAt(1/.65);}
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && activeEntry) closePopup(true); });
  new ResizeObserver(draw).observe(svg);
  reset();
})();
