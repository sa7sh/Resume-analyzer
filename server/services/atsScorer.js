/**
 * atsScorer.js
 * Deterministic ATS scoring engine — no AI, no heuristic guessing.
 *
 * Design principles:
 *  - Hard floors: non-empty sections never score 0
 *  - Balanced: strong signals boost more than weak signals penalise
 *  - Role-aware: frontend / backend / full-stack weights differ
 *  - Experience-aware: junior candidates get leniency on tooling gaps
 *  - Consistent with AI qualitative feedback
 */

// ─────────────────────────────────────────────
// 1. KEYWORD IMPORTANCE TIERS
// ─────────────────────────────────────────────

const KEYWORD_TIERS = {
  // Core skills — penalise heavily if missing from a relevant role
  core: [
    "react", "node", "node.js", "javascript", "typescript", "python", "java",
    "express", "rest api", "api", "html", "css", "sql", "mongodb",
    "postgresql", "mysql", "git", "github",
  ],
  // Secondary — moderate penalty
  secondary: [
    "docker", "redis", "graphql", "tailwind", "next.js", "nestjs",
    "aws", "gcp", "azure", "ci/cd", "jest", "testing", "jwt", "oauth",
    "socket.io", "websocket", "webpack", "vite",
  ],
  // Optional / nice-to-have — light penalty
  optional: [
    "kubernetes", "terraform", "kafka", "elasticsearch", "machine learning",
    "tensorflow", "pytorch", "flutter", "react native", "swift", "kotlin",
  ],
};

// ─────────────────────────────────────────────
// 2. ROLE PROFILES
// ─────────────────────────────────────────────

const ROLE_PROFILES = {
  frontend: {
    boostedKeywords: ["react", "css", "html", "typescript", "tailwind", "next.js", "state management", "ui", "ux", "accessibility"],
    sectionWeights: { keywords: 0.45, projects: 0.25, skills: 0.20, summary: 0.10 },
  },
  backend: {
    boostedKeywords: ["node", "express", "api", "rest api", "sql", "mongodb", "postgresql", "auth", "jwt", "docker", "microservices"],
    sectionWeights: { keywords: 0.45, projects: 0.25, skills: 0.20, summary: 0.10 },
  },
  fullstack: {
    boostedKeywords: ["react", "node", "express", "mongodb", "sql", "api", "jwt", "docker", "typescript"],
    sectionWeights: { keywords: 0.50, projects: 0.20, skills: 0.20, summary: 0.10 },
  },
  default: {
    boostedKeywords: [],
    sectionWeights: { keywords: 0.50, projects: 0.20, skills: 0.20, summary: 0.10 },
  },
};

// ─────────────────────────────────────────────
// 3. SIGNAL DICTIONARIES
// ─────────────────────────────────────────────

const PROJECT_COMPLEXITY_SIGNALS = [
  { pattern: /real.?time|socket\.io|websocket/i,         boost: 12, label: "real-time" },
  { pattern: /auth(?:entication)?|jwt|oauth|passport/i,  boost: 10, label: "auth" },
  { pattern: /microservice|distributed|message.?queue/i, boost: 14, label: "microservices" },
  { pattern: /multi.?role|admin|user.?role|rbac/i,       boost: 10, label: "multi-role" },
  { pattern: /payment|stripe|razorpay|paypal/i,          boost: 8,  label: "payments" },
  { pattern: /docker|deploy|heroku|vercel|render|aws/i,  boost: 8,  label: "deployment" },
  { pattern: /ci\/?cd|github.?action|jenkins/i,          boost: 8,  label: "CI/CD" },
  { pattern: /third.?party.?api|google.?api|twilio/i,    boost: 6,  label: "3rd-party API" },
  { pattern: /internship|production|professional/i,       boost: 12, label: "professional" },
  { pattern: /open.?source|npm.?package|published/i,     boost: 10, label: "open-source" },
];

const BEGINNER_PROJECT_SIGNALS = [
  /\btodo\b|\btask.?manager\b/i,
  /\bcalculator\b/i,
  /\bweather.?app\b/i,
  /\blocal.?storage\b/i,
  /\bcourse.?finder\b/i,
  /\bnotes.?app\b/i,
];

