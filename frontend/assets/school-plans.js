'use strict';
/* Школа № 2098 · схема помещений по фотографиям стендов. */
const SCHOOL_FLOOR_GEOMETRY = {
  1: {
    corridorLabel:[800,282],
    corridors: [
      [55,245,893,70],[240,115,40,350],[695,245,65,205]
    ],
    zones: [
      {n:'Гардероб',label:'ГАРДЕРОБ',x:55,y:96,w:155,h:145,t:'public',sub:'Верхняя зона'},
      {n:'Гардероб 2',label:'ГАРДЕРОБ 2',x:55,y:327,w:155,h:130,t:'public',sub:'Нижняя зона'},
      {n:'Туалет МГН',label:'МГН',x:291,y:96,w:54,h:102,t:'service'},
      {n:'Мужской туалет',label:'WC М',x:360,y:96,w:61,h:102,t:'service',sub:'Туалет'},
      {n:'Женский туалет',label:'WC Ж',x:421,y:96,w:61,h:102,t:'service',sub:'Туалет'},
      {n:'Кабинет врача',label:'МЕДПУНКТ',x:500,y:96,w:106,h:140,t:'public'},
      {n:'Мужская раздевалка',label:'МУЖСКАЯ',x:620,y:96,w:103,h:140,t:'public',sub:'раздевалка'},
      {n:'Женская раздевалка',label:'ЖЕНСКАЯ',x:723,y:96,w:103,h:140,t:'public',sub:'раздевалка'},
      {n:'Душевая',label:'ДУШЕВАЯ',x:826,y:96,w:93,h:102,t:'public'},
      {n:'Спортивный зал',label:'СПОРТИВНЫЙ',x:948,y:96,w:180,h:361,t:'public',sub:'ЗАЛ'},
      {n:'Зона мытья рук',label:'УМЫВАЛЬНИК',x:295,y:327,w:133,h:43,t:'public'},
      {n:'Обеденный зал',label:'ОБЕДЕННЫЙ ЗАЛ',x:428,y:327,w:243,h:130,t:'public'},
      {n:'Спортивный зал 2',label:'СПОРТЗАЛ 2',x:760,y:327,w:149,h:130,t:'public',sub:'зона спортзала'},
      {n:'Лестница 1 эт. (у верхнего гардероба)',k:'stair',x:210,y:125,w:50,h:110,t:'service'},
      {n:'Лестница 1 эт. (у нижнего гардероба)',k:'stair',x:210,y:345,w:50,h:95,t:'service'},
      {n:'Лифт 1 эт.',k:'lift',x:291,y:208,w:54,h:42,t:'service'},
      {n:'Зона безопасности 1 эт.',k:'fire',x:895,y:267,w:35,h:35,t:'service'},
      {n:'Туалет МГН 1 эт. (2)',label:'МГН',x:350,y:201,w:53,h:40,t:'service'},
      {n:'Туалет МГН 1 эт. (3)',label:'МГН',x:407,y:201,w:53,h:40,t:'service'},
      {n:'Туалет МГН 1 эт. (4)',label:'МГН',x:833,y:201,w:42,h:39,t:'service'},
      {n:'Туалет МГН 1 эт. (5)',label:'МГН',x:876,y:201,w:43,h:39,t:'service'},
      {n:'Рекреация 1 эт.',label:'РЕКРЕАЦИЯ',x:320,y:252,w:205,h:60,t:'public'},
      {n:'Душевая 2',label:'ДУШ',x:575,y:251,w:94,h:61,t:'service'}
    ],
    exits:[[53,264],[53,317],[241,478],[958,478]]
  },
  2: {
    corridorLabel:[517,290],
    corridors:[[55,239,920,106]],
    zones:[
      {n:'Туалет 2 эт. (Ж)',label:'WC Ж',x:733,y:351,w:65,h:86,t:'service'},
      {n:'Туалет 2 эт. (М)',label:'WC М',x:668,y:351,w:65,h:86,t:'service'},
      {n:'201',x:55,y:86,w:282,h:153,t:'study'},
      {n:'215',x:337,y:86,w:262,h:153,t:'study',sub:'IT-ПОЛИГОН'},
      {n:'235',x:599,y:86,w:162,h:153,t:'study'},
      {n:'232',x:761,y:86,w:137,h:153,t:'study',sub:'ИНЖЕНЕРНАЯ ЛАБ.'},
      {n:'Конференц-зал',label:'КОНФЕРЕНЦ-ЗАЛ',x:975,y:86,w:155,h:258,t:'public'},
      {n:'217',x:220,y:351,w:218,h:120,t:'study'},
      {n:'218',x:438,y:351,w:224,h:120,t:'study'},
      {n:'216',x:929,y:351,w:201,h:120,t:'study'},
      {n:'Зона безопасности 2 эт.',k:'fire',x:55,y:351,w:65,h:120,t:'service'},
      {n:'Лестница 2 эт. (левая)',k:'stair',x:155,y:351,w:65,h:120,t:'service'},
      {n:'Лифт 2 эт.',k:'lift',x:798,y:351,w:59,h:120,t:'service'},
      {n:'Лестница 2 эт. (правая)',k:'stair',x:857,y:351,w:72,h:120,t:'service'},
      {n:'Лестница у конференц-зала',k:'stair',x:898,y:86,w:77,h:153,t:'service'},
      {n:'Туалет МГН 2 эт. (1)',label:'МГН',x:625,y:297,w:40,h:48,t:'service'},
      {n:'Туалет МГН 2 эт. (2)',label:'МГН',x:668,y:437,w:33,h:34,t:'service'},
      {n:'Туалет МГН 2 эт. (3)',label:'МГН',x:701,y:437,w:32,h:34,t:'service'},
      {n:'Рекреация 2 эт.',label:'РЕКРЕАЦИЯ',x:245,y:253,w:186,h:71,t:'public'}
    ]
  },
  3: {
    corridorLabel:[600,289],
    corridors:[[77,238,1063,112]],
    zones:[
      {n:'Туалет 3 эт. (Ж)',label:'WC Ж',x:817,y:350,w:62,h:90,t:'service'},
      {n:'Туалет 3 эт. (М)',label:'WC М',x:748,y:350,w:69,h:90,t:'service'},
      {n:'305',x:107,y:89,w:144,h:149,t:'study'},
      {n:'303',x:251,y:89,w:140,h:149,t:'study'},
      {n:'302',x:391,y:89,w:142,h:149,t:'study'},
      {n:'301',x:533,y:89,w:149,h:149,t:'study'},
      {n:'304',x:682,y:89,w:145,h:149,t:'study'},
      {n:'310',x:827,y:89,w:106,h:149,t:'study'},
      {n:'310А',label:'310А',x:933,y:89,w:119,h:149,t:'study'},
      {n:'308',x:293,y:350,w:268,h:128,t:'study',sub:'ФИЗИКА'},
      {n:'312',x:561,y:350,w:187,h:128,t:'study'},
      {n:'326',x:961,y:350,w:92,h:128,t:'study'},
      {n:'324',x:1053,y:350,w:87,h:128,t:'study',sub:'ШАХМАТЫ'},
      {n:'Зона безопасности 3 эт.',k:'fire',x:77,y:350,w:76,h:128,t:'service'},
      {n:'Лестница 3 эт. (левая)',k:'stair',x:153,y:350,w:78,h:128,t:'service'},
      {n:'Лифт 3 эт.',k:'lift',x:879,y:350,w:40,h:128,t:'service'},
      {n:'Лестница 3 эт. (правая)',k:'stair',x:919,y:350,w:42,h:128,t:'service'},
      {n:'Туалет МГН 3 эт. (1)',label:'МГН',x:706,y:297,w:40,h:48,t:'service'},
      {n:'Туалет МГН 3 эт. (2)',label:'МГН',x:748,y:440,w:35,h:38,t:'service'},
      {n:'Туалет МГН 3 эт. (3)',label:'МГН',x:783,y:440,w:34,h:38,t:'service'},
      {n:'Рекреация 3 эт.',label:'РЕКРЕАЦИЯ',x:252,y:251,w:188,h:77,t:'public'}
    ]
  },
  4: {
    corridorLabel:[568,301],
    corridors:[[105,245,1040,112]],
    zones:[
      {n:'Туалет 4 эт. (Ж)',label:'WC Ж',x:812,y:357,w:67,h:87,t:'service'},
      {n:'Туалет 4 эт. (М)',label:'WC М',x:736,y:357,w:76,h:87,t:'service'},
      {n:'405',x:112,y:86,w:135,h:159,t:'study'},
      {n:'403',x:247,y:86,w:139,h:159,t:'study'},
      {n:'411',x:386,y:86,w:92,h:159,t:'study'},
      {n:'411А',label:'411А',x:478,y:86,w:95,h:159,t:'study'},
      {n:'406',x:573,y:86,w:139,h:159,t:'study'},
      {n:'404',x:712,y:86,w:132,h:159,t:'study'},
      {n:'409',x:844,y:86,w:187,h:159,t:'study',sub:'БИОЛОГИЯ'},
      {n:'407',x:287,y:357,w:247,h:124,t:'study',sub:'ХИМИЯ'},
      {n:'412',x:534,y:357,w:202,h:124,t:'study'},
      {n:'402',x:953,y:405,w:71,h:76,t:'study'},
      {n:'Зона безопасности 4 эт.',k:'fire',x:105,y:357,w:73,h:124,t:'service'},
      {n:'Лестница 4 эт. (левая)',k:'stair',x:178,y:357,w:77,h:124,t:'service'},
      {n:'Лифт 4 эт.',k:'lift',x:879,y:357,w:38,h:124,t:'service'},
      {n:'Лестница 4 эт. (правая)',k:'stair',x:917,y:357,w:36,h:124,t:'service'},
      {n:'Туалет МГН 4 эт. (1)',label:'МГН',x:694,y:304,w:40,h:49,t:'service'},
      {n:'Туалет МГН 4 эт. (2)',label:'МГН',x:736,y:444,w:38,h:37,t:'service'},
      {n:'Туалет МГН 4 эт. (3)',label:'МГН',x:774,y:444,w:38,h:37,t:'service'},
      {n:'Рекреация 4 эт.',label:'РЕКРЕАЦИЯ',x:258,y:263,w:173,h:77,t:'public'}
    ]
  }
};

