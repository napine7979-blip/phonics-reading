/* 파닉스 리딩 — 게임 틀
   이 파일은 공통 기능만 가져요: 화면, 카테고리, 퀴즈 엔진(정답·힌트·오답·쉬운 문제),
   소리 재생, 기록, 복습, 백업. 문제 유형은 "모듈"로 따로 끼워 넣어요 (PhonicsModules.register).
   어떤 모듈을 쓸지는 words.js의 modules 에서 정해요. */
(function(){
"use strict";
const HERO = window.HERO_IMG || "";
const RAW = window.PHONICS_DATA || {};
const FILES = Object.assign({sounds:{}, rimes:{}, words:{}, guide:{}}, window.AUDIO_FILES || {});
const TEST = /[?&]test=1\b/.test(location.search);   // 시험 모드 (개발용)

/* =========================================================
   1. 학습 콘텐츠 정리
   ========================================================= */
const uniq = a => [...new Set(a)];
const lc = s => String(s).toLowerCase();
const TAUGHT = uniq((RAW.taught || RAW.learned || []).map(lc));
const T = RAW.today || {}, BANK = RAW.bank || {};
// 두 글자 이상이 한 소리인 것 (긴 것부터 먼저 찾음)
const MULTI = ["tch","igh","sh","ch","th","ng","ck","qu","ai","ay","ee","ea","oa","ow","ie","oo","ou","oi","oy","ue","ew","or","ar","er","ir","ur","wh","ph","nk"];
function graphemes(w){
  const out = []; let i = 0; w = lc(w);
  while(i < w.length){
    const m = MULTI.find(g => w.startsWith(g, i));
    if(m){ out.push(m); i += m.length; } else { out.push(w[i]); i++; }
  }
  return out;
}
// 배운 소리로만 읽을 수 있는 단어인지 (글자가 아니라 '소리 단위'로 검사)
function decodable(w){
  w = lc(w); if(!/^[a-z]+$/.test(w)) return false;
  const gs = graphemes(w);
  return gs.every(g => TAUGHT.includes(g));
}
const ALL_TODAY = uniq((T.words || []).map(lc)), ALL_BANK = uniq((BANK.words || []).map(lc));
const TODAY_WORDS = ALL_TODAY.filter(decodable);
const REVIEW_WORDS = ALL_BANK.filter(w => decodable(w) && !TODAY_WORDS.includes(w));
const EXCLUDED = uniq([...ALL_TODAY, ...ALL_BANK].filter(w => !decodable(w)));
const RIMES = uniq([...(T.rimes || []), ...(BANK.rimes || [])].map(lc));
const SIGHT = uniq([...(T.sight || []), ...(BANK.sight || [])].map(o => JSON.stringify(o))).map(s => JSON.parse(s));
const SENTENCES = (T.sentences || []).map(s => ({text:s.text, words:String(s.text).split(/\s+/), sight:(s.sight || []).map(lc), question:s.question || null}));
const NEW_SOUNDS = (T.newSounds || []).map(lc);

const CATEGORIES = [
  {id:"sound",   name:"소리 학습",   cls:"c1"},
  {id:"word",    name:"단어 학습",   cls:"c2"},
  {id:"sight",   name:"사이트워드", cls:"c3"},
  {id:"reading", name:"리딩",       cls:"c4"}
];
const SKILLS = [["sound","글자 소리"],["blend","소리 합치기"],["read","단어 읽기"],["spell","단어 철자"],["sight","사이트워드"],["reading","리딩 이해 문제"]];

/* =========================================================
   2. 저장 (이 기기에만)
   ========================================================= */
const KEY = TEST ? "phonics-reading-test" : "phonics-reading-v2";
const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const blankSkill = () => ({first:0, hint:0, fail:0});
function blankRecords(){ const r = {}; SKILLS.forEach(([k]) => r[k] = blankSkill()); return r; }
function normalize(s){
  if(!s || typeof s !== "object") s = {};
  if(!s.records || typeof s.records !== "object") s.records = blankRecords();
  SKILLS.forEach(([k]) => { const r = s.records[k]; if(!r || typeof r.first !== "number") s.records[k] = blankSkill(); });
  if(!s.misses || typeof s.misses !== "object") s.misses = {};
  if(!s.progress || typeof s.progress !== "object") s.progress = {day:"", done:{}};
  if(s.progress.day !== today()) s.progress = {day:today(), done:{}};
  return s;
}
function load(){ let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e) {} return normalize(s); }
let S = load();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }
// 결과: first(처음에 맞힘) / hint(힌트 받고 맞힘) / fail(끝내 틀림). skip은 기록하지 않아요.
function record(skill, result, item){
  if(!S.records[skill] || !["first","hint","fail"].includes(result)) return;
  S.records[skill][result]++;
  if(item){ const k = String(item);
    if(result === "fail") S.misses[k] = (S.misses[k] || 0) + 2;
    else if(result === "hint") S.misses[k] = (S.misses[k] || 0) + 1;
    else if(S.misses[k]) S.misses[k] = Math.max(0, S.misses[k] - 1); }
  save();
}

