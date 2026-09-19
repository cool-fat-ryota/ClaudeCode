// 出題の分け方（文法ステップ／シチュエーション）の定義。
// phrases.js の step と tags が、ここのキーに対応している。

export const STEPS = [
  { key: 1, name: "1. 今のことを言う", note: "be動詞・一般動詞の現在形" },
  { key: 2, name: "2. たずねる・打ち消す", note: "疑問文と否定文" },
  { key: 3, name: "3. 過去のことを言う", note: "過去形" },
  { key: 4, name: "4. これからのこと", note: "will・be going to・助動詞" },
  { key: 5, name: "5. 経験と「もう／まだ」", note: "現在完了" },
  { key: 6, name: "6. 〜すること", note: "不定詞・動名詞" },
  { key: 7, name: "7. くらべる・つなぐ", note: "比較級・接続詞" },
  { key: 8, name: "8. 説明を足す", note: "受け身・関係代名詞・分詞" },
  { key: 9, name: "9. ていねいに言う", note: "仮定法・依頼・使役" },
];

export const TAGS = [
  { key: "daily", name: "毎日のこと", emoji: "🌤" },
  { key: "smalltalk", name: "あいさつ・雑談", emoji: "💬" },
  { key: "travel", name: "旅行・移動", emoji: "✈️" },
  { key: "restaurant", name: "レストラン", emoji: "🍽" },
  { key: "shopping", name: "買い物", emoji: "🛍" },
  { key: "work", name: "仕事", emoji: "💼" },
  { key: "trouble", name: "体調・トラブル", emoji: "🩹" },
  { key: "phone", name: "電話・オンライン", emoji: "📱" },
  { key: "home", name: "家族・家", emoji: "🏠" },
];

export const stepName = (key) => STEPS.find((s) => s.key === key)?.name ?? `ステップ${key}`;
export const tagName = (key) => TAGS.find((t) => t.key === key)?.name ?? key;