/* Названия-синонимы только для привязки, список существующих помещений не переписываем. */
const SCHOOL_ZONE_ALIASES = {
  'Кабинет врача':['Медпункт','Медицинский кабинет'],
  'Спортивный зал':['Спортзал','Спортивный зал 1'],
  'Гардероб':['Гардероб 1'],
  'Обеденный зал':['Столовая'],
  'Туалет МГН':['Туалет МГН 1'],
  'Мужской туалет':['Туалет 1 эт. (М)'],
  'Женский туалет':['Туалет 1 эт. (Ж)']
};
function schoolFindRoom(rooms, number) {
  const names = [number, ...(SCHOOL_ZONE_ALIASES[number] || [])];
  return names.map(name => rooms.find(r => String(r.number).trim() === name)).find(Boolean);
}
function schoolRoomName(number) {
  return /^\d/.test(number) ? `Кабинет ${number}` : number;
}
function schoolZoneBadge(r, mode) {
  if (!r) return '';
  if (mode === 'heat') return r.recent ? `${r.recent} / 30 дн.` : 'нет заявок';
  return r.active ? `${r.active} ${roomWord(r.active)}` : 'нет проблем';
}
function schoolSvgRect(obj, cl, radius = 0) {
  return `<rect x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" rx="${radius}" class="${cl}"/>`;
}
function schoolFacilityIcon(f) {
  const midX=f.x+f.w/2, midY=f.y+f.h/2;
  let symbol;
  if (f.k === 'stair') {
    symbol = '<path d="M-18 14h11V6H2V-2H12V-10H20"/><path d="M13-17l7 7-7 7"/>';
  } else if (f.k === 'lift') {
    symbol = '<rect x="-16" y="-19" width="32" height="38" rx="2"/><path d="M0-16v32M-10-5l5-5 5 5M10 5l-5 5-5-5"/>';
  } else {
    symbol = '<circle r="13"/><path d="M-15-15L15 15M15-15L-15 15"/>';
  }
  return `<g class="sp-facility"><g class="sp-facility-line" transform="translate(${midX} ${midY})">${symbol}</g></g>`;
}

