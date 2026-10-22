'use strict';
/* ШКОЛА+ · схема здания по фотографиям стендов, октябрь 2026.
   Модуль изолирован от остальных экранов и базы данных. */
const SCHOOL_FLOOR_GEOMETRY = {
  1: {
    corridors: [
      [55,245,1065,70],[240,115,40,350],[695,245,65,205]
    ],
    zones: [
      {n:'Гардероб',label:'ГАРДЕРОБ',x:55,y:96,w:155,h:145,t:'public',sub:'Верхняя зона'},
      {n:'Гардероб',label:'ГАРДЕРОБ',x:55,y:327,w:155,h:130,t:'public',sub:'Нижняя зона'},
      {n:'Туалет МГН',label:'МГН',x:291,y:96,w:54,h:102,t:'service'},
      {n:'Мужской туалет',label:'М',x:360,y:96,w:61,h:102,t:'service',sub:'Туалет'},
      {n:'Женский туалет',label:'Ж',x:421,y:96,w:61,h:102,t:'service',sub:'Туалет'},
      {n:'Кабинет врача',label:'МЕДПУНКТ',x:500,y:96,w:106,h:140,t:'public'},
      {n:'Мужская раздевалка',label:'МУЖСКАЯ',x:620,y:96,w:103,h:140,t:'public',sub:'раздевалка'},
      {n:'Женская раздевалка',label:'ЖЕНСКАЯ',x:723,y:96,w:103,h:140,t:'public',sub:'раздевалка'},
      {n:'Душевая',label:'ДУШЕВЫЕ',x:826,y:96,w:93,h:140,t:'public'},
      {n:'Спортивный зал',label:'СПОРТИВНЫЙ',x:948,y:96,w:180,h:361,t:'public',sub:'ЗАЛ'},
      {n:'Зона мытья рук',label:'УМЫВАЛЬНИК',x:295,y:327,w:133,h:43,t:'public'},
      {n:'Обеденный зал',label:'ОБЕДЕННЫЙ ЗАЛ',x:428,y:327,w:243,h:130,t:'public'},
      {n:'Спортивный зал',label:'СПОРТЗАЛ',x:760,y:327,w:149,h:130,t:'public',sub:'зона спортзала'}
    ],
    facilities:[
      {k:'stair',x:210,y:125,w:50,h:110},{k:'stair',x:210,y:345,w:50,h:95},
      {k:'lift',x:291,y:208,w:54,h:42},{k:'fire',x:895,y:267,w:35,h:35}
    ],
    exits:[[53,264],[53,317],[241,478],[958,478]]
  },
  2: {
    corridors:[[55,240,1075,105]],
    zones:[
      {n:'201',x:55,y:86,w:282,h:153,t:'study'},
      {n:'215',x:337,y:86,w:262,h:153,t:'study',sub:'IT-ПОЛИГОН'},
      {n:'235',x:599,y:86,w:162,h:153,t:'study'},
      {n:'232',x:761,y:86,w:137,h:153,t:'study',sub:'ИНЖЕНЕРНАЯ ЛАБ.'},
      {n:'Конференц-зал',label:'КОНФЕРЕНЦ-ЗАЛ',x:975,y:86,w:155,h:258,t:'public'},
      {n:'217',x:220,y:351,w:218,h:120,t:'study'},
      {n:'218',x:438,y:351,w:224,h:120,t:'study'},
      {n:'216',x:929,y:351,w:201,h:120,t:'study'}
    ],
    facilities:[
      {k:'fire',x:55,y:351,w:65,h:120},{k:'stair',x:155,y:351,w:65,h:120},
      {k:'wc',x:668,y:351,w:65,h:120},{k:'wc',x:733,y:351,w:65,h:120},
      {k:'lift',x:798,y:351,w:59,h:120},{k:'stair',x:857,y:351,w:72,h:120},
      {k:'stair',x:898,y:86,w:77,h:153}
    ]
  },
  3: {
    corridors:[[77,238,1063,111]],
    zones:[
      {n:'305',x:107,y:89,w:144,h:149,t:'study'},
      {n:'303',x:251,y:89,w:140,h:149,t:'study'},
      {n:'302',x:391,y:89,w:142,h:149,t:'study'},
      {n:'301',x:533,y:89,w:149,h:149,t:'study'},
      {n:'304',x:682,y:89,w:145,h:149,t:'study'},
      {n:'310',x:827,y:89,w:106,h:149,t:'study'},
      {n:'310',x:933,y:89,w:119,h:149,t:'study'},
      {n:'308',x:293,y:350,w:268,h:128,t:'study',sub:'ФИЗИКА'},
      {n:'312',x:561,y:350,w:187,h:128,t:'study'},
      {n:'326',x:961,y:350,w:92,h:128,t:'study'},
      {n:'324',x:1053,y:350,w:87,h:128,t:'study',sub:'ШАХМАТЫ'}
    ],
    facilities:[
      {k:'fire',x:77,y:350,w:76,h:128},{k:'stair',x:153,y:350,w:78,h:128},
      {k:'wc',x:748,y:350,w:69,h:128},{k:'wc',x:817,y:350,w:62,h:128},
      {k:'lift',x:879,y:350,w:40,h:128},{k:'stair',x:919,y:350,w:42,h:128}
    ]
  },
  4: {
    corridors:[[105,245,1040,112]],
    zones:[
      {n:'405',x:112,y:86,w:135,h:159,t:'study'},
      {n:'403',x:247,y:86,w:139,h:159,t:'study'},
      {n:'411',x:386,y:86,w:92,h:159,t:'study'},
      {n:'411',x:478,y:86,w:95,h:159,t:'study'},
      {n:'406',x:573,y:86,w:139,h:159,t:'study'},
      {n:'404',x:712,y:86,w:132,h:159,t:'study'},
      {n:'409',x:844,y:86,w:187,h:159,t:'study',sub:'БИОЛОГИЯ'},
      {n:'407',x:287,y:357,w:247,h:124,t:'study',sub:'ХИМИЯ'},
      {n:'412',x:534,y:357,w:202,h:124,t:'study'},
      {n:'402',x:953,y:405,w:71,h:76,t:'study'}
    ],
    facilities:[
      {k:'fire',x:105,y:357,w:73,h:124},{k:'stair',x:178,y:357,w:77,h:124},
      {k:'wc',x:736,y:357,w:76,h:124},{k:'wc',x:812,y:357,w:67,h:124},
      {k:'lift',x:879,y:357,w:38,h:124},{k:'stair',x:917,y:357,w:36,h:124}
    ]
  }
};

