(function(){
"use strict";
const HERO = window.HERO_IMG || "";
const RAW = window.PHONICS_DATA || {};

/* ---------- 단어 상자 정리 ---------- */
const LEARNED = (RAW.learned || []).map(x => x.toLowerCase());
const T = RAW.today || {};
const BANK = RAW.bank || {};
const uniq = a => [...new Set(a)];
// 배운 글자로만 된 단어인지 확인 (안 배운 글자가 있으면 혼자 읽기 문제에서 빼요)
const decodable = w => /^[a-z]+$/.test(w) && w.split("").every(c => LEARNED.includes(c));
const TODAY_WORDS = uniq((T.words || []).map(w => w.toLowerCase())).filter(decodable);
const REVIEW_WORDS = uniq((BANK.words || []).map(w => w.toLowerCase())).filter(w => decodable(w) && !TODAY_WORDS.includes(w));
const RIMES = uniq([...(T.rimes || []), ...(BANK.rimes || [])].map(r => r.toLowerCase()));
const SIGHT_TODAY = T.sight || [], SIGHT_REVIEW = BANK.sight || [];
const NEW = (T.newSound || LEARNED[LEARNED.length - 1] || "s").toLowerCase();
const EX = {a:"apple",b:"bat",c:"cat",d:"dog",e:"egg",f:"fan",g:"goat",h:"hat",i:"igloo",j:"jam",k:"kite",l:"leg",m:"mat",n:"net",o:"octopus",p:"pig",q:"queen",r:"red",s:"sun",t:"top",u:"umbrella",v:"van",w:"web",x:"fox",y:"yo-yo",z:"zip"};
const exFor = l => EX[l] || "";
const rimeEx = r => [...TODAY_WORDS, ...REVIEW_WORDS].find(w => w.length > r.length && w.endsWith(r)) || "";
// 첫소리 + 끝소리 나누기 (끝소리가 단어 상자에 있을 때만)
function onsetOf(w){ for(const r of RIMES){ if(w.length === r.length + 1 && w.endsWith(r)) return [w[0], r]; } return null; }

/* ---------- 난이도 ---------- */
const LEVELS = {
  easy:   {name:"쉬움",   blend:2, letters:4, read:3, spell:2, sight:1, spellExtra:2},
  normal: {name:"보통",   blend:3, letters:5, read:4, spell:3, sight:2, spellExtra:99},
  hard:   {name:"어려움", blend:4, letters:99, read:6, spell:4, sight:3, spellExtra:99}
};
const STEPS = [
  {n:1,name:"귀로 소리 놀이",cat:"blend"},
  {n:2,name:"배운 글자 복습",cat:"sound"},
  {n:3,name:"새 소리 배우기",cat:"sound"},
  {n:4,name:"단어 읽기",cat:"read"},
  {n:5,name:"단어 만들기",cat:"spell"},
  {n:6,name:"사이트워드",cat:"sight"},
  {n:7,name:"짧은 글 읽기",cat:"reading"}
];
const GROUPS = [
  {name:"소리 학습",steps:[1,2,3],cls:"c1"},
  {name:"단어 학습",steps:[4,5],cls:"c2"},
  {name:"사이트워드",steps:[6],cls:"c3"},
  {name:"리딩",steps:[7],cls:"c4"}
];
const CATS = [["sound","소리 알기"],["blend","소리 합치기"],["read","단어 읽기"],["spell","철자"],["sight","사이트워드"],["reading","리딩"]];

/* ---------- 저장 (이 기기에만) ---------- */
const KEY = "phonics-reading-a-v1";
const today = () => { const d = new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); };
function blankRec(){ const r = {}; CATS.forEach(([k]) => r[k] = {ok:0, all:0}); return r; }
function load(){
  let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e) {}
  if(!s || typeof s !== "object") s = {};
  if(!s.records) s.records = blankRec();
  CATS.forEach(([k]) => { if(!s.records[k]) s.records[k] = {ok:0, all:0}; });
  if(!s.misses) s.misses = {};               // 자주 틀린 단어·글자
  if(!LEVELS[s.level]) s.level = "normal";
  if(s.day !== today()){ s.day = today(); s.done = 0; }
  if(typeof s.done !== "number") s.done = 0;
  return s;
}
let S = load();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }
function rec(cat, ok, item){
  S.records[cat].all++; if(ok) S.records[cat].ok++;
  if(item){ const k = String(item); if(!ok) S.misses[k] = (S.misses[k] || 0) + 1; else if(S.misses[k]) S.misses[k] = Math.max(0, S.misses[k] - 1); }
  save();
}
const LV = () => LEVELS[S.level];