/* =========================================================
   3. 소리
   ========================================================= */
// 녹음한 소리 (IndexedDB) — 화면은 지금 숨김. 소리 방법이 정해지면 다시 쓸 수 있게 남겨 둠.
const IDB = {db:null,
  open(){ return new Promise((res,rej) => { try { if(!("indexedDB" in window)) return rej("none"); const r = indexedDB.open("phonics-audio",1); r.onupgradeneeded = () => r.result.createObjectStore("clips"); r.onsuccess = () => { IDB.db = r.result; res(); }; r.onerror = () => rej(r.error); } catch(e){ rej(e); } }); },
  st(m){ return IDB.db.transaction("clips", m).objectStore("clips"); },
  put(k,v){ return new Promise((res,rej) => { try { const q = IDB.st("readwrite").put(v,k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); } catch(e){ rej(e); } }); },
  all(){ return new Promise(res => { try { const s = IDB.st("readonly"); const ks = s.getAllKeys(), vs = s.getAll(); let n = 0; const fin = () => { if(++n === 2) res((ks.result||[]).map((k,i) => [k, vs.result[i]])); }; ks.onsuccess = fin; vs.onsuccess = fin; ks.onerror = vs.onerror = () => res([]); } catch(e){ res([]); } }); }
};
const CLIPS = new Map(); let dbReady = false;
async function loadClips(){ try { await IDB.open(); dbReady = true; (await IDB.all()).forEach(([k,v]) => { if(v && v.blob) CLIPS.set(k, URL.createObjectURL(v.blob)); }); } catch(e){ dbReady = false; } }