/* Названия-синонимы только для привязки, список существующих помещений не переписываем. */
const SCHOOL_ZONE_ALIASES = {
  'Кабинет врача':['Медпункт','Медицинский кабинет'],
  'Спортивный зал':['Спортзал','Спортивный зал 1','Спортивный зал 2'],
  'Гардероб':['Гардероб 1','Гардероб 2'],
  'Обеденный зал':['Столовая'],
  'Туалет МГН':['Туалет МГН 1']
};
function schoolFindRoom(rooms, number) {
  const names = [number, ...(SCHOOL_ZONE_ALIASES[number] || [])];
  return rooms.find(r => names.includes(String(r.number).trim()));
}
function schoolZoneBadge(z, r, mode, maxRecent) {
  if (!r) return '';
  if (mode === 'heat') return r.recent ? `${r.recent} / 30 дн.` : 'нет заявок';
  return r.active ? `${r.active} ${roomWord(r.active)}` : 'нет проблем';
}
function schoolSvgRect(obj, cl) {
  return `<rect x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" class="${cl}"/>`;
}
function schoolFacility(f) {
  const midX=f.x+f.w/2, midY=f.y+f.h/2;
  const label = f.k === 'stair' ? 'Лестница' : f.k === 'wc' ? 'Туалет' : f.k === 'lift' ? 'Лифт' : 'Пожарная зона';
  let symbol;
  if (f.k === 'stair') {
    symbol = '<path d="M-18 14h11V6H2V-2H12V-10H20"/><path d="M13-17l7 7-7 7"/>';
  } else if (f.k === 'wc') {
    symbol = '<circle cx="0" cy="-12" r="4"/><path d="M-9 12l5-16h8l5 16M0-4v18"/>';
  } else if (f.k === 'lift') {
    symbol = '<rect x="-16" y="-19" width="32" height="38" rx="2"/><path d="M0-16v32M-10-5l5-5 5 5M10 5l-5 5-5-5"/>';
  } else {
    symbol = '<circle r="13"/><path d="M-15-15L15 15M15-15L-15 15"/>';
  }
  return `<g class="sp-facility">${schoolSvgRect(f,'sp-service')}<title>${label}</title><g class="sp-facility-line" transform="translate(${midX} ${midY})">${symbol}</g></g>`;
}

