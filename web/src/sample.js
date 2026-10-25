// Original synthetic exercises only. No school documents or personal results.
const base = {
  version: 1,
  max_points: 10,
  minutes: 3,
  kind: "review",
  status: "verified",
  parent_id: null,
  source_id: "SYNTHETIC",
  source_label: "4Study 動作確認用の合成教材",
  source_page: "1",
  analysis_id: "SAMPLE-ANALYSIS",
  weakness_id: "SAMPLE-WEAKNESS",
  batch: "sample",
};
export const samples = [
  {
    id: "sample-math-1",
    subject: "数学",
    course: "数学II",
    unit: "二次関数",
    prompt: "y = x² − 4x + 7 の最小値と、そのときの x を求めよう。",
    answer: "最小値 3、そのとき x = 2",
    explanation:
      "y = (x − 2)² + 3 と平方完成します。平方は0以上なので、x = 2 のとき最小値3です。",
  },
  {
    id: "sample-math-2",
    subject: "数学",
    course: "数学II",
    unit: "指数",
    prompt: "2³ × 2⁴ を、2の累乗で表そう。",
    answer: "2⁷（128）",
    explanation: "底が同じ累乗の積では、指数を足します。3 + 4 = 7 です。",
  },
  {
    id: "sample-physics-1",
    subject: "物理",
    course: "物理基礎",
    unit: "運動",
    prompt:
      "静止している物体が、一定の加速度 2 m/s² で3秒間動いた。3秒後の速さは？",
    answer: "6 m/s",
    explanation: "v = v₀ + at。初速度0なので、2 × 3 = 6 m/s です。",
  },
  {
    id: "sample-chem-1",
    subject: "化学",
    course: "化学基礎",
    unit: "物質量",
    prompt: "モル質量18 g/molの水が36 gある。物質量を求めよう。",
    answer: "2 mol",
    explanation: "物質量 = 質量 ÷ モル質量。36 ÷ 18 = 2 mol です。",
  },
  {
    id: "sample-english-1",
    subject: "英語",
    course: "論理表現II",
    unit: "関係詞",
    prompt:
      "空欄に適切な関係代名詞を入れよう。\nThis is the book (     ) I bought yesterday.",
    answer: "which または that（省略も可能）",
    explanation:
      "先行詞は物を表すbookで、関係節のboughtの目的語が欠けています。目的格のwhich / thatを使い、省略もできます。",
  },
  {
    id: "sample-geo-1",
    subject: "地理",
    course: "地理総合",
    unit: "時差",
    prompt:
      "東経135度を標準時子午線とする地域で正午。東経0度を基準とする地域は何時？ サマータイムは考えない。",
    answer: "午前3時",
    explanation:
      "経度15度で1時間の時差です。135 ÷ 15 = 9時間。東側が進んでいるので、12 − 9 = 3時です。",
  },
  {
    id: "sample-math-v1",
    subject: "数学",
    course: "数学II",
    unit: "二次関数",
    prompt: "y = x² − 6x + 11 の最小値と、そのときの x を求めよう。",
    answer: "最小値 2、そのとき x = 3",
    explanation: "y = (x − 3)² + 2。x = 3で平方の項が0になり、最小値2です。",
    kind: "variant",
    parent_id: "sample-math-1",
  },
].map((q) => ({ ...base, ...q }));
