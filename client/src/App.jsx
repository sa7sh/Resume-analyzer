import { useState, useEffect, useRef } from "react";
import axios from "axios";

// Animated counter hook
function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function ScoreRing({ score, size = 120 }) {
  const animated = useCountUp(score);
  const radius = 45;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (animated / 100) * circ;
  const color = score >= 70 ? "#00f5a0" : score >= 45 ? "#f5a623" : "#ff4d6d";

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.05s linear", filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'Syne', sans-serif", letterSpacing: "-1px" }}>
          {animated}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "2px", fontFamily: "'DM Sans', sans-serif" }}>
          ATS
        </span>
      </div>
    </div>
  );
}

function AnimatedBar({ value, color, delay = 0 }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height: 6, overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 99, width: `${width}%`,
        background: `linear-gradient(90deg, ${color}, ${color}aa)`,
        transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
        boxShadow: `0 0 10px ${color}66`
      }}/>
    </div>
  );
}

function Tag({ label, type }) {
  const styles = {
    matched: { bg: "rgba(0,245,160,0.08)", border: "rgba(0,245,160,0.25)", color: "#00f5a0" },
    missing: { bg: "rgba(255,77,109,0.08)", border: "rgba(255,77,109,0.25)", color: "#ff4d6d" },
  };
  const s = styles[type];
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      padding: "4px 12px", borderRadius: 99, fontSize: 11,
      fontFamily: "'DM Mono', monospace", letterSpacing: "0.5px", fontWeight: 500
    }}>
      {label}
    </span>
  );
}