function schoolDrawZone(z, r, floor, mode, selected, maxRecent) {
  const name = z.label || z.n;
  const isNumber = /^\d+$/.test(z.n);
  const lvl = mode === 'heat' ? (r && r.recent ? Math.max(1,Math.min(4,Math.ceil(r.recent / maxRecent*4))) : 0)
                             : (r ? Math.max(0,Math.min(4,Number(r.worst)||0)) : 0);
  const cls = `sp-zone sp-${z.t || 'study'} sp-${mode}-${lvl}${r ? ' sp-bound' : ' sp-no-record'}${selected && r && r.id === selected.id ? ' sp-selected' : ''}`;
  const labelLen=name.length, size=isNumber ? Math.min(25, z.w*.33) : Math.min(15,labelLen>14?z.w/12:z.w/8);
  const x=z.x+z.w/2, y=z.y+z.h/2;
  const subtitle=z.sub ? `<text x="${x}" y="${y+22}" class="sp-room-subtitle">${esc(z.sub)}</text>` : '';
  const state=(r && (r.active || (mode==='heat' && r.recent))) ? `<circle class="sp-room-indicator" cx="${z.x+z.w-14}" cy="${z.y+14}" r="5"/>` : '';
  const title = `Кабинет/зона ${z.n}. ${r ? schoolZoneBadge(z,r,mode,maxRecent) : 'Нет в списке помещений — добавьте через управление кабинетами'}`;
  const shape=`${schoolSvgRect(z,cls)}${state}<text x="${x}" y="${z.sub ? y-5 : y+8}" style="font-size:${size}px" class="sp-room-label">${esc(name)}</text>${subtitle}`;
  return r
    ? `<a class="sp-zone-link" href="${esc(planUrl({floor,room:r.id,mode}))}" aria-label="${esc(title)}"><title>${esc(title)}</title>${shape}</a>`
    : `<g class="sp-zone-static" aria-label="${esc(title)}"><title>${esc(title)}</title>${shape}</g>`;
}
function renderSchoolFloorPlan({ floor, rooms, mode, selRoom, maxRecent }) {
  const data = SCHOOL_FLOOR_GEOMETRY[floor];
  if (!data) return html`<div class="sp-empty-floor">${empty('Схема этажа пока не добавлена','Помещения остаются доступны из списка ниже.')}<div class="chips">${rooms.map(r => html`<a class="chip" href="${planUrl({floor,room:r.id,mode})}">${r.number}</a>`)}</div></div>`;
  const assigned = new Set();
  const layers = data.zones.map(z => {
    const r = schoolFindRoom(rooms,z.n);
    if (r) assigned.add(r.id);
    return schoolDrawZone(z,r,floor,mode,selRoom,maxRecent);
  }).join('');
  const unshown=rooms.filter(r=>!assigned.has(r.id));
  const structural = data.corridors.map(c => schoolSvgRect({x:c[0],y:c[1],w:c[2],h:c[3]},'sp-corridor')).join('');
  const fac = data.facilities.map(schoolFacility).join('');
  const exits = (data.exits || []).map(([x,y]) => `<g class="sp-exit" transform="translate(${x} ${y})"><rect width="75" height="23" rx="3"/><text x="37.5" y="15">ВЫХОД</text></g>`).join('');
  const content=`<svg viewBox="0 0 1200 550" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Схема ${floor} этажа, интерактивная карта помещений" preserveAspectRatio="xMidYMid meet"><title>Интерактивный план ${floor} этажа</title><rect width="1200" height="550" rx="6" class="sp-canvas"/><path d="M45 58H1150 M45 491H1150" class="sp-outline"/>${structural}<text x="600" y="305" class="sp-corridor-title">К О Р И Д О Р</text>${fac}${layers}${exits}<text x="60" y="34" class="sp-title">${floor} ЭТАЖ</text><text x="1135" y="34" class="sp-title-suffix" text-anchor="end">СХЕМА ПОМЕЩЕНИЙ</text><text x="1135" y="527" class="sp-footnote" text-anchor="end">Не является планом эвакуации</text></svg>`;
  return html`<section class="sp-plan-wrap" aria-label="Планы помещений">
    <div class="sp-real-plan"><div class="sp-real-plan-heading"><h3>План ${floor} этажа</h3><p>Оригинальная схема школы № 2098</p></div><img src="/assets/floorplans/floor-${floor}.jpg" alt="План ${floor} этажа школы № 2098" loading="lazy"><a href="/assets/floorplans/floor-${floor}.jpg" target="_blank" rel="noopener noreferrer">Открыть план в полном размере ↗</a></div>
    <details class="sp-digital-details"><summary>Интерактивная схема кабинетов и заявок</summary><div class="sp-plan-scroll" tabindex="0" aria-label="Схема этажа, прокрутите по горизонтали при необходимости"><div class="sp-vector">${raw(content)}</div></div>
    <p class="sp-hint">${mode === 'heat' ? 'Цветом отмечено количество обращений за последние 30 дней.' : 'Нажмите на отмеченное помещение, чтобы открыть его состояние и заявки.'} <span>Масштаб условный.</span></p>
    </details>
    ${unshown.length ? html`<div class="sp-unshown"><span class="muted sm">Другие помещения в системе:</span><div class="chips">${unshown.map(r=>html`<a class="chip" href="${planUrl({floor,room:r.id,mode})}">${r.number}</a>`)}</div></div>` : ''}
  </section>`;
}