/* 문제 고르기: 오늘 것 먼저, 자주 틀린 것, 그다음 예전 것 */
function shuffle(a){ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
function pickWords(n){
  const missed = REVIEW_WORDS.filter(w => S.misses[w] > 0).sort((a,b) => S.misses[b] - S.misses[a]);
  const rest = shuffle(REVIEW_WORDS.filter(w => !missed.includes(w)));
  return uniq([...shuffle(TODAY_WORDS), ...missed, ...rest]).slice(0, n);
}

/* ---------- 녹음한 소리 (이 기기의 IndexedDB) ---------- */
const IDB = {db:null,
  open(){ return new Promise((res,rej) => { try { if(!("indexedDB" in window)) return rej("none"); const r = indexedDB.open("phonics-audio",1); r.onupgradeneeded = () => r.result.createObjectStore("clips"); r.onsuccess = () => { IDB.db = r.result; res(); }; r.onerror = () => rej(r.error); } catch(e){ rej(e); } }); },
  st(mode){ return IDB.db.transaction("clips", mode).objectStore("clips"); },
  put(k,v){ return new Promise((res,rej) => { try { const q = IDB.st("readwrite").put(v,k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); } catch(e){ rej(e); } }); },
  del(k){ return new Promise(res => { try { const q = IDB.st("readwrite").delete(k); q.onsuccess = q.onerror = () => res(); } catch(e){ res(); } }); },
  all(){ return new Promise(res => { try { const s = IDB.st("readonly"); const ks = s.getAllKeys(), vs = s.getAll(); let n = 0; const fin = () => { if(++n === 2) res((ks.result||[]).map((k,i) => [k, vs.result[i]])); }; ks.onsuccess = fin; vs.onsuccess = fin; ks.onerror = vs.onerror = () => res([]); } catch(e){ res([]); } }); }
};
const CLIPS = new Map(); let dbReady = false;
async function loadClips(){ try { await IDB.open(); dbReady = true; (await IDB.all()).forEach(([k,v]) => { if(v && v.blob) CLIPS.set(k, URL.createObjectURL(v.blob)); }); } catch(e){ dbReady = false; } }
function neededKeys(){
  return LEARNED.map(x => ({key:"s:"+x, label:x, ex:exFor(x), kind:"낱소리"}))
    .concat(RIMES.map(x => ({key:"r:"+x, label:"-"+x, ex:rimeEx(x), kind:"끝소리"})));
}
/* 단어 소리 자리: ElevenLabs로 만든 파일이 audio/words/<단어>.mp3 에 들어오면 자동으로 써요 */
const WORD_AUDIO = window.WORD_AUDIO || {};   // {"cat":"audio/words/cat.mp3"}
function wordUrl(w){ return WORD_AUDIO[w.toLowerCase()] || null; }
function playUrl(u){ try { new Audio(u).play().catch(() => toast("소리를 재생하지 못했어요")); } catch(e){} }
function playKey(k, quiet){ const u = CLIPS.get(k); if(!u){ if(!quiet) toast("아직 녹음 안 된 소리예요. 부모 관리에서 녹음해요"); return; } playUrl(u); }

/* 녹음 다듬기: 앞뒤 빈 소리 자르기, 크기 맞추기, WAV로 저장 */
async function processBlob(blob){
  const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
  const ab = await blob.arrayBuffer();
  const buf = await new Promise((res,rej) => { const p = ac.decodeAudioData(ab, res, rej); if(p && p.catch) p.catch(rej); });
  try { ac.close(); } catch(e) {}
  const ch = buf.getChannelData(0), sr = buf.sampleRate;
  let peak = 0; for(let i = 0; i < ch.length; i++){ const v = Math.abs(ch[i]); if(v > peak) peak = v; }
  if(peak < 0.02) return {err:"소리가 너무 작아요. 기기에 조금 더 가까이 대고 녹음해요"};
  const th = Math.max(0.01, peak*0.08); let s = 0, e = ch.length - 1;
  while(s < ch.length && Math.abs(ch[s]) < th) s++; while(e > s && Math.abs(ch[e]) < th) e--;
  const pad = Math.floor(sr*0.06); s = Math.max(0, s - pad); e = Math.min(ch.length - 1, e + pad);
  const dur = (e - s)/sr;
  if(dur < 0.08) return {err:"너무 짧아요. 다시 녹음해요"};
  if(dur > 3) return {err:"너무 길어요. 소리 하나만 녹음해요 (3초 안으로)"};
  const g = 0.9/peak, out = new Float32Array(e - s); for(let i = 0; i < out.length; i++) out[i] = ch[s+i]*g;
  const f = Math.min(out.length >> 1, Math.floor(sr*0.01)); for(let i = 0; i < f; i++){ out[i] *= i/f; out[out.length-1-i] *= i/f; }
  return {blob:wav(out, sr), dur, warn: peak >= 0.99 ? "소리가 너무 커서 깨졌을 수 있어요. 들어보고 이상하면 조금 떨어져서 다시 녹음해요" : null};
}
function wav(f, sr){ const b = new ArrayBuffer(44 + f.length*2), v = new DataView(b); const w = (o,s) => { for(let i = 0; i < s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4, 36 + f.length*2, true); w(8,"WAVE"); w(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,"data"); v.setUint32(40, f.length*2, true);
  for(let i = 0; i < f.length; i++){ const x = Math.max(-1, Math.min(1, f[i])); v.setInt16(44 + i*2, x < 0 ? x*0x8000 : x*0x7fff, true); }
  return new Blob([b], {type:"audio/wav"}); }

/* ---------- 작은 도구 ---------- */
const app = document.getElementById("app");
function h(tag, attrs, ...kids){ const e = document.createElement(tag); if(attrs) for(const k in attrs){ if(k === "class") e.className = attrs[k]; else if(k === "html") e.innerHTML = attrs[k]; else if(k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } kids.flat().forEach(c => { if(c == null) return; e.append(c.nodeType ? c : document.createTextNode(c)); }); return e; }
const ICON = {
  book:'<svg viewBox="0 0 40 40"><path d="M4 9c5-2 10-2 16 2v22c-6-4-11-4-16-2z" fill="#ffd25e" stroke="#26384a" stroke-width="2.4" stroke-linejoin="round"/><path d="M36 9c-5-2-10-2-16 2v22c6-4 11-4 16-2z" fill="#fff" stroke="#26384a" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 15h8M24 20h8M24 25h6" stroke="#5aa9d6" stroke-width="2.2" stroke-linecap="round"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="#26384a" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="#fff"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="#26384a" stroke-width="2.2" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 10v9.5h12V10"/></svg>',
  spk:'<svg viewBox="0 0 24 24" fill="none" stroke="#1f6f96" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute:'<svg viewBox="0 0 24 24" fill="none" stroke="#607487" stroke-width="2" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke-linecap="round"/></svg>',
  ear:'<svg viewBox="0 0 64 64"><path d="M22 40c0 8 5 12 10 12s8-3 8-8c0-6 10-9 10-20 0-9-7-16-16-16S18 14 18 24" fill="#ffc9a8" stroke="#26384a" stroke-width="3" stroke-linecap="round"/><path d="M28 26c0-4 3-7 6-7s6 3 6 7c0 4-5 5-5 9" fill="none" stroke="#26384a" stroke-width="3" stroke-linecap="round"/><path d="M52 20c3 4 3 10 0 14M57 16c5 6 5 16 0 22" fill="none" stroke="#e0806e" stroke-width="3" stroke-linecap="round"/></svg>',
  open:'<svg viewBox="0 0 64 64"><path d="M6 16c9-4 18-4 26 3v32c-8-6-17-6-26-3z" fill="#fff" stroke="#6b4fb8" stroke-width="3" stroke-linejoin="round"/><path d="M58 16c-9-4-18-4-26 3v32c8-6 17-6 26-3z" fill="#fff" stroke="#6b4fb8" stroke-width="3" stroke-linejoin="round"/><path d="M12 25h14M12 32h14M12 39h10M38 25h14M38 32h14M38 39h10" stroke="#a996e6" stroke-width="2.6" stroke-linecap="round"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="#ffcf3f" stroke="#e0a91a" stroke-width="1.2" stroke-linejoin="round"/></svg>'
};
const svg = k => h("span", {html:ICON[k], style:"display:contents"});
function sayStub(t){ return h("div", {class:"say"}, svg("mute"), t || "소리 준비 전"); }
function soundBtn(key, text){ if(CLIPS.has(key)) return h("button", {class:"speak", onclick:() => playKey(key)}, svg("spk"), text || "소리 듣기"); return sayStub("소리 준비 전 · 부모 관리에서 녹음해요"); }
function wordBtn(w){ const u = wordUrl(w); if(u) return h("button", {class:"speak", onclick:() => playUrl(u)}, svg("spk"), "단어 듣기"); return sayStub("단어 소리는 나중에 자동으로 들어가요"); }
let toastT; function toast(msg){ document.querySelectorAll(".toast").forEach(t => t.remove()); const t = h("div", {class:"toast", role:"status"}, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }

/* ---------- 메인 화면 ---------- */
function groupState(g){ const last = Math.max(...g.steps), first = Math.min(...g.steps); if(S.done >= last) return "done"; if(S.done + 1 >= first) return "now"; return "locked"; }
function home(){
  app.replaceChildren();
  const top = h("div", {class:"bar"},
    h("div", {class:"brand"}, h("span", {html:ICON.book, style:"display:contents"}), "파닉스 리딩"),
    h("button", {class:"pill-btn", onclick:openGate, "aria-label":"부모 관리 열기"}, svg("gear"), "부모 관리"));
  const hero = h("div", {class:"hero"}, h("img", {class:"lion", src:HERO, alt:"주인공 친구"}));
  const dots = h("div", {class:"dots", "aria-label":"오늘 7단계 중 "+S.done+"단계 끝"},
    STEPS.map(s => h("div", {class:"dot"+(S.done >= s.n ? " done" : S.done + 1 === s.n ? " now" : "")}, String(s.n))));
  const sample = TODAY_WORDS[0] || "hat";
  const icons = [svg("ear"), h("div", {class:"tiles-mini"}, sample.slice(0,3).split("").map(c => h("span", null, c))),
    h("div", {class:"tiles-mini"}, h("span", {style:"width:auto;padding:0 10px"}, (SIGHT_TODAY[0] || SIGHT_REVIEW[0] || {w:"the"}).w)), svg("open")];
  const cards = h("div", {class:"cards"}, GROUPS.map((g,i) => {
    const st = groupState(g);
    const label = g.steps.length > 1 ? g.steps[0]+"~"+g.steps[g.steps.length-1]+"단계" : g.steps[0]+"단계";
    return h("button", {class:"card "+g.cls+(st === "locked" ? " locked" : ""), onclick:() => {
        if(st === "done") runLesson(g.steps[0], {only:g.steps, review:true});
        else if(st === "now") runLesson(S.done + 1, {});
        else toast("'학습 시작'을 누르고 차례대로 해요");
      }, "aria-label":g.name+" "+label},
      st === "done" ? h("span", {class:"badge ok"}, "다 했어요") : st === "now" ? h("span", {class:"badge"}, "지금 할 차례") : null,
      h("div", {class:"ico"}, icons[i]), h("div", {class:"nm"}, g.name), h("div", {class:"st"}, st === "done" ? label+" · 눌러서 다시 하기" : label));
  }));
  const allDone = S.done >= 7;
  const startLabel = allDone ? "오늘 학습 끝! 다시 복습" : S.done > 0 ? "이어서 하기 ("+(S.done+1)+"단계)" : "학습 시작";
  const start = h("button", {class:"start", onclick:() => allDone ? runLesson(1, {review:true}) : runLesson(S.done + 1, {})}, svg("play"), startLabel);
  const info = h("p", {class:"sample"}, (RAW.sample ? "예시 내용 · " : (RAW.book ? RAW.book+" · " : ""))+(T.page ? T.page+" · " : "")+"배운 소리 ", h("b", null, LEARNED.join(" ")), " · 오늘 새 소리 ", h("b", null, NEW), " · 난이도 "+LV().name);
  app.append(top, hero, h("section", {class:"today"}, h("h1", null, "오늘의 학습"), h("span", {class:"sub"}, "7단계 · 약 15~20분"), dots, cards, start, info));
}

/* ---------- 수업 진행 ---------- */
let L = null;
function runLesson(step, opt){ L = {step, only:opt.only || null, review:!!opt.review, single:!!opt.single}; renderStep(); }
function finishStep(){
  const n = L.step;
  if(!L.review && n > S.done){ S.done = n; save(); }
  const more = L.single ? false : L.only ? L.only.includes(n + 1) : n < 7;
  cheer(n, more);
}
function lessonShell(){
  const s = STEPS[L.step - 1];
  app.replaceChildren();
  const dots = h("div", {class:"dots"}, STEPS.map(x => h("div", {class:"dot"+(x.n < L.step ? " done" : x.n === L.step ? " now" : "")}, String(x.n))));
  app.append(h("div", {class:"lesson-top"}, h("button", {class:"pill-btn", onclick:home}, svg("home"), "처음으로"), h("div", {class:"step-name"}, s.n+"단계 · "+s.name+(L.review ? " (복습)" : "")), dots));
  const stage = h("section", {class:"stage"}); app.append(stage); return stage;
}
function renderStep(){ const st = lessonShell(); ({1:step1,2:step2,3:step3,4:step4,5:step5,6:step6,7:step7})[L.step](st); }
function cheer(n, more){
  const st = lessonShell();
  st.append(h("div", {class:"cheer pop"}, h("img", {class:"lion", src:HERO, alt:""}), h("div", {class:"stars"}, svg("star"), svg("star"), svg("star")),
    h("h2", null, more ? n+"단계 끝! 잘했어요" : (L.review ? "복습 끝! 잘했어요" : "오늘 학습 끝! 최고예요")),
    more ? h("button", {class:"btn next", onclick:() => { L.step = n + 1; renderStep(); }}, (n+1)+"단계 하기") : h("button", {class:"btn next", onclick:home}, "처음으로")));
}
function emptyStep(stage, msg){ stage.replaceChildren(h("div", {class:"hint"}, msg), h("button", {class:"btn next", onclick:finishStep}, "다음으로")); }
/* 엄마가 듣고 누르는 확인: 틀리면 한 번 고쳐서 다시 */
function parentCheck(stage, items, draw, cat, done, correctTip, keyOf){
  if(!items.length) return emptyStep(stage, "오늘은 이 단계 문제가 없어요.");
  let i = 0, retry = false;
  function show(){
    stage.replaceChildren(h("div", {class:"counter"}, (i+1)+" / "+items.length));
    draw(stage, items[i]);
    if(retry) stage.append(h("div", {class:"hint"}, correctTip));
    stage.append(h("div", {class:"row"},
      h("button", {class:"btn ok", onclick:() => { rec(cat, true, keyOf && keyOf(items[i])); next(); }}, "맞았어요"),
      h("button", {class:"btn again", onclick:() => { rec(cat, false, keyOf && keyOf(items[i])); if(!retry){ retry = true; show(); } else next(); }}, "다시 해볼게요")));
  }
  function next(){ retry = false; i++; if(i < items.length) show(); else done(); }
  show();
}
const note = txt => h("div", {class:"parent-note"}, h("span", {class:"who"}, "엄마"), txt);

function step1(stage){
  parentCheck(stage, pickWords(LV().blend), (st, w) => {
    st.append(note("화면은 엄마만 봐요. 소리를 하나씩 끊어 말해 주면 아이가 합쳐서 단어로 말해요."));
    st.append(h("div", {class:"big split"}, w.split("").join("·")));
    st.append(h("div", {class:"counter"}, "정답: "+w));
  }, "blend", finishStep, "엄마가 먼저 합쳐서 들려주고, 같이 말한 뒤 아이 혼자 다시 해요.", w => w);
}
function step2(stage){
  const review = LEARNED.filter(l => l !== NEW);
  const missed = review.filter(l => S.misses["s:"+l] > 0);
  const items = uniq([...shuffle(missed), ...shuffle(review)]).slice(0, LV().letters);
  parentCheck(stage, items, (st, l) => {
    st.append(note("아이가 글자를 보고 소리를 말해요. 글자 이름(에이, 에스)이 아니라 소리예요. 동작도 같이 해요."));
    st.append(h("div", {class:"big pop"}, l));
    st.append(soundBtn("s:"+l));
  }, "sound", finishStep, "엄마가 소리를 먼저 들려주고, 같이 말한 뒤 아이 혼자 다시 해요.", l => "s:"+l);
}
function step3(stage){
  const n = NEW;
  const pool = [...TODAY_WORDS, ...REVIEW_WORDS];
  const yes = pool.find(w => w[0] === n) || exFor(n);
  const no = pool.find(w => w[0] !== n && w !== yes) || "sun";
  const pair = shuffle([yes, no]);
  const acts = [
    ["이야기", "책에 나온 "+n+" 소리 이야기를 들려줘요."],
    ["동작", "책에 나온 동작을 같이 해요. 매번 같은 동작이에요."],
    ["공중에 쓰기", "엄마가 쓰는 걸 보고, 소리를 말하며 공중에 따라 써요."],
    ["첫소리 찾기", null],
    ["따라 쓰기", "책의 쓰기 칸에 "+n+"을 따라 써요."]
  ];
  const doneSet = new Set();
  stage.replaceChildren(h("div", {class:"big pop"}, n), soundBtn("s:"+n));
  const list = h("ul", {class:"checklist"});
  const finish = h("button", {class:"btn next", disabled:"", style:"opacity:.45"}, "다 했어요");
  const upd = () => { const all = doneSet.size === acts.length; finish.disabled = !all; finish.style.opacity = all ? "1" : ".45"; };
  const mark = (b, i, on) => { if(on){ doneSet.add(i); b.classList.add("done"); b.querySelector(".box").innerHTML = ICON.check; } else { doneSet.delete(i); b.classList.remove("done"); b.querySelector(".box").innerHTML = ""; } upd(); };
  acts.forEach(([t, d], i) => {
    const b = h(d === null ? "div" : "button", d === null ? {class:"item"} : {class:"item", type:"button"}, h("span", {class:"box"}),
      h("span", null, h("b", null, t), d ? " · "+d : " · 엄마가 두 단어를 말해 주면, "+n+"으로 시작하는 단어를 골라요."));
    if(d === null){
      const mc = h("div", {class:"mini-choice"});
      pair.forEach(w => mc.append(h("button", {type:"button", onclick:e => { const right = w === yes; e.currentTarget.className = right ? "right" : "wrong"; rec("sound", right, "s:"+n); if(right) mark(b, i, true); else toast("다시 들어봐요. 엄마가 첫소리를 길게 말해 줘요"); }}, w)));
      b.lastChild.append(mc);
    } else b.addEventListener("click", () => mark(b, i, !doneSet.has(i)));
    list.append(h("li", null, b));
  });
  finish.addEventListener("click", () => { if(!finish.disabled) finishStep(); });
  stage.append(note("하나씩 하고 눌러서 표시해요."), list, finish);
}
function step4(stage){
  parentCheck(stage, pickWords(LV().read), (st, w) => {
    st.append(note("아이가 글자를 하나씩 누르며 소리를 내요. 다 누르면 이어서 읽어요. 그림 없이 읽어요."));
    const tiles = h("div", {class:"word-tiles"}); let k = 0;
    const bar = h("div", {class:"blendbar", style:"visibility:hidden"}, w);
    w.split("").forEach((c, idx) => tiles.append(h("button", {class:"tile", onclick:e => { playKey("s:"+c, true); if(idx !== k) return; e.currentTarget.classList.add("lit"); k++; if(k === w.length) bar.style.visibility = "visible"; }}, c)));
    st.append(tiles, bar);
    const o = onsetOf(w);
    if(o){ const chip = (t, key, c) => h("button", {class:"chip "+c, onclick:() => playKey(key)}, t, CLIPS.has(key) ? svg("spk") : null);
      st.append(h("div", {class:"onset"}, chip(o[0], "s:"+o[0], ""), "+", chip(o[1], "r:"+o[1], "r"), "=", h("span", null, w))); }
    if(wordUrl(w)) st.append(wordBtn(w));
  }, "read", finishStep, "엄마가 소리를 하나씩 짚어 주고, 같이 합쳐 읽은 뒤 아이 혼자 다시 해요.", w => w);
}
function step5(stage){
  const words = pickWords(LV().spell); let i = 0;
  if(!words.length) return emptyStep(stage, "오늘은 만들 단어가 없어요.");
  function poolFor(w){
    const extra = shuffle(LEARNED.filter(c => !w.includes(c))).slice(0, LV().spellExtra);
    return shuffle(uniq([...w.split(""), ...extra]));
  }
  function show(){
    const w = words[i]; let fails = 0; const picked = [];
    stage.replaceChildren(h("div", {class:"counter"}, (i+1)+" / "+words.length),
      note("엄마가 단어를 말해 주면 아이가 소리를 나눠서 글자 카드를 골라요. 단어는 아래 버튼을 눌러 엄마만 봐요."));
    const rv = h("button", {class:"reveal", onclick:() => rv.replaceChildren("엄마가 읽어 줄 단어: ", h("b", null, w))}, "엄마만 보기 (눌러서 보기)");
    const slots = h("div", {class:"slots"}), pick = h("div", {class:"pick"});
    const paint = () => slots.replaceChildren(...w.split("").map((_, k) => h("button", {class:"slot"+(picked[k] ? " filled" : ""), onclick:() => { if(picked[k]){ picked.splice(k, 1); paint(); } }}, picked[k] || "")));
    poolFor(w).forEach(c => pick.append(h("button", {onclick:() => { playKey("s:"+c, true); if(picked.length >= w.length) return; picked.push(c); paint(); if(picked.length === w.length) check(); }}, c)));
    const nextWord = () => { i++; i < words.length ? show() : finishStep(); };
    function check(){
      const ok = picked.join("") === w; rec("spell", ok, w);
      if(ok){ slots.classList.add("good"); setTimeout(nextWord, 900); return; }
      fails++; slots.classList.remove("shake"); void slots.offsetWidth; slots.classList.add("shake");
      if(fails < 2){ toast("엄마가 소리를 하나씩 다시 말해 줘요"); setTimeout(() => { picked.length = 0; paint(); }, 700); }
      else setTimeout(() => { picked.length = 0; picked.push(...w.split("")); paint(); slots.classList.add("good"); toast("정답은 "+w+"예요. 같이 읽어 봐요"); setTimeout(nextWord, 1800); }, 700);
    }
    paint(); stage.append(rv, slots, pick);
  }
  show();
}
function step6(stage){
  const items = uniq([...SIGHT_TODAY, ...shuffle(SIGHT_REVIEW)].map(o => JSON.stringify(o))).map(s => JSON.parse(s)).slice(0, LV().sight);
  parentCheck(stage, items, (st, o) => {
    st.append(note("규칙대로 읽을 수 있는 부분은 먼저 소리로 읽고, 안 맞는 부분만 기억해요."));
    st.append(h("div", {class:"big pop", style:"color:#8a5bd1"}, o.w));
    if(o.tip) st.append(h("div", {class:"hint"}, o.tip));
    st.append(wordBtn(o.w));
  }, "sight", finishStep, "엄마가 먼저 읽어 주고, 같이 읽은 뒤 아이 혼자 다시 해요.", o => "w:"+o.w);
}
function step7(stage){
  const words = T.sentence || [], sightSet = T.sentenceSight || [], Q = T.question;
  if(!words.length) return emptyStep(stage, "오늘은 읽을 글이 없어요. 리딩서를 같이 읽어요.");
  let retry = false;
  function read(){
    stage.replaceChildren(note("아이가 단어를 하나씩 누르며 읽어요. 보라색 단어는 사이트워드예요. 막히면 그림 말고 글자를 짚어 소리를 합쳐요."));
    const s = h("div", {class:"sentence"});
    words.forEach(w => { const clean = w.replace(/[.,!?]/g, "").toLowerCase(); const sight = sightSet.map(x => x.toLowerCase()).includes(clean);
      s.append(h("button", {class:sight ? "sw" : "", onclick:e => { e.currentTarget.classList.toggle("lit"); if(wordUrl(clean)) playUrl(wordUrl(clean)); }}, w)); });
    stage.append(s);
    if(retry) stage.append(h("div", {class:"hint"}, "엄마가 한 단어씩 먼저 읽어 주고, 같이 읽은 뒤 아이 혼자 다시 해요."));
    stage.append(h("div", {class:"row"},
      h("button", {class:"btn ok", onclick:() => { rec("reading", true); Q ? ask() : finishStep(); }}, "다 읽었어요"),
      h("button", {class:"btn again", onclick:() => { rec("reading", false); if(!retry){ retry = true; read(); } else Q ? ask() : finishStep(); }}, "다시 해볼게요")));
  }
  function ask(){
    stage.replaceChildren(h("div", {class:"sentence", style:"font-size:clamp(30px,5vw,44px)"}, words.join(" ")), h("div", {class:"q"}, Q.q));
    let tried = false;
    stage.append(h("div", {class:"choices"}, shuffle(Q.choices).map(x => h("button", {onclick:e => { const ok = x === Q.answer; if(!tried) rec("reading", ok); tried = true; e.currentTarget.className = ok ? "right" : "wrong"; if(ok) setTimeout(finishStep, 900); else toast("글을 다시 읽어 보고 골라요"); }}, x))));
  }
  read();
}

/* ---------- 부모 관리 ---------- */
function openGate(){
  const a = 3 + Math.floor(Math.random()*4), b = 2 + Math.floor(Math.random()*4), ans = a + b;
  const opts = shuffle(uniq([ans, ans - 1, ans + 1, ans + 2]));
  const g = h("div", {class:"gate", role:"dialog", "aria-modal":"true"},
    h("div", {class:"box2"}, h("h3", null, "어른 확인"), h("div", null, a+" + "+b+" = ?"),
      h("div", {class:"nums"}, opts.map(n => h("button", {onclick:() => { g.remove(); if(n === ans) parent(); else toast("다시 해 볼까요?"); }}, String(n)))),
      h("button", {class:"pill-btn", onclick:() => g.remove()}, "닫기")));
  document.body.append(g);
}
function parent(){
  app.replaceChildren();
  app.append(h("div", {class:"bar"}, h("div", {class:"brand"}, svg("gear"), "부모 관리"), h("button", {class:"pill-btn", onclick:home}, svg("home"), "아이 화면으로")));
  // 오늘 내용
  const lv = h("div", {class:"seg"}, Object.entries(LEVELS).map(([k, v]) => h("button", {class:S.level === k ? "on" : "", onclick:() => { S.level = k; save(); parent(); toast("난이도: "+v.name); }}, v.name)));
  app.append(h("section", {class:"panel"}, h("h2", null, "오늘 내용"),
    h("p", null, (RAW.sample ? "지금은 예시 내용이에요. 책 사진을 Claude에게 보내면 그날 단어로 바뀌어요." : (RAW.book || "")+" "+(T.page || ""))),
    h("div", {class:"tbl-wrap"}, h("table", null, h("tbody", null,
      h("tr", null, h("th", null, "배운 소리"), h("td", {class:"lt"}, LEARNED.join(" "))),
      h("tr", null, h("th", null, "오늘 새 소리"), h("td", {class:"lt"}, NEW)),
      h("tr", null, h("th", null, "오늘 단어"), h("td", {class:"lt"}, TODAY_WORDS.join(", ") || "–")),
      h("tr", null, h("th", null, "복습 단어"), h("td", {class:"lt"}, REVIEW_WORDS.join(", ") || "–")),
      h("tr", null, h("th", null, "끝소리"), h("td", {class:"lt"}, RIMES.map(r => "-"+r).join(", ") || "–")),
      h("tr", null, h("th", null, "사이트워드"), h("td", {class:"lt"}, [...SIGHT_TODAY, ...SIGHT_REVIEW].map(o => o.w).join(", ") || "–"))))),
    h("h2", null, "난이도"), h("p", null, "쉬움은 문제 수가 적고 글자 카드가 적어요. 어려움은 문제가 많고 복습 단어가 더 섞여요."), lv,
    h("div", {class:"confirm"}, h("button", {class:"sbtn go", onclick:worksheet}, "오늘 학습지 보기·인쇄"))));
  // 기록
  const rows = CATS.map(([k, name]) => { const r = S.records[k]; const pct = r.all ? Math.round(r.ok/r.all*100) : 0;
    return h("tr", null, h("td", null, name), h("td", null, r.ok+" / "+r.all), h("td", null, r.all ? pct+"%" : "–"), h("td", null, h("div", {class:"meter"}, h("i", {style:"width:"+pct+"%"})))); });
  const misses = Object.entries(S.misses).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => k.replace(/^s:/, "").replace(/^w:/, "")+" ("+n+")");
  app.append(h("section", {class:"panel"}, h("h2", null, "학습 기록"),
    h("p", null, "오늘 진도: 7단계 중 "+S.done+"단계 끝. 기록은 이 기기에만 저장돼요."),
    h("div", {class:"tbl-wrap"}, h("table", null, h("thead", null, h("tr", null, h("th", null, "기술"), h("th", null, "맞음 / 전체"), h("th", null, "맞은 비율"), h("th", null, ""))), h("tbody", null, rows))),
    h("p", null, "자주 틀린 것: "+(misses.join(", ") || "아직 없어요")+" · 이 단어와 소리는 복습에 먼저 나와요.")));
  app.append(h("section", {class:"panel"}, h("h2", null, "단계 바로 가기"), h("p", null, "원하는 단계 하나만 다시 해요. 오늘 진도는 바뀌지 않아요."),
    h("div", {class:"jump"}, STEPS.map(s => h("button", {onclick:() => runLesson(s.n, {review:true, single:true})}, h("b", null, s.n+"단계"), s.name)))));
  // 녹음
  const items = neededKeys(); const missing = items.filter(x => !CLIPS.has(x.key)).length;
  app.append(h("section", {class:"panel"}, h("h2", null, "음원 녹음"),
    h("p", null, "지금 진도에 필요한 소리예요. 소리 하나만 짧게 내고 멈춤을 눌러요. 앞뒤 빈 소리와 크기는 자동으로 맞춰요. 아직 녹음 안 한 소리: "+missing+"개"),
    h("div", {class:"rec-list"}, items.map(recRow))));
  // 백업
  const fileIn = h("input", {type:"file", accept:"application/json,.json", id:"restore-file", hidden:""});
  fileIn.addEventListener("change", () => { if(fileIn.files && fileIn.files[0]) restore(fileIn.files[0]); });
  app.append(h("section", {class:"panel"}, h("h2", null, "백업·복원"),
    h("p", null, "학습 기록과 녹음한 소리를 파일 하나로 저장해요. 다른 기기에서 불러오면 그대로 옮겨져요. 일주일에 한 번 해두면 안전해요."),
    h("div", {class:"confirm"}, h("button", {class:"sbtn go", onclick:makeBackup}, "백업 파일 만들기"), h("button", {class:"sbtn", onclick:() => fileIn.click()}, "백업 불러오기"), fileIn)));
  // 초기화
  const conf = h("div", {class:"confirm"});
  const base = () => [h("button", {class:"danger", onclick:() => ask("오늘 진도 처음으로", () => { S.done = 0; })}, "오늘 진도 처음으로"), h("button", {class:"danger", onclick:() => ask("학습 기록 모두 지우기", () => { S.records = blankRec(); S.misses = {}; })}, "학습 기록 모두 지우기")];
  function ask(label, fn){ conf.replaceChildren(h("span", null, label+" 정말 할까요?"), h("button", {class:"danger", onclick:() => { fn(); save(); parent(); toast("완료했어요"); }}, "네"), h("button", {class:"pill-btn", onclick:() => conf.replaceChildren(...base())}, "아니요")); }
  conf.replaceChildren(...base());
  app.append(h("section", {class:"panel"}, h("h2", null, "초기화"), conf));
}

/* ---------- 학습지 (인쇄용) ---------- */
function worksheet(){
  app.replaceChildren();
  const pool = [...TODAY_WORDS, ...REVIEW_WORDS];
  const startsNew = pool.filter(w => w[0] === NEW);
  const others = pool.filter(w => w[0] !== NEW);
  const circleRows = [];
  for(let r = 0; r < 3; r++){ const y = startsNew[r % Math.max(1, startsNew.length)] || exFor(NEW); const o = shuffle(others).slice(0, 2); circleRows.push(shuffle([y, ...o])); }
  const readList = pickWords(6);
  const spellList = pickWords(4);
  app.append(h("div", {class:"bar no-print"}, h("button", {class:"pill-btn", onclick:parent}, svg("home"), "부모 관리로"),
    h("button", {class:"sbtn go", onclick:() => { try { window.print(); } catch(e) { toast("인쇄를 열지 못했어요"); } }}, "인쇄하기")));
  app.append(h("section", {class:"sheet"},
    h("div", {class:"sheet-head"}, h("h2", null, "파닉스 학습지"), h("div", null, "날짜 ________  이름 ____________")),
    h("h3", null, "1. 따라 쓰기 · 오늘 새 소리 "+NEW), h("div", {class:"trace"}, Array.from({length:8}, () => h("span", null, NEW))),
    h("h3", null, "2. 소리 내서 읽고 ✓ 하기 (그림 없이)"), h("div", {class:"readgrid"}, readList.map(w => h("div", null, h("i", null), w))),
    h("h3", null, "3. "+NEW+" 소리로 시작하는 단어에 동그라미"), h("div", {class:"circ"}, circleRows.map(r => h("div", null, r.map(w => h("span", null, w))))),
    h("h3", null, "4. 엄마가 불러 주는 단어 쓰기"), h("div", {class:"lines"}, spellList.map((w, i) => h("div", null, h("b", null, (i+1)+"."), h("span", {class:"ans"}, "엄마용: "+w)))),
    h("p", {class:"sheet-foot"}, "배운 소리 "+LEARNED.join(" ")+" · "+(RAW.sample ? "예시 내용" : (RAW.book || "")+" "+(T.page || "")))));
}

/* ---------- 녹음 한 줄 ---------- */
function recRow(it){
  const row = h("div", {class:"rec-row"}); let mr = null, stream = null, chunks = [], draft = null, draftUrl = null, timer = null;
  const stt = h("span", {class:"stt"+(CLIPS.has(it.key) ? " ok" : "")}, CLIPS.has(it.key) ? "등록됨" : "녹음 필요");
  const msg = h("div", {class:"rec-msg"}, it.kind+(it.ex ? " · "+it.ex+"의 "+(it.kind === "낱소리" ? "첫소리" : "끝부분")+"만 녹음해요" : ""));
  const acts = h("div", {class:"acts"});
  const setMsg = (t, bad) => { msg.textContent = t; msg.className = "rec-msg"+(bad ? " bad" : ""); };
  function paint(state){ acts.replaceChildren();
    if(state === "rec"){ acts.append(h("button", {class:"sbtn rec", onclick:stop}, "멈춤")); return; }
    acts.append(h("button", {class:"sbtn rec", onclick:start}, CLIPS.has(it.key) || draft ? "다시 녹음" : "녹음"));
    if(draft) acts.append(h("button", {class:"sbtn", onclick:() => playUrl(draftUrl)}, "들어보기"), h("button", {class:"sbtn go", onclick:register}, "등록"));
    else if(CLIPS.has(it.key)) acts.append(h("button", {class:"sbtn", onclick:() => playKey(it.key)}, "등록된 소리 듣기"), h("button", {class:"sbtn", onclick:remove}, "지우기"));
  }
  async function start(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){ setMsg("이 화면에서는 녹음이 안 돼요. github.io 주소로 열어 주세요", true); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:true, autoGainControl:false}}); }
    catch(e){ setMsg("마이크를 쓸 수 없어요. 브라우저에서 마이크를 허락해 주세요", true); return; }
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    const type = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    try { mr = new MediaRecorder(stream, type ? {mimeType:type} : undefined); } catch(e){ mr = new MediaRecorder(stream); }
    chunks = []; mr.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => { clearTimeout(timer); stream.getTracks().forEach(t => t.stop());
      const raw = new Blob(chunks, {type:mr.mimeType || type || "audio/webm"}); setMsg("확인하는 중…");
      try { const r = await processBlob(raw);
        if(r.err){ setMsg(r.err, true); paint(); return; }
        if(draftUrl) URL.revokeObjectURL(draftUrl); draft = r; draftUrl = URL.createObjectURL(r.blob);
        setMsg((r.warn ? r.warn+" · " : "")+"길이 "+r.dur.toFixed(2)+"초 · 들어보고 괜찮으면 등록해요", !!r.warn); paint();
      } catch(e){ setMsg("소리를 읽지 못했어요. 다시 녹음해요", true); paint(); } };
    mr.start(); setMsg("녹음 중… 소리를 한 번만 내고 멈춤을 눌러요"); paint("rec");
    timer = setTimeout(() => { if(mr && mr.state === "recording") mr.stop(); }, 6000);
  }
  function stop(){ if(mr && mr.state === "recording") mr.stop(); }
  async function register(){ if(!draft) return;
    if(!dbReady){ setMsg("이 기기에 저장할 수 없어요. 개인정보 보호(비공개) 창이 아닌지 확인해요", true); return; }
    try { await IDB.put(it.key, {blob:draft.blob, dur:draft.dur, at:Date.now()}); const old = CLIPS.get(it.key); if(old) URL.revokeObjectURL(old);
      CLIPS.set(it.key, URL.createObjectURL(draft.blob)); draft = null; stt.className = "stt ok"; stt.textContent = "등록됨"; setMsg("등록했어요. 게임에서 이 소리가 나와요"); paint(); }
    catch(e){ setMsg("저장하지 못했어요. 다시 해 봐요", true); } }
  async function remove(){ await IDB.del(it.key); const u = CLIPS.get(it.key); if(u) URL.revokeObjectURL(u); CLIPS.delete(it.key); stt.className = "stt"; stt.textContent = "녹음 필요"; setMsg("지웠어요. 다시 녹음할 수 있어요"); paint(); }
  row.append(h("div", {class:"lbl"}, it.label), h("div", {class:"ex"}, it.ex), stt, acts, msg); paint(); return row;
}

