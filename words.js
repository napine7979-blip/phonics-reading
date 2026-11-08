/* 학습 콘텐츠 — 매일 학습자료를 받으면 Claude가 이 파일만 고쳐요.
   게임 틀(app.js)은 그대로예요. 지금 내용은 예시예요. */
window.PHONICS_DATA = {
  sample: true,                 // 예시 내용이면 true
  book: "예시",                  // 교재 이름

  // 배운 글자-소리. 두 글자 소리(sh, ch, th, ee 등)도 배우면 여기에 넣어요.
  // 여기 없는 소리가 들어간 단어는 혼자 읽기 문제에 나오지 않아요.
  // 예: s, h, i, p만 있으면 ship은 안 나와요 (sh를 아직 안 배웠으니까).
  taught: ["s", "a", "t", "i", "p", "n"],

  today: {
    label: "예시 수업",
    page: "",                   // 책 쪽수
    newSounds: ["n"],
    words: ["pin", "nap", "tin", "nip"],
    rimes: ["in", "ap"],        // 끝소리 (h + at = hat)
    sight: [{ w: "the", tip: "th 소리는 아직 안 배웠어요. 이 단어는 통째로 기억해요." }],
    sentences: [
      { text: "Pip sat in a tin.", sight: ["a"],
        question: { q: "Pip은 어디에 앉았나요?", choices: ["tin", "pan", "pit"], answer: "tin" } }
    ]
  },

  // 예전에 배운 것 (복습에 섞여 나와요)
  bank: {
    words: ["sat", "pat", "tap", "at", "sit", "pit", "tip", "pan", "ant", "tan", "ship"],
    rimes: ["at", "it", "an"],
    sight: [{ w: "I", tip: "대문자 I는 혼자 쓰면 '나'라는 뜻이에요." }]
  },

  // 로라가 승인한 문제 유형 (학습지 분석 후 채워요). 비어 있으면 그 카테고리는 '준비 중'이에요.
  modules: { sound: [], word: [], sight: [], reading: [] }
};
