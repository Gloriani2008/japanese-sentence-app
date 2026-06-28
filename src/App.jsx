import { useState, useCallback, useEffect } from "react";

const GENERATE_PROMPT = (topic) => `你是一个日语句子拆解助手。请生成一句关于「${topic}」的 N1-N2 难度日语长句，并进行四层拆解。你的所有explanation必须采用"日语解释 +（中文解释）"的固定格式，绝对不要使用英文。

请严格按照以下 XML 格式输出，不要输出任何其他内容：

<sentence>完整的日语句子</sentence>
<reading>用{漢字|かんじ}格式标注所有汉字的读音，例如：{今日|きょう}は{天気|てんき}がいい。没有汉字的部分原样保留。每个汉字词都要标注，不要遗漏。</reading>
<translation>中文翻译</translation>
<core>主干部分（只保留主语+谓语/核心动词，去掉所有修饰）</core>
<core_translation>主干的中文翻译</core_translation>
<core_explanation>简要说明为什么这是主干</core_explanation>
<part>
<text>修饰成分的日语原文</text>
<role>功能标签，如：时间状语 / 原因从句 / 连体修饰 / 并列</role>
<explanation>这块修饰成分在句中起什么作用，在用日语解释后，用中文也解释一遍</explanation>
</part>
<part>
<text>另一个修饰成分</text>
<role>功能标签</role>
<explanation>这块修饰成分在句中起什么作用，在用日语解释后，用中文也解释一遍</explanation>
</part>
<grammar>
<pattern>语法条目，如 ～にもかかわらず</pattern>
<meaning>语法含义</meaning>
<explanation>在本句中的具体用法和语感说明，在用日语解释后，用中文也解释一遍</explanation>
<level>N1 或 N2</level>
</grammar>
<grammar>
<pattern>另一个语法点</pattern>
<meaning>含义</meaning>
<explanation>在本句中的具体用法和语感说明，在用日语解释后，用中文也解释一遍</explanation>
<level>级别</level>
</grammar>

素材风格随机选择：新闻报道、社会评论、剧评影评、文学性描写、演讲/访谈体等。
句子长度适中偏长，包含2-4个值得讲解的语法点，生成3-5个修饰成分拆解。
重要：每个explanation都必须先用日语解释，再用中文解释，两种语言都要有。`;

const ANALYZE_PROMPT = (sentence) => `你是一个日语句子拆解助手。请对以下日语句子进行四层拆解。你的所有explanation必须采用"日语解释 +（中文解释）"的固定格式，绝对不要使用英文。

句子：${sentence}

请严格按照以下 XML 格式输出，不要输出任何其他内容：

<sentence>${sentence}</sentence>
<reading>用{漢字|かんじ}格式标注所有汉字的读音，例如：{今日|きょう}は{天気|てんき}がいい。没有汉字的部分原样保留。每个汉字词都要标注，不要遗漏。</reading>
<translation>中文翻译</translation>
<core>主干部分（只保留主语+谓语/核心动词，去掉所有修饰）</core>
<core_translation>主干的中文翻译</core_translation>
<core_explanation>简要说明为什么这是主干</core_explanation>
<part>
<text>修饰成分的日语原文</text>
<role>功能标签，如：时间状语 / 原因从句 / 连体修饰 / 并列</role>
<explanation>这块修饰成分在句中起什么作用，在用日语解释后，用中文也解释一遍</explanation>
</part>
<grammar>
<pattern>语法条目</pattern>
<meaning>语法含义</meaning>
<explanation>在本句中的具体用法和语感说明。在用日语解释后，用中文也解释一遍</explanation>
<level>N1 或 N2 或 N3</level>
</grammar>

请生成所有修饰成分的拆解（每个成分一个part标签），以及2-4个值得讲解的语法点。
重要：每个explanation都必须先用日语解释，再用中文解释，两种语言都要有。`;