// 소리 주소 찾기: 녹음 → 음원 파일 순서. 없으면 null (그 문제는 내지 않음)
const Audio2 = {
  url(kind, key){ key = lc(key);
    const clipKey = kind === "sounds" ? "s:"+key : kind === "rimes" ? "r:"+key : null;
    if(clipKey && CLIPS.has(clipKey)) return CLIPS.get(clipKey);
    return (FILES[kind] && FILES[kind][key]) || null; },
  has(kind, key){ return !!Audio2.url(kind, key); },
  // 재생 성공이면 true, 실패면 false (실패는 오답이 아님)
  play(kind, key){ const u = Audio2.url(kind, key); if(!u) return Promise.resolve(false);
    return new Promise(res => { let done = false; const fin = ok => { if(!done){ done = true; res(ok); } };
      try { const a = new Audio(u); a.onended = () => fin(true); a.onerror = () => fin(false);
        // 소리 길이를 알면 길이 + 2초까지 기다림. 길이를 모르면 15초. 그때까지 안 끝나면 실패로 봄
        let limit = setTimeout(() => fin(false), 15000);
        a.onloadedmetadata = () => { if(isFinite(a.duration) && a.duration > 0){ clearTimeout(limit); limit = setTimeout(() => fin(a.ended), a.duration*1000 + 2000); } };
        const p = a.play(); if(p && p.catch) p.catch(() => fin(false)); }
      catch(e){ fin(false); } }); },
  async seq(list, gap){ for(const [k, v] of list){ const ok = await Audio2.play(k, v); if(!ok) return false; await wait(gap || 350); } return true; }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* =========================================================
   4. 화면 도구
   ========================================================= */
const app = document.getElementById("app");
function h(tag, attrs, ...kids){ const e = document.createElement(tag); if(attrs) for(const k in attrs){ const v = attrs[k]; if(v == null || v === false) continue; if(k === "class") e.className = v; else if(k === "html") e.innerHTML = v; else if(k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); } kids.flat().forEach(c => { if(c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(c)); }); return e; }
const ICON = {
  book:'<svg viewBox="0 0 40 40"><path d="M4 9c5-2 10-2 16 2v22c-6-4-11-4-16-2z" fill="#ffd25e" stroke="#26384a" stroke-width="2.4" stroke-linejoin="round"/><path d="M36 9c-5-2-10-2-16 2v22c6-4 11-4 16-2z" fill="#fff" stroke="#26384a" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 15h8M24 20h8M24 25h6" stroke="#5aa9d6" stroke-width="2.2" stroke-linecap="round"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="#26384a" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="#fff"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="#26384a" stroke-width="2.2" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 10v9.5h12V10"/></svg>',
  spk:'<svg viewBox="0 0 24 24" fill="none" stroke="#1f6f96" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  ear:'<svg viewBox="0 0 64 64"><path d="M22 40c0 8 5 12 10 12s8-3 8-8c0-6 10-9 10-20 0-9-7-16-16-16S18 14 18 24" fill="#ffc9a8" stroke="#26384a" stroke-width="3" stroke-linecap="round"/><path d="M28 26c0-4 3-7 6-7s6 3 6 7c0 4-5 5-5 9" fill="none" stroke="#26384a" stroke-width="3" stroke-linecap="round"/><path d="M52 20c3 4 3 10 0 14M57 16c5 6 5 16 0 22" fill="none" stroke="#e0806e" stroke-width="3" stroke-linecap="round"/></svg>',
  open:'<svg viewBox="0 0 64 64"><path d="M6 16c9-4 18-4 26 3v32c-8-6-17-6-26-3z" fill="#fff" stroke="#6b4fb8" stroke-width="3" stroke-linejoin="round"/><path d="M58 16c-9-4-18-4-26 3v32c8-6 17-6 26-3z" fill="#fff" stroke="#6b4fb8" stroke-width="3" stroke-linejoin="round"/><path d="M12 25h14M12 32h14M12 39h10M38 25h14M38 32h14M38 39h10" stroke="#a996e6" stroke-width="2.6" stroke-linecap="round"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="#ffcf3f" stroke="#e0a91a" stroke-width="1.2" stroke-linejoin="round"/></svg>'
};
const svg = k => h("span", {html:ICON[k], style:"display:contents"});
let toastT; function toast(msg){ document.querySelectorAll(".toast").forEach(t => t.remove()); const t = h("div", {class:"toast", role:"status"}, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }
function shuffle(a){ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }

/* =========================================================
   5. 퀴즈 엔진 (모든 문제 유형이 같이 씀)
   ========================================================= */
// ask(opts) → "first" | "hint" | "fail" | "skip"
//  opts.prompt   화면 글 (안내 음성은 opts.guide 키로 따로)
//  opts.play     문제 소리를 내는 함수 → true/false. false면 '소리 실패'로 처리하고 오답으로 세지 않음
//  opts.choices  [{label, value, play?}]  play가 있으면 누를 때 그 소리를 냄
//  opts.answer   정답 value
//  opts.skill    기록할 기술 (SKILLS 중 하나)
//  opts.item     자주 틀린 것 기록용 이름
//  opts.hint     첫 번째 오답 뒤 보여줄 힌트 글
//  opts.easier   두 번 틀렸을 때 이어서 낼 쉬운 문제 (함수 → opts). 결과는 기록하지 않음
let failStreak = 0;
// 모듈이 쉬운 문제를 안 주면: 같은 소리 + 보기 2개(정답 1, 오답 1)로 자동으로 만듦
function defaultEasier(opts){
  const wrong = opts.choices.find(c => c.value !== opts.answer);
  const right = opts.choices.find(c => c.value === opts.answer);
  if(!right || !wrong) return null;
  return {prompt:"정답은 "+right.label+"예요. "+right.label+"을(를) 눌러요", play:opts.play, letters:opts.letters, choices:shuffle([right, wrong]), answer:opts.answer};
}
function ask(stage, opts){
  return new Promise(resolve => {
    let tries = 0, over = false, done = false;
    const hintBox = h("div", {class:"hint", hidden:true});
    const banner = h("div", {class:"banner", hidden:true});
    const box = h("div", {class:"choices big-choices locked-wait"+(opts.letters ? " letters" : ""), "data-ans":TEST ? String(opts.answer) : null});
    const lock = on => { box.classList.toggle("locked-wait", on); box.querySelectorAll(".choice").forEach(b => { if(!b.classList.contains("wrong")) b.disabled = on; }); };
    // 문제 소리가 끝나야 고를 수 있어요. 소리가 실패하면 고르기 잠금 유지 → 오답으로 세지 않음
    async function playPrompt(){
      if(!opts.play){ lock(false); return true; }
      lock(true); banner.hidden = true;
      const ok = await opts.play();
      if(over) return ok;
      if(ok) lock(false); else audioFailed();
      return ok;
    }
    function audioFailed(){
      banner.hidden = false;
      banner.replaceChildren(h("span", null, "소리가 안 나와요. 이 문제는 틀린 걸로 세지 않아요."),
        h("button", {class:"sbtn", onclick:() => playPrompt()}, "다시 듣기"),
        h("button", {class:"sbtn", onclick:() => finish("skip")}, "이 문제 넘기기"));
    }
    function finish(result){ if(done) return; done = true; over = true;
      if(result !== "skip"){ record(opts.skill, result, opts.item); failStreak = result === "fail" ? failStreak + 1 : 0; }
      resolve(result); }
    opts.choices.forEach(c => box.append(h("button", {class:"choice", "data-v":c.value, disabled:!!opts.play, onclick:async e => {
      if(over) return; const btn = e.currentTarget;
      if(c.play) await c.play();
      if(c.value === opts.answer){ over = true; btn.classList.add("right"); const r = tries === 0 ? "first" : "hint"; setTimeout(() => finish(r), 900); return; }
      tries++; btn.classList.add("wrong"); btn.disabled = true;
      if(tries === 1){ hintBox.hidden = false; hintBox.textContent = opts.hint || "다시 듣고 골라 봐요"; await wait(300); playPrompt(); return; }
      // 두 번 틀림: 정답을 보여주고 들려준 뒤, 쉬운 확인 문제 하나 (모든 문제 유형에 공통)
      over = true; box.querySelectorAll(".choice").forEach(b => { if(b.dataset.v === String(opts.answer)) b.classList.add("right"); });
      hintBox.hidden = false; hintBox.textContent = "정답은 이거예요. 같이 들어 봐요";
      await wait(400); if(opts.play) await opts.play(); await wait(900);
      const e2 = opts.easier ? opts.easier() : defaultEasier(opts);
      if(e2) await askQuiet(stage, e2);
      finish("fail");
    }}, c.label)));
    stage.replaceChildren();
    if(opts.counter) stage.append(h("div", {class:"counter"}, opts.counter));
    if(opts.top) stage.append(opts.top);
    if(opts.prompt) stage.append(h("div", {class:"q"}, opts.prompt));
    if(opts.play) stage.append(h("button", {class:"listen", onclick:() => playPrompt()}, svg("spk"), "다시 듣기"));
    stage.append(hintBox, banner, box);
    setTimeout(() => playPrompt(), 300);
  });
}
// 쉬운 확인 문제: 기록 없이. 틀린 보기는 잠겨서 결국 정답만 남아요. 넘기기 버튼도 있어요.
function askQuiet(stage, opts){
  return new Promise(resolve => {
    let done = false; const end = () => { if(!done){ done = true; resolve(); } };
    stage.replaceChildren(h("div", {class:"q"}, opts.prompt || "다시 해 봐요"));
    if(opts.play) stage.append(h("button", {class:"listen", onclick:() => opts.play()}, svg("spk"), "다시 듣기"));
    const box = h("div", {class:"choices big-choices"+(opts.letters ? " letters" : "")});
    box.dataset.quiet = "1"; if(TEST) box.dataset.ans = String(opts.answer);
    opts.choices.forEach(c => box.append(h("button", {class:"choice", "data-v":c.value, onclick:async e => { const b = e.currentTarget; if(c.play) await c.play();
      if(c.value === opts.answer){ b.classList.add("right"); setTimeout(end, 800); } else { b.classList.add("wrong"); b.disabled = true; } }}, c.label)));
    stage.append(box, h("button", {class:"sbtn quiet-skip", onclick:end}, "다음 문제로"));
    if(opts.play) setTimeout(() => opts.play(), 300);
  });
}

/* =========================================================
   6. 문제 모듈 등록
   ========================================================= */
// 모듈 = { id, category, name, needs(item) → [[kind,key],...], items(ctx) → [...], run(stage,item,ctx) → Promise<result> }
const MODULES = {};
window.PhonicsModules = { register(m){ if(m && m.id && m.category) MODULES[m.id] = m; } };
const CTX = {
  ask, askQuiet, record, shuffle, uniq, wait, h, svg, Audio:Audio2, decodable, graphemes,
  taught:TAUGHT, todayWords:TODAY_WORDS, reviewWords:REVIEW_WORDS, rimes:RIMES, sight:SIGHT, sentences:SENTENCES, newSounds:NEW_SOUNDS,
  misses:() => S.misses,
  // 오늘 단어 → 자주 틀린 복습 단어 → 나머지 복습 단어
  pickWords(n){ const missed = REVIEW_WORDS.filter(w => S.misses[w] > 0).sort((a,b) => S.misses[b] - S.misses[a]);
    return uniq([...shuffle(TODAY_WORDS), ...missed, ...shuffle(REVIEW_WORDS)]).slice(0, n); }
};
function approved(catId){
  const list = TEST ? Object.values(MODULES).filter(m => m.category === catId && m.test).map(m => m.id) : ((RAW.modules || {})[catId] || []);
  return list.map(id => MODULES[id]).filter(Boolean);
}
// 소리가 다 있는 문제만 냄
function readyItems(m){ return (m.items(CTX) || []).filter(it => (m.needs ? m.needs(it) : []).every(([k, v]) => Audio2.has(k, v))); }
function catStatus(cat){
  const mods = approved(cat.id);
  if(!mods.length) return {state:"empty", label:"문제 준비 중"};
  const playable = mods.filter(m => readyItems(m).length);
  if(!playable.length) return {state:"noaudio", label:"소리 준비 중"};
  if(S.progress.done[cat.id]) return {state:"done", label:"다 했어요"};
  return {state:"ready", label:"할 수 있어요", mods:playable};
}

/* =========================================================
   7. 메인 화면
   ========================================================= */
function home(){
  app.replaceChildren();
  const top = h("div", {class:"bar"},
    h("div", {class:"brand"}, h("span", {html:ICON.book, style:"display:contents"}), "파닉스 리딩", TEST ? h("span", {class:"testtag"}, "시험 모드") : null),
    h("button", {class:"pill-btn", onclick:openGate, "aria-label":"부모 관리 열기"}, svg("gear"), "부모 관리"));
  const hero = h("div", {class:"hero"}, h("img", {class:"lion", src:HERO, alt:"주인공 친구"}));
  const icons = {sound:svg("ear"), word:h("div", {class:"tiles-mini"}, h("span", null, "h"), h("span", null, "a"), h("span", null, "t")),
    sight:h("div", {class:"tiles-mini"}, h("span", {style:"width:auto;padding:0 10px"}, "the")), reading:svg("open")};
  const sts = CATEGORIES.map(c => [c, catStatus(c)]);
  const nextCat = sts.find(([, s]) => s.state === "ready");
  const cards = h("div", {class:"cards"}, sts.map(([c, st]) => h("button", {class:"card "+c.cls+(st.state === "empty" || st.state === "noaudio" ? " locked" : ""),
      onclick:() => { if(st.state === "ready" || st.state === "done") runCategory(c, false); else toast(st.state === "empty" ? "아직 문제가 없어요" : "소리가 준비되면 열려요"); }},
    h("span", {class:"badge"+(st.state === "done" ? " ok" : "")}, st.label), h("div", {class:"ico"}, icons[c.id]), h("div", {class:"nm"}, c.name))));
  const doneN = sts.filter(([, s]) => s.state === "done").length, availN = sts.filter(([, s]) => s.state === "ready" || s.state === "done").length;
  const start = h("button", {class:"start", onclick:() => { if(nextCat) runAll(); else if(availN) toast("오늘 학습을 다 했어요! 카드를 눌러 다시 해도 돼요"); else toast("아직 문제가 없어요"); }},
    svg("play"), availN === 0 ? "문제 준비 중" : nextCat ? (doneN ? "이어서 하기" : "학습 시작") : "오늘 학습 끝!");
  const dots = h("div", {class:"dots"}, sts.map(([c, s], i) => h("div", {class:"dot"+(s.state === "done" ? " done" : nextCat && nextCat[0] === c ? " now" : "")}, String(i+1))));
  app.append(top, hero, h("section", {class:"today"}, h("h1", null, "오늘의 학습"), dots, cards, start,
    h("p", {class:"sample"}, (RAW.sample ? "예시 내용 · " : (RAW.book ? RAW.book+" · " : ""))+"배운 소리 ", h("b", null, TAUGHT.join(" ")))));
}

/* =========================================================
   8. 진행: 카테고리 → 모듈 → 문제
   ========================================================= */
let running = null;
async function runAll(){
  for(const c of CATEGORIES){ const st = catStatus(c); if(st.state !== "ready") continue;
    const r = await runCategory(c, true); if(r === "stop") return; }
  celebrate("오늘 학습 끝! 최고예요", home);
}
function shell(cat){
  app.replaceChildren();
  app.append(h("div", {class:"lesson-top"}, h("button", {class:"pill-btn", onclick:stopRun}, svg("home"), "그만하기"), h("div", {class:"step-name"}, cat.name)));
  const stage = h("section", {class:"stage"}); app.append(stage); return stage;
}
function stopRun(){ if(running) running.stopped = true; home(); }
// 카테고리 하나: 승인된 모듈을 차례로. 문제를 실제로 푼 경우에만 '완료'로 저장 (건너뛰기는 완료 아님)
async function runCategory(cat, chained){
  const st = catStatus(cat); if(st.state !== "ready" && st.state !== "done") return "skip";
  const mods = approved(cat.id).filter(m => readyItems(m).length);
  running = {stopped:false}; const me = running; failStreak = 0;
  let solved = 0, skipped = 0;
  for(const m of mods){
    const items = readyItems(m);
    for(let i = 0; i < items.length; i++){
      if(me.stopped) return "stop";
      if(failStreak >= 3){ const go = await restScreen(cat); if(go === "stop"){ stopRun(); return "stop"; } failStreak = 0; }
      const stage = shell(cat);
      const r = await m.run(stage, items[i], Object.assign({}, CTX, {counter:(i+1)+" / "+items.length}));
      if(me.stopped) return "stop";
      if(r === "first" || r === "hint" || r === "fail") solved++; else skipped++;
    }
  }
  const complete = solved > 0 && skipped === 0;   // 전부 풀었을 때만 완료
  if(complete){ S.progress.done[cat.id] = true; save(); }
  const msg = complete ? cat.name+" 끝! 잘했어요" : solved ? "소리가 안 나온 문제가 있어서 다음에 다시 해요" : "이번엔 풀 문제가 없었어요";
  if(!chained){ celebrate(msg, home); return "done"; }
  if(solved) await celebrateWait(msg);
  return "done";
}
function restScreen(cat){
  return new Promise(res => { const st = shell(cat);
    st.append(h("div", {class:"cheer"}, h("img", {class:"lion", src:HERO, alt:""}), h("h2", null, "조금 어려웠지? 잠깐 쉬어 갈까?"),
      h("div", {class:"row"}, h("button", {class:"btn next", onclick:() => res("go")}, "계속하기"), h("button", {class:"btn again", onclick:() => res("stop")}, "오늘은 그만"))));
  });
}
function celebrate(msg, then){ app.replaceChildren(); const st = h("section", {class:"stage"}); app.append(st);
  st.append(h("div", {class:"cheer pop"}, h("img", {class:"lion", src:HERO, alt:""}), h("div", {class:"stars"}, svg("star"), svg("star"), svg("star")), h("h2", null, msg), h("button", {class:"btn next", onclick:then}, "처음으로"))); }
function celebrateWait(msg){ return new Promise(res => { app.replaceChildren(); const st = h("section", {class:"stage"}); app.append(st);
  st.append(h("div", {class:"cheer pop"}, h("img", {class:"lion", src:HERO, alt:""}), h("div", {class:"stars"}, svg("star"), svg("star"), svg("star")), h("h2", null, msg), h("button", {class:"btn next", onclick:res}, "다음으로"))); }); }

/* =========================================================
   9. 부모 관리: 학습 기록 + 준비 상태 + 백업·복원
   ========================================================= */
function openGate(){
  const a = 3 + Math.floor(Math.random()*5), b = 2 + Math.floor(Math.random()*5), ans = a + b;
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
  const rows = SKILLS.map(([k, name]) => { const r = S.records[k]; const all = r.first + r.hint + r.fail; const pct = all ? Math.round(r.first/all*100) : 0;
    return h("tr", null, h("td", null, name), h("td", null, String(r.first)), h("td", null, String(r.hint)), h("td", null, String(r.fail)), h("td", null, all ? pct+"%" : "–")); });
  const misses = Object.entries(S.misses).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
  app.append(h("section", {class:"panel"}, h("h2", null, "학습 기록"),
    h("p", null, "처음에 맞힘 / 힌트 받고 맞힘 / 끝내 틀림을 따로 세요. 리딩은 고르기 문제 결과라서 실제 읽기 실력과 같지 않아요."),
    h("div", {class:"tbl-wrap"}, h("table", null, h("thead", null, h("tr", null, h("th", null, "기술"), h("th", null, "처음에 맞힘"), h("th", null, "힌트 후 맞힘"), h("th", null, "틀림"), h("th", null, "처음에 맞힌 비율"))), h("tbody", null, rows))),
    h("p", null, "자주 틀린 것: "+(misses.join(", ") || "아직 없어요"))));
  // 준비 상태 — 매일 업데이트가 끝났는지 확인용
  const prep = CATEGORIES.map(c => { const mods = approved(c.id); const st = catStatus(c);
    const missing = uniq(mods.flatMap(m => (m.items(CTX) || []).flatMap(it => (m.needs ? m.needs(it) : []).filter(([k, v]) => !Audio2.has(k, v)).map(([k, v]) => (k === "rimes" ? "-" : "")+v))));
    return h("tr", null, h("td", null, c.name), h("td", null, mods.length ? mods.map(m => m.name).join(", ") : "없음"), h("td", null, st.label), h("td", {class:"lt"}, missing.join(", ") || "–")); });
  app.append(h("section", {class:"panel"}, h("h2", null, "준비 상태"),
    h("div", {class:"tbl-wrap"}, h("table", null, h("thead", null, h("tr", null, h("th", null, "카테고리"), h("th", null, "문제 유형"), h("th", null, "상태"), h("th", null, "없는 소리"))), h("tbody", null, prep))),
    h("p", null, "배운 소리로 읽을 수 없어서 뺀 단어: "+(EXCLUDED.join(", ") || "없음"))));
  // 백업·복원
  const fileIn = h("input", {type:"file", accept:"application/json,.json", id:"restore-file", hidden:true});
  const area = h("div", {class:"confirm"});
  fileIn.addEventListener("change", async () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ""; if(!f) return;
    const d = await readBackup(f); if(!d.ok){ toast(d.msg); return; }
    area.replaceChildren(h("span", null, d.summary+" · 지금 기록을 이 파일로 바꿀까요?"),
      h("button", {class:"danger", onclick:async e => { e.currentTarget.disabled = true; const r = await applyBackup(d.data); parent(); toast(r.ok ? "불러왔어요"+(r.clips ? " · 녹음 "+r.clips+"개" : "") : "불러오지 못했어요. 지금 기록은 그대로예요"); }}, "네, 바꿔요"),
      h("button", {class:"pill-btn", onclick:() => area.replaceChildren(...baseBtns())}, "아니요")); });
  const baseBtns = () => [h("button", {class:"sbtn go", onclick:() => download(backupData(true), "phonics-backup-"+today()+".json")}, "백업 파일 만들기"),
    h("button", {class:"sbtn", onclick:() => fileIn.click()}, "백업 불러오기"),
    h("button", {class:"sbtn", onclick:() => download(backupData(false), "phonics-records-"+today()+".json")}, "분석용 기록만 저장")];
  area.replaceChildren(...baseBtns());
  app.append(h("section", {class:"panel"}, h("h2", null, "백업·복원"),
    h("p", null, "백업 파일: 기록 + 오늘 진도 + 녹음까지 전부. 분석용 기록: 녹음 없이 기록만 (Claude에게 보낼 때)."), area, fileIn));
}
function b64(blob){ return new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => res(""); r.readAsDataURL(blob); }); }
async function backupData(withAudio){
  const out = {app:"phonics-reading", version:2, kind:withAudio ? "full" : "records", savedAt:new Date().toISOString(), records:S.records, misses:S.misses, progress:S.progress};
  if(withAudio){ out.clips = {}; if(dbReady) for(const [k, v] of await IDB.all()){ if(v && v.blob) out.clips[k] = {dur:v.dur, at:v.at, type:v.blob.type, data:await b64(v.blob)}; } }
  return out;
}
async function download(dataP, name){
  const data = await dataP; const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
  const a = h("a", {href:URL.createObjectURL(blob), download:name}); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast("파일을 만들었어요 · 다운로드 폴더를 확인해요");
}
// 백업 파일 검사: 6개 기록이 모두 있고 숫자가 0 이상 정수인지까지 확인. 맞을 때만 바꿀지 물어봄
const isCount = n => Number.isInteger(n) && n >= 0 && n < 1e7;
function checkRecords(recs){
  if(!recs || typeof recs !== "object") return null;
  // 예전 형식 {ok, all} → 새 형식 (맞힘은 '처음에 맞힘', 나머지는 '틀림')
  if(Object.values(recs).some(r => r && typeof r.all === "number")){ const n = {};
    for(const k in recs){ const r = recs[k] || {}; if(!isCount(r.ok) || !isCount(r.all) || r.ok > r.all) return null; n[k] = {first:r.ok, hint:0, fail:r.all - r.ok}; } recs = n; }
  const out = {};
  for(const [k] of SKILLS){ const r = recs[k]; if(!r || !isCount(r.first) || !isCount(r.hint) || !isCount(r.fail)) return null; out[k] = {first:r.first, hint:r.hint, fail:r.fail}; }
  return out;
}
async function readBackup(file){
  try { const d = JSON.parse(await file.text());
    if(!d || d.app !== "phonics-reading") return {ok:false, msg:"파닉스 리딩 백업 파일이 아니에요"};
    const recs = checkRecords(d.records); if(!recs) return {ok:false, msg:"기록이 망가진 파일이라 불러오지 않았어요"};
    const misses = {}; if(d.misses && typeof d.misses === "object") for(const k in d.misses){ if(isCount(d.misses[k])) misses[k] = d.misses[k]; }
    const clips = (d.clips && typeof d.clips === "object") ? d.clips : null;
    const total = Object.values(recs).reduce((s, r) => s + r.first + r.hint + r.fail, 0);
    return {ok:true, data:{records:recs, misses, progress:d.progress, clips}, summary:(typeof d.savedAt === "string" ? d.savedAt.slice(0,10) : "날짜 모름")+" 백업 · 푼 문제 "+total+"개"};
  } catch(e){ return {ok:false, msg:"파일을 읽을 수 없어요"}; }
}
async function applyBackup(d){
  try {
    const next = normalize({records:d.records, misses:d.misses, progress:(d.progress && typeof d.progress === "object" && d.progress.done && typeof d.progress.done === "object") ? {day:String(d.progress.day || ""), done:d.progress.done} : null});
    let n = 0;
    if(d.clips && dbReady){ for(const k in d.clips){ const c = d.clips[k]; if(!c || typeof c.data !== "string") continue;
      const bin = atob(c.data); const u8 = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], {type:c.type || "audio/wav"}); await IDB.put(k, {blob, dur:c.dur, at:c.at}); const o = CLIPS.get(k); if(o) URL.revokeObjectURL(o); CLIPS.set(k, URL.createObjectURL(blob)); n++; } }
    S = next; save();
    return {ok:true, clips:n};
  } catch(e){ return {ok:false}; }
}