const ACTION_VERBS = [
  "built", "developed", "implemented", "designed", "architected",
  "integrated", "deployed", "optimised", "optimized", "engineered",
  "created", "led", "reduced", "increased", "improved", "migrated",
];

const GENERIC_PHRASES = [
  /seeking.{0,20}(role|opportunity|position)/i,
  /motivated\s+(graduate|professional|individual)/i,
  /passionate\s+about\s+(?:coding|programming|technology)/i,
  /hard.?working/i,
  /team\s+player/i,
  /quick\s+learner/i,
];

// ─────────────────────────────────────────────
// 4. HELPERS
// ─────────────────────────────────────────────

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

const countMatches = (text, patterns) =>
  patterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);

const detectComplexity = (text) => {
  let boost = 0;
  const detected = [];
  for (const signal of PROJECT_COMPLEXITY_SIGNALS) {
    if (signal.pattern.test(text)) {
      boost += signal.boost;
      detected.push(signal.label);
    }
  }
  return { boost: Math.min(boost, 40), detected };
};

const countBulletPoints = (text) =>
  (text.match(/^[\s]*[●•\-*]\s+.+/gm) || []).length;

const countActionVerbs = (text) => {
  const lower = text.toLowerCase();
  return ACTION_VERBS.filter((v) => lower.includes(v)).length;
};

const countGenericPhrases = (text) =>
  countMatches(text, GENERIC_PHRASES);

const techKeywordDensity = (text) => {
  const all = [...KEYWORD_TIERS.core, ...KEYWORD_TIERS.secondary];
  const lower = text.toLowerCase();
  return all.filter((k) => lower.includes(k)).length;
};

// ─────────────────────────────────────────────
// 5. SECTION SCORERS
// ─────────────────────────────────────────────

/**
 * scoreProjects
 * @param {string} text - raw project section text
 * @param {string[]} missingKeywords - JD keywords absent from resume
 * @param {object} opts - { role, experienceLevel }
 * @returns {number} 0-100
 */
function scoreProjects(text, missingKeywords = [], opts = {}) {
  if (!text || text.trim().length < 20) return 0;

  const { experienceLevel = "junior" } = opts;
  let score = 42; // calibrated base — slightly above simple threshold

  // ── Positive signals ──
  const lengthBoost = clamp(Math.floor(text.length / 120), 0, 10);
  score += lengthBoost;

  const bullets = clamp(countBulletPoints(text) * 2, 0, 10);
  score += bullets;

  const verbs = clamp(countActionVerbs(text) * 3, 0, 12);
  score += verbs;

  const techDensity = clamp(techKeywordDensity(text) * 2, 0, 14);
  score += techDensity;

  const { boost: complexityBoost } = detectComplexity(text);
  score += complexityBoost;

  // ── Negative signals ──
  const beginnerCount = BEGINNER_PROJECT_SIGNALS.filter((p) => p.test(text)).length;
  score -= beginnerCount * 12; // was 20 per project — softened to avoid destruction

  // Missing core skills in project context
  const coreMissing = missingKeywords.filter((k) =>
    KEYWORD_TIERS.core.includes(k.toLowerCase())
  ).length;
  const penaltyMultiplier = experienceLevel === "junior" ? 0.5 : 1.0;
  score -= clamp(coreMissing * 4 * penaltyMultiplier, 0, 16);

  // ── Hard floors ──
  const hasRealProject = !BEGINNER_PROJECT_SIGNALS.every((p) => p.test(text));
  const hasComplexity = complexityBoost > 0;

  if (hasComplexity)    score = Math.max(score, 55); // complexity signals → floor 55
  if (hasRealProject)   score = Math.max(score, 38); // any real project → floor 38
  if (text.length > 50) score = Math.max(score, 30); // non-empty → floor 30

  return clamp(Math.round(score), 0, 90); // cap at 90 — perfect scores are exceptional
}

/**
 * scoreSkills
 * @param {string} text - raw skills section text
 * @param {string[]} missingKeywords - JD keywords absent from resume
 * @param {object} opts - { role, experienceLevel }
 * @returns {number} 0-100
 */