const TOPICS = [
  "社会现象或时事评论", "电影或日剧评论", "日本文化或传统", "科技与生活",
  "文学性描写（自然、城市、人物）", "音乐剧或舞台艺术评论", "职场与人际关系", "旅行与异文化体验",
];

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function getAllBlocks(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

function parseResponse(text) {
  const sentence = getTag(text, "sentence");
  const reading = getTag(text, "reading");
  const translation = getTag(text, "translation");
  const core = getTag(text, "core");
  const coreTranslation = getTag(text, "core_translation");
  const coreExplanation = getTag(text, "core_explanation");
  const partBlocks = getAllBlocks(text, "part");
  const parts = partBlocks.map((b) => ({
    text: getTag(b, "text"), role: getTag(b, "role"), explanation: getTag(b, "explanation"),
  }));
  const grammarBlocks = getAllBlocks(text, "grammar");
  const grammarPoints = grammarBlocks.map((b) => ({
    pattern: getTag(b, "pattern"), meaning: getTag(b, "meaning"),
    explanation: getTag(b, "explanation"), level: getTag(b, "level"),
  }));
  if (!sentence) throw new Error("未找到句子");
  return {
    sentence, reading,
    layer1: { translation },
    layer2: { core, core_translation: coreTranslation, explanation: coreExplanation },
    layer3: { parts },
    layer4: { grammar_points: grammarPoints },
  };
}

function Furigana({ text }) {
  if (!text) return null;
  const parts = [];
  const re = /\{([^|]+)\|([^}]+)\}/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push(<span key={lastIndex}>{text.slice(lastIndex, match.index)}</span>);
    parts.push(
      <ruby key={match.index} style={{ rubyPosition: "over" }}>
        {match[1]}<rp>(</rp><rt style={{ fontSize: "0.5em", color: "#888" }}>{match[2]}</rt><rp>)</rp>
      </ruby>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length)
    parts.push(<span key={lastIndex}>{text.slice(lastIndex)}</span>);
  return <>{parts}</>;
}

const LOADING_MSGS = [
  "正在挑选一句刁钻的长句...", "AI 正在构思语法陷阱...",
  "标注汉字读音中...", "拆解句子结构中...", "组装语法讲解中...", "马上就好...",
];