/* =========================================================
   10. 시험용 모듈 (?test=1 일 때만). 실제 문제 유형이 아니에요.
   ========================================================= */
if(TEST){
  window.PhonicsModules.register({id:"_test_letter", category:"sound", name:"시험: 소리 듣고 글자", test:true,
    items:ctx => ctx.taught.filter(g => g.length === 1).slice(0, 3), needs:g => [["sounds", g]],
    run:(stage, g, ctx) => { const others = ctx.shuffle(ctx.taught.filter(x => x !== g && x.length === 1)).slice(0, 2);
      return ctx.ask(stage, {counter:ctx.counter, prompt:"이 소리는 어떤 글자일까?", play:() => ctx.Audio.play("sounds", g), letters:true,
        choices:ctx.shuffle([g, ...others]).map(x => ({label:x, value:x})), answer:g, skill:"sound", item:"s:"+g, hint:"소리를 다시 들어 봐요",
        easier:() => ({prompt:"이 소리는 "+g+"예요. "+g+"를 눌러요", play:() => ctx.Audio.play("sounds", g), letters:true, choices:ctx.shuffle([g, others[0]]).map(x => ({label:x, value:x})), answer:g})}); }});
  window.PhonicsModules.register({id:"_test_word", category:"word", name:"시험: 단어 듣고 고르기", test:true,
    items:ctx => ctx.pickWords(3), needs:w => [["words", w]],
    run:(stage, w, ctx) => ctx.ask(stage, {counter:ctx.counter, prompt:"들리는 단어를 골라요", play:() => ctx.Audio.play("words", w),
      choices:ctx.shuffle([w, ...ctx.shuffle([...ctx.todayWords, ...ctx.reviewWords].filter(x => x !== w)).slice(0, 2)]).map(x => ({label:x, value:x})), answer:w, skill:"read", item:w})});
}

try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch(e) {}
window.__phonics = {decodable, graphemes, S:() => S, excluded:EXCLUDED, files:FILES, audio:Audio2};  // 시험 확인용
loadClips().then(() => home());
home();
})();