function ConfidencePill({ level }) {
  const map = {
    high: { color: "#00f5a0", label: "HIGH CONFIDENCE" },
    medium: { color: "#f5a623", label: "MED CONFIDENCE" },
    low: { color: "#ff4d6d", label: "LOW CONFIDENCE" },
  };
  const c = map[level] || map.medium;
  return (
    <span style={{
      background: `${c.color}15`, border: `1px solid ${c.color}40`,
      color: c.color, padding: "3px 10px", borderRadius: 99,
      fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: "1.5px"
    }}>
      ● {c.label}
    </span>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return alert("Upload resume first");
    const formData = new FormData();
    formData.append("resume", file);
    formData.append("jobDescription", jobDesc);
    formData.append("role", "fullstack");
    formData.append("experienceLevel", "junior");
    try {
      setLoading(true); setResult(null);
      const res = await axios.post("http://localhost:5000/api/analyze", formData);
      setResult(res.data);
    } catch (err) {
      console.error(err); alert("Error analyzing resume");
    } finally { setLoading(false); }
  };

  const breakdown = result ? [
    { label: "Projects", value: result.atsBreakdown.projectsScore, color: "#7c6ff7" },
    { label: "Skills",   value: result.atsBreakdown.skillsScore,   color: "#00c2ff" },
    { label: "Summary",  value: result.atsBreakdown.summaryScore,  color: "#00f5a0" },
  ] : [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050810; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2540; border-radius: 99px; }

        .upload-zone { transition: all 0.25s ease; }
        .upload-zone:hover { border-color: rgba(0,194,255,0.5) !important; background: rgba(0,194,255,0.04) !important; }

        .analyze-btn {
          background: linear-gradient(135deg, #0066ff, #00c2ff);
          border: none; color: white; font-family: 'Syne', sans-serif;
          font-size: 15px; font-weight: 700; letter-spacing: 1px;
          padding: 16px; border-radius: 14px; cursor: pointer; width: 100%;
          transition: all 0.2s ease; position: relative; overflow: hidden;
        }
        .analyze-btn::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, #0052cc, #0099cc);
          opacity: 0; transition: opacity 0.2s;
        }
        .analyze-btn:hover::before { opacity: 1; }
        .analyze-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(0,194,255,0.3); }
        .analyze-btn:active { transform: translateY(0); }
        .analyze-btn span { position: relative; z-index: 1; }

        .card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; padding: 24px;
          backdrop-filter: blur(12px);
        }

        .fade-in { animation: fadeUp 0.5s ease forwards; opacity: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pulse-ring {
          animation: pulseRing 2s ease-in-out infinite;
        }
        @keyframes pulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,194,255,0.15); }
          50% { box-shadow: 0 0 0 12px rgba(0,194,255,0); }
        }

        .grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        textarea { resize: none; outline: none; }
        textarea::placeholder { color: rgba(255,255,255,0.2); }
        textarea:focus { border-color: rgba(0,194,255,0.4) !important; }

        li { line-height: 1.7; }

        .section-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; letter-spacing: 2px;
          text-transform: uppercase; margin-bottom: 12px;
          display: flex; align-items: center; gap: 8px;
        }
        .section-label::after {
          content: ''; flex: 1; height: 1px;
          background: rgba(255,255,255,0.07);
        }
      `}</style>

      <div className="grid-bg" style={{
        minHeight: "100vh", padding: result ? "20px" : "40px 20px",
        fontFamily: "'DM Sans', sans-serif", color: "white",
        background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,102,255,0.12) 0%, transparent 70%), #050810"
      }}>

        {/* HEADER — full hero when no results, compact navbar when results showing */}
        {!result ? (
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(0,194,255,0.08)", border: "1px solid rgba(0,194,255,0.2)",
              borderRadius: 99, padding: "6px 16px", marginBottom: 20
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00f5a0", boxShadow: "0 0 8px #00f5a0", display: "inline-block" }}/>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "2px" }}>
                AI-POWERED · ATS SCORING
              </span>
            </div>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.1,
              background: "linear-gradient(135deg, #fff 40%, rgba(0,194,255,0.7))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>
              Resume Analyzer
            </h1>
            <p style={{ color: "rgba(255,255,255,0.35)", marginTop: 10, fontSize: 14, letterSpacing: "0.3px" }}>
              Upload your resume and get instant ATS scoring, keyword gaps, and recruiter-level feedback
            </p>
          </div>
        ) : (
          /* Compact top bar when results are visible */
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            maxWidth: 1100, margin: "0 auto 16px",
            padding: "10px 16px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00f5a0", boxShadow: "0 0 8px #00f5a0", display: "inline-block" }}/>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16,
                background: "linear-gradient(135deg, #fff 40%, rgba(0,194,255,0.8))",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
              }}>Resume Analyzer</span>
            </div>
            <button onClick={() => { setResult(null); setFile(null); setJobDesc(""); }}
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.4)", borderRadius: 99, padding: "6px 16px",
                fontSize: 11, cursor: "pointer", fontFamily: "'DM Mono', monospace",
                letterSpacing: "1px", transition: "all 0.2s"
              }}
              onMouseEnter={e => e.target.style.borderColor = "rgba(255,255,255,0.3)"}
              onMouseLeave={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            >← ANALYZE ANOTHER</button>
          </div>
        )}

        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* INPUT PANEL */}
          {!result && (
            <div style={{ maxWidth: 540, margin: "0 auto" }} className="fade-in">

              {/* DROP ZONE */}
              <div
                className="upload-zone"
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
                style={{
                  border: `2px dashed ${dragOver ? "rgba(0,194,255,0.6)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 20, padding: "36px 24px", textAlign: "center",
                  cursor: "pointer", marginBottom: 16,
                  background: dragOver ? "rgba(0,194,255,0.06)" : "rgba(255,255,255,0.02)",
                }}
              >
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={(e) => setFile(e.target.files[0])} />
                <div style={{ fontSize: 32, marginBottom: 12 }}>
                  {file ? "📄" : "⬆"}
                </div>
                {file ? (
                  <>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "#00f5a0" }}>
                      {file.name}
                    </p>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>
                      {(file.size / 1024).toFixed(1)} KB · Click to change
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 }}>
                      Drop your resume here
                    </p>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>
                      PDF only · or click to browse
                    </p>
                  </>
                )}
              </div>

              {/* JD */}
              <textarea
                placeholder="Paste job description (optional but recommended)"
                value={jobDesc}
                onChange={(e) => setJobDesc(e.target.value)}
                rows={4}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
                  padding: "14px 16px", color: "white", fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif", marginBottom: 16,
                  transition: "border-color 0.2s"
                }}
              />

              <button className="analyze-btn pulse-ring" onClick={handleSubmit}>
                <span>{loading ? "Analyzing…" : "Analyze Resume →"}</span>
              </button>

              {loading && (
                <div style={{ textAlign: "center", marginTop: 20, color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: "1px" }}>
                  RUNNING ATS ENGINE · GENERATING FEEDBACK…
                </div>
              )}
            </div>
          )}

          {/* RESULTS */}
          {result && (
            <div>

              {/* TOP ROW — Score + Keywords side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginBottom: 16 }}>

                {/* SCORE CARD */}
                <div className="card fade-in" style={{ animationDelay: "0.05s", textAlign: "center" }}>
                  <div className="section-label" style={{ color: "rgba(255,255,255,0.25)", justifyContent: "center" }}>
                    OVERALL SCORE
                  </div>
                  <ScoreRing score={result.atsScore} size={130} />
                  <div style={{ marginTop: 14 }}>
                    <ConfidencePill level={result.confidence} />
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div className="section-label" style={{ color: "rgba(255,255,255,0.25)" }}>BREAKDOWN</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {breakdown.map((item, i) => (
                        <div key={item.label}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Mono', monospace" }}>{item.label}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: item.color, fontFamily: "'Syne', sans-serif" }}>{item.value}</span>
                          </div>
                          <AnimatedBar value={item.value} color={item.color} delay={i * 150 + 300} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* KEYWORDS */}
                <div className="card fade-in" style={{ animationDelay: "0.1s" }}>
                  <div className="section-label" style={{ color: "rgba(255,255,255,0.25)" }}>
                    KEYWORD MATCH
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 800, color: result.keywordAnalysis.matchPercentage >= 60 ? "#00f5a0" : "#f5a623", marginLeft: "auto" }}>
                      {result.keywordAnalysis.matchPercentage}%
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 11, color: "#00f5a0", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", marginBottom: 10 }}>MATCHED</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {result.keywordAnalysis.matched.map((k, i) => <Tag key={i} label={k} type="matched" />)}
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "#ff4d6d", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", marginBottom: 10 }}>MISSING</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {result.keywordAnalysis.missing.map((k, i) => <Tag key={i} label={k} type="missing" />)}
                      </div>
                    </div>
                  </div>

                  {result.keywordScoreDetails && (
                    <div style={{
                      padding: "12px 14px", borderRadius: 12,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)"
                    }}>
                      <p style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.3)", letterSpacing: "1px", marginBottom: 8 }}>SCORE DETAILS</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
                        {Object.entries(result.keywordScoreDetails).map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                            <span style={{ fontFamily: "'DM Mono', monospace" }}>{k}</span>
                            <span style={{ color: "rgba(255,255,255,0.6)" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM ROW — AI Feedback full width */}
              <div className="card fade-in" style={{ animationDelay: "0.15s" }}>
                <div className="section-label" style={{ color: "rgba(255,255,255,0.25)" }}>AI FEEDBACK</div>

                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.75, marginBottom: 20 }}>
                  {result.aiFeedback.overall_feedback}
                </p>

                {/* Strengths + Improvements side by side */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#00f5a0", letterSpacing: "1.5px", marginBottom: 10 }}>STRENGTHS</p>
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.aiFeedback.strengths.map((s, i) => (
                        <li key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.6)", alignItems: "flex-start" }}>
                          <span style={{ color: "#00f5a0", marginTop: 3, flexShrink: 0 }}>✓</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#ff4d6d", letterSpacing: "1.5px", marginBottom: 10 }}>IMPROVEMENTS</p>
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.aiFeedback.improvements.map((s, i) => (
                        <li key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.6)", alignItems: "flex-start" }}>
                          <span style={{ color: "#ff4d6d", marginTop: 3, flexShrink: 0 }}>↑</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Skills advice full width */}
                {result.aiFeedback.missing_skills_advice && (
                  <div style={{
                    padding: "14px 16px", borderRadius: 12,
                    background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.2)"
                  }}>
                    <p style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#f5a623", letterSpacing: "1.5px", marginBottom: 8 }}>SKILLS ADVICE</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                      {result.aiFeedback.missing_skills_advice}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <p style={{ textAlign: "center", marginTop: 48, fontSize: 11, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.12)", letterSpacing: "1.5px" }}>
          RESUME ANALYZER · BUILT WITH REACT + NODE.JS
        </p>

      </div>
    </>
  );
}