function LoadingIndicator({ msg }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [dots, setDots] = useState("");
  useEffect(() => {
    const t1 = setInterval(() => setMsgIdx((i) => (i + 1) % LOADING_MSGS.length), 2500);
    const t2 = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 500);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  return (
    <div style={styles.empty}>
      <div style={styles.spinner} />
      <p style={styles.loadingText}>{msg || LOADING_MSGS[msgIdx]}{dots}</p>
      <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>通常需要几秒钟</p>
    </div>
  );
}

function splitSentences(text) {
  return text
    .split(/(?<=[。！？\n])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function App() {
  const [mode, setMode] = useState("random");
  const [sentence, setSentence] = useState(null);
  const [revealedLayer, setRevealedLayer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [inputText, setInputText] = useState("");
  const [sentences, setSentences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const speak = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.85;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeak = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // =============== 核心修改区域：切换至 Gemini API ===============
  const callAPI = async (prompt) => {
    // ⚠️ 请在这里填入你在 Google AI Studio 申请到的 API Key
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 
    
    // 使用 Gemini 2.5 Flash，速度极快且完全免费
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "text/plain"
        }
      }),
    });

    if (!res.ok) throw new Error("API 请求失败 (" + res.status + ")");
    const data = await res.json();
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("API 返回为空");
    return text;
  };
  // ================================================================

  const generateRandom = useCallback(async () => {
    stopSpeak();
    setLoading(true); setError(null); setSentence(null); setRevealedLayer(0);
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    try {
      const text = await callAPI(GENERATE_PROMPT(topic));
      setSentence(parseResponse(text));
    } catch (e) {
      setError("生成失败：" + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeCustom = useCallback(async (s, idx) => {
    stopSpeak();
    setLoading(true); setError(null); setSentence(null); setRevealedLayer(0);
    setCurrentIdx(idx);
    try {
      const text = await callAPI(ANALYZE_PROMPT(s));
      setSentence(parseResponse(text));
    } catch (e) {
      setError("拆解失败：" + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmitText = () => {
    if (!inputText.trim()) return;
    const split = splitSentences(inputText.trim());
    if (split.length === 0) return;
    setSentences(split);
    setSentence(null);
    setError(null);
  };

  const handleBack = () => {
    setSentence(null);
    setRevealedLayer(0);
    setError(null);
  };

  const reveal = () => { if (revealedLayer < 4) setRevealedLayer((l) => l + 1); };

  const handleNextSentence = () => {
    if (currentIdx < sentences.length - 1) {
      analyzeCustom(sentences[currentIdx + 1], currentIdx + 1);
    }
  };

  const handlePrevSentence = () => {
    if (currentIdx > 0) {
      analyzeCustom(sentences[currentIdx - 1], currentIdx - 1);
    }
  };

  const switchMode = (m) => {
    stopSpeak();
    setMode(m);
    setSentence(null); setSentences([]); setInputText("");
    setError(null); setLoading(false); setRevealedLayer(0);
  };

  const layerLabels = ["整句翻译", "提取主干", "修饰归位", "语法讲解"];

  const BreakdownView = () => (
    <div style={styles.content}>
      <div style={styles.sentenceCard}>
        <p style={styles.japaneseSentence}>
          <Furigana text={sentence.reading || sentence.sentence} />
        </p>
        <button
          onClick={() => speaking ? stopSpeak() : speak(sentence.sentence)}
          style={styles.speakBtn}
        >
          {speaking ? "⏹ 停止" : "🔊 朗读"}
        </button>
      </div>

      <div style={styles.progress}>
        {layerLabels.map((label, i) => (
          <div key={i} style={styles.progressItem}>
            <div style={{ ...styles.dot, background: i < revealedLayer ? "#2d5a27" : "#d0cdc6" }} />
            <span style={styles.dotLabel}>{label}</span>
          </div>
        ))}
      </div>

      {revealedLayer >= 1 && (
        <div style={{ ...styles.layer, animationName: "fadeSlide" }}>
          <div style={styles.layerTag}>第一层 · 整句翻译</div>
          <p style={styles.translation}>{sentence.layer1.translation}</p>
        </div>
      )}
      {revealedLayer >= 2 && (
        <div style={{ ...styles.layer, animationName: "fadeSlide" }}>
          <div style={styles.layerTag}>第二层 · 主干提取</div>
          <p style={styles.core}>{sentence.layer2.core}</p>
          <p style={styles.coreTranslation}>{sentence.layer2.core_translation}</p>
          <p style={styles.explanation}>{sentence.layer2.explanation}</p>
        </div>
      )}
      {revealedLayer >= 3 && (
        <div style={{ ...styles.layer, animationName: "fadeSlide" }}>
          <div style={styles.layerTag}>第三层 · 修饰归位</div>
          <div style={styles.parts}>
            {sentence.layer3.parts.map((p, i) => (
              <div key={i} style={styles.partCard}>
                <div style={styles.partHeader}>
                  <span style={styles.partText}>{p.text}</span>
                  <span style={styles.partRole}>{p.role}</span>
                </div>
                <p style={styles.partExpl}>{p.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {revealedLayer >= 4 && (
        <div style={{ ...styles.layer, animationName: "fadeSlide" }}>
          <div style={styles.layerTag}>第四层 · 语法讲解</div>
          <div style={styles.grammarList}>
            {sentence.layer4.grammar_points.map((g, i) => (
              <div key={i} style={styles.grammarCard}>
                <div style={styles.grammarHeader}>
                  <span style={styles.grammarPattern}>{g.pattern}</span>
                  <span style={styles.grammarLevel}>{g.level}</span>
                </div>
                <p style={styles.grammarMeaning}>{g.meaning}</p>
                <p style={styles.grammarExpl}>{g.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.actions}>
        {revealedLayer < 4 ? (
          <button onClick={reveal} style={styles.mainBtn}>拆解 →</button>
        ) : mode === "random" ? (
          <button onClick={generateRandom} style={styles.mainBtn}>换一句</button>
        ) : (
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {currentIdx > 0 && (
              <button onClick={handlePrevSentence} style={styles.secondaryBtn}>← 上一句</button>
            )}
            <button onClick={handleBack} style={styles.secondaryBtn}>回到列表</button>
            {currentIdx < sentences.length - 1 && (
              <button onClick={handleNextSentence} style={styles.mainBtn}>下一句 →</button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>句剖</h1>
        <p style={styles.subtitle}>一刀下去，长句不过如此</p>
      </header>

      <div style={styles.modeToggle}>
        <button
          onClick={() => switchMode("random")}
          style={mode === "random" ? styles.modeActive : styles.modeInactive}
        >随机生成</button>
        <button
          onClick={() => switchMode("custom")}
          style={mode === "custom" ? styles.modeActive : styles.modeInactive}
        >粘贴素材</button>
      </div>

      {loading && <LoadingIndicator />}

      {error && !loading && (
        <div style={styles.empty}>
          <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>
          <button onClick={() => setError(null)} style={{ ...styles.mainBtn, marginTop: 16 }}>返回</button>
        </div>
      )}

      {!loading && !error && !sentence && mode === "random" && (
        <div style={styles.empty}>
          <p style={styles.emptyText}>点击下方按钮，获取一句 N1 难度的日语长句</p>
          <p style={styles.emptyHint}>AI 会一层层帮你拆开它</p>
          <button onClick={generateRandom} style={styles.mainBtn}>来一句</button>
        </div>
      )}

      {!loading && !error && mode === "custom" && !sentence && sentences.length === 0 && (
        <div style={styles.customInput}>
          <p style={styles.emptyText}>粘贴你想拆解的日语文本</p>
          <p style={styles.emptyHint}>日剧台词、新闻、小说...什么都行</p>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="在这里粘贴日语文本..."
            style={styles.textarea}
            rows={6}
          />
          <button
            onClick={handleSubmitText}
            style={{ ...styles.mainBtn, marginTop: 16, opacity: inputText.trim() ? 1 : 0.4 }}
          >提取句子</button>
        </div>
      )}

      {!loading && !error && mode === "custom" && !sentence && sentences.length > 0 && (
        <div style={styles.content}>
          <p style={{ fontSize: 13, color: "#888", textAlign: "center" }}>
            共提取到 {sentences.length} 个句子，点击任意一句开始拆解
          </p>
          {sentences.map((s, i) => (
            <div
              key={i}
              onClick={() => analyzeCustom(s, i)}
              style={styles.sentenceListItem}
            >
              <span style={styles.sentenceNum}>{i + 1}</span>
              <span style={styles.sentencePreview}>{s}</span>
            </div>
          ))}
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button onClick={() => { setSentences([]); setInputText(""); }} style={styles.secondaryBtn}>
              重新粘贴
            </button>
          </div>
        </div>
      )}

      {!loading && !error && sentence && <BreakdownView />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus { outline: none; border-color: #2d5a27 !important; }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", background: "#f7f5f0", color: "#2c2c2c",
    fontFamily: "'Noto Sans SC', sans-serif", padding: "40px 20px",
    maxWidth: 640, margin: "0 auto",
  },
  header: { textAlign: "center", marginBottom: 24 },
  title: {
    fontFamily: "'Noto Serif JP', serif",
    fontSize: 42, fontWeight: 700, margin: 0, letterSpacing: 6,
  },
  subtitle: { fontSize: 14, color: "#888", marginTop: 8, letterSpacing: 2 },
  modeToggle: {
    display: "flex", justifyContent: "center", gap: 0,
    marginBottom: 32, background: "#e5e2db", borderRadius: 8, padding: 3,
    maxWidth: 260, margin: "0 auto 32px",
  },
  modeActive: {
    fontFamily: "'Noto Sans SC', sans-serif",
    flex: 1, padding: "8px 0", border: "none", borderRadius: 6,
    background: "#fff", color: "#2c2c2c", fontSize: 13, fontWeight: 600,
    cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  modeInactive: {
    fontFamily: "'Noto Sans SC', sans-serif",
    flex: 1, padding: "8px 0", border: "none", borderRadius: 6,
    background: "transparent", color: "#999", fontSize: 13, fontWeight: 500,
    cursor: "pointer",
  },
  customInput: { textAlign: "center", marginTop: 40 },
  textarea: {
    width: "100%", maxWidth: 560, padding: "14px 16px",
    border: "1px solid #d0cdc6", borderRadius: 8, fontSize: 15,
    fontFamily: "'Noto Serif JP', serif", lineHeight: 1.8,
    background: "#fff", color: "#2c2c2c", resize: "vertical",
    boxSizing: "border-box", marginTop: 16,
  },
  sentenceListItem: {
    display: "flex", alignItems: "flex-start", gap: 12,
    background: "#fff", borderRadius: 8, padding: "14px 16px",
    border: "1px solid #e5e2db", cursor: "pointer",
    transition: "border-color 0.2s",
  },
  sentenceNum: {
    fontSize: 11, fontWeight: 700, color: "#fff", background: "#2d5a27",
    width: 22, height: 22, borderRadius: "50%", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
  },
  sentencePreview: {
    fontFamily: "'Noto Serif JP', serif", fontSize: 14, lineHeight: 1.7,
  },
  empty: { textAlign: "center", marginTop: 80 },
  emptyText: { fontSize: 16, color: "#666" },
  emptyHint: { fontSize: 13, color: "#999", marginBottom: 8 },
  mainBtn: {
    fontFamily: "'Noto Sans SC', sans-serif",
    fontSize: 15, fontWeight: 500, padding: "12px 36px",
    border: "none", borderRadius: 6, background: "#2d5a27", color: "#fff",
    cursor: "pointer",
  },
  secondaryBtn: {
    fontFamily: "'Noto Sans SC', sans-serif",
    fontSize: 14, fontWeight: 500, padding: "10px 24px",
    border: "1px solid #d0cdc6", borderRadius: 6, background: "#fff", color: "#666",
    cursor: "pointer",
  },
  spinner: {
    width: 28, height: 28,
    border: "3px solid #d0cdc6", borderTopColor: "#2d5a27",
    borderRadius: "50%", animation: "spin 0.8s linear infinite",
    margin: "0 auto 16px",
  },
  loadingText: { color: "#999", fontSize: 14 },
  content: { display: "flex", flexDirection: "column", gap: 24 },
  sentenceCard: {
    background: "#fff", borderRadius: 8, padding: "28px 24px",
    border: "1px solid #e5e2db",
  },
  speakBtn: {
    fontFamily: "'Noto Sans SC', sans-serif",
    marginTop: 14, fontSize: 13, fontWeight: 500, padding: "6px 16px",
    border: "1px solid #d0cdc6", borderRadius: 6, background: "#fff", color: "#555",
    cursor: "pointer", transition: "all 0.2s",
  },
  japaneseSentence: {
    fontFamily: "'Noto Serif JP', serif",
    fontSize: 20, lineHeight: 2.4, margin: 0,
  },
  progress: { display: "flex", justifyContent: "center", gap: 24, padding: "8px 0" },
  progressItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: "50%", transition: "background 0.3s" },
  dotLabel: { fontSize: 10, color: "#999", whiteSpace: "nowrap" },
  layer: {
    background: "#fff", borderRadius: 8, padding: "20px 24px",
    border: "1px solid #e5e2db", animationDuration: "0.4s", animationFillMode: "both",
  },
  layerTag: { fontSize: 11, fontWeight: 700, color: "#2d5a27", letterSpacing: 1, marginBottom: 12 },
  translation: { fontSize: 16, lineHeight: 1.7, margin: 0 },
  core: {
    fontFamily: "'Noto Serif JP', serif",
    fontSize: 18, lineHeight: 1.8, margin: 0, color: "#2d5a27", fontWeight: 700,
  },
  coreTranslation: { fontSize: 14, color: "#666", margin: "6px 0 8px" },
  explanation: { fontSize: 13, color: "#888", margin: 0, lineHeight: 1.6 },
  parts: { display: "flex", flexDirection: "column", gap: 10 },
  partCard: { background: "#f7f5f0", borderRadius: 6, padding: "12px 16px" },
  partHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 6, gap: 8,
  },
  partText: { fontFamily: "'Noto Serif JP', serif", fontSize: 15, fontWeight: 500 },
  partRole: {
    fontSize: 11, fontWeight: 700, color: "#fff", background: "#2d5a27",
    padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0,
  },
  partExpl: { fontSize: 13, color: "#666", margin: 0, lineHeight: 1.6 },
  grammarList: { display: "flex", flexDirection: "column", gap: 12 },
  grammarCard: { background: "#f7f5f0", borderRadius: 6, padding: "14px 16px" },
  grammarHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
  },
  grammarPattern: {
    fontFamily: "'Noto Serif JP', serif", fontSize: 16, fontWeight: 700, color: "#2d5a27",
  },
  grammarLevel: {
    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
    border: "1px solid #2d5a27", color: "#2d5a27",
  },
  grammarMeaning: { fontSize: 14, fontWeight: 500, margin: "0 0 4px" },
  grammarExpl: { fontSize: 13, color: "#666", margin: 0, lineHeight: 1.6 },
  actions: { textAlign: "center", padding: "16px 0 40px" },
};

export default App;