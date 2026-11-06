/* 단어 상자 — 매일 책 사진을 받으면 Claude가 이 파일만 고쳐요.
   게임 화면(app.js)은 그대로예요.
   지금 내용은 예시예요 (Jolly Phonics 1그룹 s a t i p n 기준). */
window.PHONICS_DATA = {
  sample: true,                       // 예시 내용이면 true. 교재 내용이 들어가면 false
  book: "예시",                        // 교재 이름
  // 지금까지 배운 소리 (오늘 새 소리 포함). 여기 없는 글자가 들어간 단어는 혼자 읽기 문제에 안 나와요.
  learned: ["s", "a", "t", "i", "p", "n"],
  today: {
    label: "예시 수업",
    page: "",                         // 책 쪽수 (예: "12~13쪽")
    newSound: "n",
    rimes: ["in", "ap"],              // 오늘 끝소리 (h + at = hat 방식)
    words: ["pin", "nap", "tin", "nip"],
    sight: [
      { w: "the", tip: "th 소리는 아직 안 배웠어요. 이 단어는 통째로 기억해요." }
    ],
    sentence: ["Pip", "sat", "in", "a", "tin."],
    sentenceSight: ["a"],
    question: { q: "Pip은 어디에 앉았나요?", choices: ["tin", "pan", "pit"], answer: "tin" }
  },
  // 예전에 배운 것 (복습에 섞여 나와요)
  bank: {
    words: ["sat", "pat", "tap", "at", "sit", "pit", "tip", "pan", "ant", "tan", "nap", "pin"],
    rimes: ["at", "it", "an"],
    sight: [
      { w: "I", tip: "대문자 I는 혼자 쓰면 '나'라는 뜻이에요. 글자 이름처럼 읽어요." }
    ]
  }
};
