/* Public, approved member profiles and project sites only; application responses stay private. */
(() => {
  const svg = document.querySelector('#community-map');
  const source = document.querySelector('#community-member-data');
  if (!svg || !source) return;
  const members = JSON.parse(source.textContent);
  const projects = JSON.parse(document.querySelector('#community-project-data')?.textContent || '[]');
  const entries = members.map(member => ({...member, type:'member', key:`member:${member.id}`}));
  // A project has one record and may have several research sites. Its PI's base
  // does not imply where the project takes place.
  for (const project of projects) {
    for (const site of project.locations || []) {
      if (!Number.isFinite(site.longitude) || !Number.isFinite(site.latitude) ||
          Math.abs(site.longitude) > 180 || Math.abs(site.latitude) > 90) continue;
      entries.push({...project, ...site, id:project.id, type:'project',
        key:`project:${project.id}:${site.id}`, location:`project-${project.id}-${site.id}`});
    }
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
  const projectSites = entries.filter(entry => entry.type === 'project');
  document.querySelector('#project-layer-count').textContent = projects.length;
  document.querySelector('#people-layer-count').textContent = members.length;
  document.querySelector('#atlas-project-count').textContent = `${plural(projects.length, 'project')} · ${plural(projectSites.length, 'research location')}`;
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
    if (entry.type === 'member') {
      const image = document.createElement('img');
      image.src = entry.image; image.alt = entry.name; image.width = 76; image.height = 76;
      image.addEventListener('load',positionPopup,{once:true});
      popup.append(image);
    }
    const name = document.createElement(entry.type === 'member' ? 'a' : 'h3');
    name.className = 'popup-name'; name.textContent = entry.name;
    if (entry.type === 'member') name.href = entry.profile;
    popup.append(name);
    if (entry.type === 'project') {
      if (entry.pi) popup.append(paragraph(`${entry.leadLabel || "PI"}: ${Array.isArray(entry.pi) ? entry.pi.join(', ') : entry.pi}`));
      if (entry.institution) popup.append(paragraph(entry.institution));
      popup.append(paragraph(locationText(entry),'popup-city'));
      if (entry.timeline) popup.append(paragraph(`Timeline: ${entry.timeline}`));
      if (entry.locationNote) popup.append(paragraph(entry.locationNote,'popup-location-note'));
      if (entry.summary) popup.append(paragraph(entry.summary,'popup-summary'));
      const tag = document.createElement('span'); tag.className = 'project-tag';
      tag.textContent = entry.status || 'Research project'; popup.append(tag);
      // Public project links are optional and limited to ordinary web URLs.
      if (/^https?:\/\//i.test(entry.url || '') && !entry.sources?.length) {
        const link = document.createElement('a'); link.href = entry.url;
        link.className = 'popup-project-link'; link.textContent = 'About this project ↗'; popup.append(link);
      }
    } else {
      popup.append(paragraph(entry.institution),paragraph(locationText(entry),'popup-city'));
      popup.append(window.GEFIMemberRoles.render(entry));
    }
    if (entry.type === 'project' && entry.sources?.length) {
      const sources = document.createElement('details'); sources.className = 'popup-sources';
      const summary = document.createElement('summary'); summary.textContent = 'Project sources'; sources.append(summary);
      const list = document.createElement('ul');
      for (const source of entry.sources) {
        if (!/^https?:\/\//i.test(source.url || '')) continue;
        const item = document.createElement('li'); const link = document.createElement('a');
        link.href = source.url; link.textContent = source.title; item.append(link); list.append(item);
      }
      sources.append(list); sources.addEventListener('toggle',positionPopup); popup.append(sources);
    }
    const colocated = locations.find(location => location.coordinates === coordinateKey(entry))?.entries || [];
    if (colocated.length > 1) {
      const label = document.createElement('label'); label.className = 'popup-colocated-label';
      label.htmlFor = 'colocated-entry';
      const people = colocated.filter(item => item.type === 'member').length;
      const sites = colocated.length-people;
      label.textContent = [people ? `${people} ${people === 1 ? 'person' : 'people'}` : '',sites ? plural(sites,'project') : ''].filter(Boolean).join(' · ')+' at this location';
      const picker = document.createElement('select'); picker.id = 'colocated-entry';
      for (const other of colocated) picker.append(new Option(`${other.type === 'project' ? 'Project' : 'Person'}: ${other.name}`,other.key));
      picker.value = entry.key;
      picker.addEventListener('change',() => {
        openPopup(entries.find(other => other.key === picker.value),false);
        popup.querySelector('select')?.focus();
      });
      popup.append(label,picker);
    }
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
    // Project symbols sit above people; the shared-location picker keeps both accessible.
    for (const entry of shown) {
      const x = (entry.longitude+180)*3, y = (85-entry.latitude)*3;
      if (x < view.x || x > view.x+view.width || y < view.y || y > view.y+view.height) continue;
      placements.push({entry,x,y,px:(x-view.x)*scale,py:(y-view.y)*scale});
      const active = activeEntry?.key === entry.key;
      const pin = node('g',{
        transform:`translate(${x} ${y}) scale(${1/scale})`,
        class:`map-pin map-pin--${entry.type}${active?' is-selected':''}`, role:'button',tabindex:'0',
        'aria-label':`${entry.type === 'project' ? 'Project' : 'Person'}: ${entry.name} — ${locationText(entry)}`,
        'aria-expanded':String(active),'aria-controls':'member-popup','aria-haspopup':'dialog',
        'data-entry':entry.key, [`data-${entry.type}`]:entry.id,
        'data-longitude':entry.longitude,'data-latitude':entry.latitude
      });
      const tooltip = node('title',{}); tooltip.textContent = `${entry.name} · ${entry.city}`;
      pin.append(tooltip,node('path',{d:'M0 0 C-3 -5 -12 -12 -12 -20 A12 12 0 1 1 12 -20 C12 -12 3 -5 0 0Z',class:'map-pin-shape'}));
      if (entry.type === 'project') pin.append(node('path',{d:'M0 -29 L7 -22 L0 -15 L-7 -22 Z',fill:'#fff','aria-hidden':'true'}));
      else pin.append(node('circle',{cx:0,cy:-23,r:3,fill:'#fff','aria-hidden':'true'}),node('path',{d:'M-5 -15 Q-5 -19 0 -19 Q5 -19 5 -15 Z',fill:'#fff','aria-hidden':'true'}));
      const colocated = locations.find(location => location.coordinates === coordinateKey(entry)).entries;
      if (colocated.length > 1 && colocated.at(-1).key === entry.key) {
        pin.append(node('circle',{cx:11,cy:-31,r:8,fill:'#333f36',stroke:'#fff','stroke-width':1,'aria-hidden':'true'}));
        const count = node('text',{x:11,y:-31,'text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true'});
        count.textContent = colocated.length; pin.append(count);
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