function scoreSkills(text, missingKeywords = [], opts = {}) {
  if (!text || text.trim().length < 10) return 0;

  const { role = "default", experienceLevel = "junior" } = opts;
  const roleProfile = ROLE_PROFILES[role] || ROLE_PROFILES.default;
  const lower = text.toLowerCase();
  let score = 40; // calibrated base

  // ── Core stack presence ──
  const coreStack = ["html", "css", "javascript", "react", "node"];
  const corePresent = coreStack.filter((k) => lower.includes(k)).length;
  score += clamp(corePresent * 5, 0, 20);

  // ── Database breadth ──
  const hasSql = /sql|mysql|postgresql|postgres/i.test(text);
  const hasNoSql = /mongodb|mongoose|redis|dynamodb/i.test(text);
  if (hasSql && hasNoSql) score += 10;
  else if (hasSql || hasNoSql) score += 5;

  // ── DevOps / tooling ──
  if (/docker/i.test(text))          score += 6;
  if (/ci\/?cd|github.?action/i.test(text)) score += 5;
  if (/jest|mocha|vitest|testing/i.test(text)) score += 6;

  // ── Version control ──
  if (/git(?:hub|lab)?/i.test(text)) score += 5;

  // ── Role-boosted keywords ──
  const roleBoosted = roleProfile.boostedKeywords.filter((k) =>
    lower.includes(k.toLowerCase())
  ).length;
  score += clamp(roleBoosted * 3, 0, 12);

  // ── Negative signals ──
  // ML/AI libraries with no backing project
  const hasMLLibrary = /tensorflow|pytorch|scikit|keras|pandas|numpy/i.test(text);
  // We can't verify project context here — moderate penalty only
  if (hasMLLibrary) score -= 8;

  // Skill padding (>15 items listed — crude but reliable)
  const skillCount = (text.match(/[,\n|•●]/g) || []).length + 1;
  if (skillCount > 18) score -= 8;

  // Missing core skills from JD
  const penaltyMultiplier = experienceLevel === "junior" ? 0.5 : 1.0;
  const coreMissing = missingKeywords.filter((k) =>
    KEYWORD_TIERS.core.includes(k.toLowerCase())
  ).length;
  const secondaryMissing = missingKeywords.filter((k) =>
    KEYWORD_TIERS.secondary.includes(k.toLowerCase())
  ).length;
  score -= clamp(coreMissing * 5 * penaltyMultiplier * 0.6, 0, 20);
  score -= clamp(secondaryMissing * 2 * penaltyMultiplier * 0.6, 0, 10);

  // ── Hard floors ──
  if (corePresent >= 3) score = Math.max(score, 45); // solid web stack → floor 45
  if (corePresent >= 1) score = Math.max(score, 25); // any stack present → floor 25
  if (text.length > 20) score = Math.max(score, 20); // non-empty → floor 20

  return clamp(Math.round(score), 0, 90);
}

/**
 * scoreSummary
 * @param {string} text - raw summary/objective section text
 * @param {object} opts - { role, experienceLevel }
 * @returns {number} 0-100
 */
function scoreSummary(text, opts = {}) {
  if (!text || text.trim().length < 10) return 0;

  let score = 32; // calibrated base

  // ── Positive signals ──
  const lengthBoost = clamp(Math.floor(text.length / 80), 0, 10);
  score += lengthBoost;

  const techDensity = clamp(techKeywordDensity(text) * 4, 0, 20);
  score += techDensity;

  const verbs = clamp(countActionVerbs(text) * 4, 0, 12);
  score += verbs;

  // Mentions concrete achievement / project
  if (/built|developed|delivered|launched|shipped|led/i.test(text)) score += 10;

  // Mentions specific domain
  if (/full.?stack|backend|frontend|mobile|devops|cloud/i.test(text)) score += 8;

  // Value-focused narrative (not just "I want")
  if (/experience|expertise|specializ|proficient/i.test(text)) score += 6;

  // ── Negative signals ──
  const genericCount = countGenericPhrases(text);
  score -= genericCount * 10;

  if (text.length < 80) score -= 10; // too short to be meaningful

  // ── Hard floor: generic summaries still get a realistic minimum ──
  if (text.length > 20) score = Math.max(score, 45);

  return clamp(Math.round(score), 0, 80); // summary cap at 80
}