/* ---------- 백업·복원 ---------- */
function b64(blob){ return new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => res(""); r.readAsDataURL(blob); }); }
async function makeBackup(){
  const clips = {}; if(dbReady) for(const [k, v] of await IDB.all()){ if(v && v.blob) clips[k] = {dur:v.dur, at:v.at, type:v.blob.type, data:await b64(v.blob)}; }
  const blob = new Blob([JSON.stringify({app:"phonics-reading", version:1, savedAt:new Date().toISOString(), records:S.records, misses:S.misses, level:S.level, clips})], {type:"application/json"});
  const a = h("a", {href:URL.createObjectURL(blob), download:"phonics-backup-"+today()+".json"}); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast("백업 파일을 만들었어요 · 다운로드 폴더를 확인해요");
}
async function restore(file){
  try { const d = JSON.parse(await file.text()); if(!d || d.app !== "phonics-reading") throw 0;
    if(d.records){ S.records = d.records; CATS.forEach(([k]) => { if(!S.records[k]) S.records[k] = {ok:0, all:0}; }); }
    if(d.misses) S.misses = d.misses; if(LEVELS[d.level]) S.level = d.level; save();
    let n = 0; if(d.clips && dbReady){ for(const k in d.clips){ const c = d.clips[k]; const bin = atob(c.data); const u8 = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], {type:c.type || "audio/wav"}); await IDB.put(k, {blob, dur:c.dur, at:c.at}); const o = CLIPS.get(k); if(o) URL.revokeObjectURL(o); CLIPS.set(k, URL.createObjectURL(blob)); n++; } }
    toast("불러왔어요 · 소리 "+n+"개"); parent();
  } catch(e){ toast("이 파일은 불러올 수 없어요. 백업 파일이 맞는지 확인해요"); }
}

try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch(e) {}
home();
loadClips();
})();
