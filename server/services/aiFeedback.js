const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateFeedback = async ({ resumeText, jdKeywords }) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest"
  });

  const prompt = `
You are a strict but fair technical recruiter with 10+ years of experience at top tech companies.
Analyze this resume and return ONLY a valid JSON object. No extra text, no markdown, no backticks.

Scoring rules you MUST follow:

PROJECTS SCORE (0-100):
Start from 40 and apply additions/deductions.
HARD FLOOR: Minimum score is 30 if at least one non-tutorial project exists. You MUST NOT go below 30 in this case.
Cap at 100, floor at 0.

Deduct points:
- Tutorial-level projects (Todo, Calculator, Weather app, LocalStorage tasks, Course Finder with public API): -20 each
- No metrics or numbers in descriptions: -8 per project
- Generic descriptions with no architectural detail: -8 per project
- No real-world problem being solved: -8 per project
- No mention of deployment or live link: -4 per project

Add points:
- Microservices or distributed architecture: +20
- Real-time features (Socket.io, WebSockets): +15
- Authentication and security implementation: +10
- Third-party API integrations (beyond simple public APIs): +8
- Mobile app development (React Native, Flutter): +15
- Production-level complexity (multiple services, apps, or user roles): +20
- Open source contributions or published npm packages: +20
- Internship or professional project: +25

SKILLS SCORE (0-100):
Start from 40 and apply additions/deductions.
HARD FLOOR: Never return 0 if core web stack is present. Minimum score is 20 if HTML/CSS/JS/React/Node are present. You MUST enforce this floor before returning.
Cap at 100, floor at 0.

Deduct points:
- ML/AI libraries listed with no ML/AI project to back them up: -20
- More than 15 skills listed with no evidence (looks like padding): -10
- Skills listed that contradict project experience: -10

Add points:
- Core web stack present (HTML/CSS/JS/React/Node): +20
- Database knowledge (SQL + NoSQL both): +15
- Version control (Git/GitHub): +10
- DevOps tools (Docker, CI/CD): +15
- Testing frameworks (Jest, Mocha): +10
- Mobile development (React Native, Expo): +10

SUMMARY SCORE (0-100):
Start from 30 and apply additions/deductions.
Cap at 100, floor at 0.

Deduct points:
- Generic objective statement ("seeking entry level role", "motivated graduate"): -20
- No mention of specific tech stack: -15
- No mention of key achievement or project: -15

Add points:
- Written as a professional profile focused on value delivered: +30
- Mentions specific tech stack or domain expertise: +20
- Mentions a concrete achievement or project: +20
- Tailored to a specific role type: +10

KEYWORD SCORE:
Percentage of jdKeywords found anywhere in the resume text (case insensitive).

ATS SCORE:
Weighted average using these weights:
- Keywords: 30%
- Projects: 35%
- Skills: 20%
- Summary: 15%

HARD FLOORS for ATS SCORE (you MUST enforce these):
- A candidate with at least one real non-tutorial project and a relevant tech stack MUST score a minimum of 35.
- Never return an ATS score below 25 unless the resume is completely irrelevant to the JD.
- Apply all floors AFTER computing the weighted average, then clamp up if needed.

Tone rule for aiFeedback:
Be strict and honest but constructive. Point out weaknesses clearly but always
explain HOW to fix them. Do not be dismissive — acknowledge genuine strengths.
A candidate with a full-stack internship project deserves recognition even if
other parts of the resume are weak.

Resume Text:
${resumeText}

Job Description Keywords to match:
${jdKeywords.join(", ")}

Return this exact JSON structure:
{
  "success": true,
  "sections": {
    "summary": "extracted summary text",
    "projects": "extracted projects text",
    "skills": "extracted skills text",
    "education": "extracted education text"
  },
  "jdKeywords": [],
  "keywordAnalysis": {
    "matched": [],
    "missing": [],
    "matchPercentage": 0
  },
  "atsScore": 0,
  "atsBreakdown": {
    "keywordPercentage": 0,
    "projectsScore": 0,
    "skillsScore": 0,
    "summaryScore": 0
  },
  "aiFeedback": {
    "overall_feedback": "",
    "strengths": [],
    "improvements": [],
    "missing_skills_advice": ""
  }
}
`;

  let lastError;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Calling Gemini... (Attempt ${attempt}/${maxRetries})`);
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      // Clean up potential markdown wrapper
      const cleanedText = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      
      return cleanedText;
    } catch (error) {
      lastError = error;
      const isRetryable = error.message.includes("503") || error.message.includes("429");
      
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ Gemini ERROR (Retryable): ${error.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      
      console.error("❌ Gemini ERROR:", error.message);
      break;
    }
  }

  // Fallback if all attempts fail
  return JSON.stringify({
    success: false,
    error: "AI analysis failed after multiple attempts."
  });
};

module.exports = { generateFeedback };