// ─────────────────────────────────────────────
// 6. KEYWORD IMPORTANCE-WEIGHTED MATCH SCORE
// ─────────────────────────────────────────────

/**
 * Computes a weighted keyword match percentage that penalises
 * missing core skills more than optional ones.
 * Also returns a keywordScoreDetails object for transparency.
 *
 * @param {string[]} matched - matched JD keywords
 * @param {string[]} missing - missing JD keywords
 * @returns {{ score: number, details: object }}
 */
function weightedKeywordScore(matched, missing) {
  const tier = (kw) => {
    const lc = kw.toLowerCase();
    if (KEYWORD_TIERS.core.includes(lc))      return "core";
    if (KEYWORD_TIERS.secondary.includes(lc)) return "secondary";
    return "optional";
  };

  const weight = (kw) => ({ core: 3, secondary: 2, optional: 1 }[tier(kw)]);

  // Tier breakdown for matched
  const coreMatched      = matched.filter((k) => tier(k) === "core").length;
  const secondaryMatched = matched.filter((k) => tier(k) === "secondary").length;
  const optionalMatched  = matched.filter((k) => tier(k) === "optional").length;

  // Penalty: missing core/secondary
  const coreMissingCount      = missing.filter((k) => tier(k) === "core").length;
  const secondaryMissingCount = missing.filter((k) => tier(k) === "secondary").length;
  const penaltyApplied = clamp(coreMissingCount * 8 + secondaryMissingCount * 3, 0, 30);

  if (!matched.length && !missing.length) {
    return {
      score: 0,
      details: {
        rawMatchPercentage: 0,
        coreMatched: 0, secondaryMatched: 0, optionalMatched: 0, penaltyApplied: 0,
      },
    };
  }

  const total = matched.length + missing.length;

  // A) Raw match — simple count ratio (shown to users for transparency)
  const rawMatchPercentage = Math.round((matched.length / total) * 100);

  // B) Weighted score — tier-weighted ratio minus penalty, with a floor of 40
  const totalWeight   = [...matched, ...missing].reduce((s, k) => s + weight(k), 0);
  const matchedWeight = matched.reduce((s, k) => s + weight(k), 0);
  const weightedRaw   = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
  const weightedScore = clamp(Math.max(40, weightedRaw - penaltyApplied), 0, 100);

  return {
    score: weightedScore,          // used by ATS formula
    details: {
      rawMatchPercentage,          // transparent count-based %
      coreMatched, secondaryMatched, optionalMatched, penaltyApplied,
    },
  };
}

// ─────────────────────────────────────────────
// 7. CONFIDENCE SIGNAL
// ─────────────────────────────────────────────

/**
 * Determines a human-readable confidence level for the ATS result.
 *
 * @param {{ keywordPct: number, projectsScore: number, skillsScore: number }} scores
 * @returns {"high" | "medium" | "low"}
 */
function computeConfidence({ keywordPct, projectsScore, skillsScore }) {
  if (keywordPct >= 70 && projectsScore >= 70 && skillsScore >= 65) return "high";
  if (keywordPct >= 40 && projectsScore >= 45 && skillsScore >= 40)  return "medium";
  return "low";
}

// ─────────────────────────────────────────────
// 8. AI-FEEDBACK ALIGNMENT
// ─────────────────────────────────────────────

const AI_STRONG_SIGNALS = [
  /\bstrong\b/i, /\badvanced\b/i, /\bhigh.?complexity\b/i,
  /\breal.?time\b/i, /\bwell.?built\b/i, /\bimpressive\b/i,
  /\bproduction.?ready\b/i, /\bexceptional\b/i,
];

const AI_WEAK_SIGNALS = [
  /\bweak\b/i, /\bpoor\b/i, /\bsimplistic\b/i,
  /\blacks?\b/i, /\bminimal\b/i, /\bno\s+projects?\b/i,
];