function schoolDrawZone(z, r, floor, mode, selected, maxRecent) {
  const name = z.label || z.n;
  const isNumber = /^\d+[А-ЯA-Z]?$/.test(z.n);
  const lvl = mode === 'heat' ? (r && r.recent ? Math.max(1,Math.min(4,Math.ceil(r.recent / maxRecent*4))) : 0)
                             : (r ? Math.max(0,Math.min(4,Number(r.worst)||0)) : 0);
  const cls = `sp-zone sp-${z.t || 'study'} sp-${mode}-${lvl}${r ? ' sp-bound' : ' sp-no-record'}${selected && r && r.id === selected.id ? ' sp-selected' : ''}`;
  const size = Math.min(isNumber ? 28 : 17, (z.w - 8) / (name.length * .67));
  const subSize = z.sub ? Math.min(12, (z.w - 8) / (z.sub.length * .63)) : 0;
  const x=z.x+z.w/2, y=z.y+z.h/2;
  const subtitle=z.sub ? `<text x="${x}" y="${y+size*.48+subSize}" style="font-size:${subSize}px" class="sp-room-subtitle">${esc(z.sub)}</text>` : '';
  const state=(r && (mode === 'heat' ? r.recent : r.active)) ? `<circle class="sp-room-indicator" cx="${z.x+z.w-8}" cy="${z.y+8}" r="3.5"/>` : '';
  const title = `${schoolRoomName(z.n)}. ${r ? schoolZoneBadge(r,mode) : 'Нет в списке помещений — добавьте через управление кабинетами'}`;
  const roomLabel=`<text x="${x}" y="${z.sub ? y-subSize*.55 : y}" style="font-size:${size}px" class="sp-room-label">${esc(name)}</text>${subtitle}`;
  const shape = schoolSvgRect(z,cls,3) + (z.k ? schoolFacilityIcon(z) : roomLabel) + state;
  return r
    ? `<a class="sp-zone-link" aria-current="${selected?.id === r.id ? 'location' : 'false'}" href="${esc(planUrl({floor,room:r.id,mode}))}" aria-label="${esc(title)}"><title>${esc(title)}</title>${shape}</a>`
    : `<g class="sp-zone-static" aria-label="${esc(title)}"><title>${esc(title)}</title>${shape}</g>`;
}
function renderSchoolFloorPlan({ floor, rooms, mode, selRoom, maxRecent }) {
  const data = SCHOOL_FLOOR_GEOMETRY[floor];
  if (!data) return html`<div class="sp-empty-floor">${empty('Схема этажа пока не добавлена','Помещения остаются доступны из списка ниже.')}<div class="chips">${rooms.map(r => html`<a class="chip" href="${planUrl({floor,room:r.id,mode})}">${r.number}</a>`)}</div></div>`;
  const layers = data.zones.map(z => {
    const r = schoolFindRoom(rooms,z.n);
    return schoolDrawZone(z,r,floor,mode,selRoom,maxRecent);
  }).join('');
  const structural = data.corridors.map(c => schoolSvgRect({x:c[0],y:c[1],w:c[2],h:c[3]},'sp-corridor')).join('');
  const exits = (data.exits || []).map(([x,y]) => `<g class="sp-exit" transform="translate(${x} ${y})"><rect width="75" height="23" rx="3"/><text x="37.5" y="15">ВЫХОД</text></g>`).join('');
  const [corridorX, corridorY] = data.corridorLabel;
  const content = `<svg viewBox="30 70 1140 445" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Схема ${floor} этажа">
    <rect x="30" y="70" width="1140" height="445" class="sp-canvas"/>
    ${structural}
    <text x="${corridorX}" y="${corridorY}" class="sp-corridor-title">Коридор</text>
    ${layers}${exits}</svg>`;
  return html`<section class="sp-plan-wrap" aria-label="Интерактивный план">
    <div class="sp-map-toolbar"><strong>${floor} этаж</strong>
      <button type="button" class="btn sm alt" data-act="togglePlanDetail" aria-controls="school-diagram" aria-pressed="false">Увеличить схему</button>
    </div>
    <div id="school-diagram" class="sp-plan-scroll sp-map-viewport" role="region" tabindex="0" aria-label="Интерактивная карта помещений"><div class="sp-vector sp-map-fit">${raw(content)}</div></div>
    <p class="sp-hint">Схема для ориентации и заявок. Для эвакуации используйте официальный план школы.</p>
  </section>`;
}