/**
 * Adjusts projectsScore to align with AI qualitative feedback.
 * Prevents score from contradicting the AI narrative.
 *
 * @param {number} projectsScore
 * @param {string} aiFeedbackText - concatenated AI feedback strings
 * @returns {number} adjusted projectsScore
 */
function alignWithAiFeedback(projectsScore, aiFeedbackText = "") {
  if (!aiFeedbackText) return projectsScore;

  const strongCount = AI_STRONG_SIGNALS.filter((p) => p.test(aiFeedbackText)).length;
  const weakCount   = AI_WEAK_SIGNALS.filter((p) => p.test(aiFeedbackText)).length;

  if (strongCount >= 2) {
    // AI is clearly positive — ensure project score reflects that
    return Math.max(projectsScore, 65);
  }
  if (weakCount >= 2 && projectsScore > 55) {
    // AI is clearly negative — allow a moderate pull-down (max -10)
    return Math.max(projectsScore - 10, 40);
  }

  return projectsScore;
}

// ─────────────────────────────────────────────
// 9. MAIN SCORER
// ─────────────────────────────────────────────

/**
 * computeAtsScore
 *
 * @param {object} params
 * @param {object} params.sections           - { summary, projects, skills }
 * @param {string[]} params.matchedKeywords  - JD keywords found in resume
 * @param {string[]} params.missingKeywords  - JD keywords absent from resume
 * @param {string}   params.role             - "frontend" | "backend" | "fullstack" | "default"
 * @param {string}   params.experienceLevel  - "junior" | "mid" | "senior"
 * @param {string}   params.aiFeedbackText   - concatenated AI feedback for alignment
 *
 * @returns {{ atsScore, breakdown, keywordScoreDetails, confidence }}
 */
function computeAtsScore({
  sections = {},
  matchedKeywords = [],
  missingKeywords = [],
  role = "default",
  experienceLevel = "junior",
  aiFeedbackText = "",
} = {}) {
  const opts = { role, experienceLevel };
  const roleProfile = ROLE_PROFILES[role] || ROLE_PROFILES.default;
  const w = roleProfile.sectionWeights;

  // ── Section scores ──
  let projectsScore    = scoreProjects(sections.projects || "", missingKeywords, opts);
  const skillsScore    = scoreSkills(sections.skills    || "", missingKeywords, opts);
  const summaryScore   = scoreSummary(sections.summary  || "", opts);

  // ── Keyword score (with tier breakdown) ──
  const { score: keywordPct, details: keywordScoreDetails } =
    weightedKeywordScore(matchedKeywords, missingKeywords);

  // ── AI-alignment adjustment ──
  projectsScore = alignWithAiFeedback(projectsScore, aiFeedbackText);

  // ── Weighted ATS ──
  const raw =
    keywordPct    * w.keywords  +
    projectsScore * w.projects  +
    skillsScore   * w.skills    +
    summaryScore  * w.summary;

  let atsScore = Math.round(raw);

  // ── Global hard floors ──
  const hasRealProject   = (sections.projects || "").trim().length > 50;
  const hasRelevantStack = skillsScore >= 40;

  if (hasRealProject && hasRelevantStack) atsScore = Math.max(atsScore, 38);
  if (hasRealProject)                     atsScore = Math.max(atsScore, 30);
  if (Object.values(sections).some((s) => (s || "").trim().length > 20))
                                          atsScore = Math.max(atsScore, 20);

  // ── Confidence signal ──
  const confidence = computeConfidence({ keywordPct, projectsScore, skillsScore });

  return {
    atsScore: clamp(atsScore, 0, 100),
    breakdown: {
      keywordPercentage:    keywordScoreDetails.rawMatchPercentage, // raw % shown to user
      weightedKeywordScore: keywordPct,                             // tier-adjusted, used in ATS
      projectsScore,
      skillsScore,
      summaryScore,
    },
    keywordScoreDetails,
    confidence,
  };
}

module.exports = {
  computeAtsScore,
  scoreProjects,
  scoreSkills,
  scoreSummary,
  weightedKeywordScore,
  computeConfidence,
  alignWithAiFeedback,
};
