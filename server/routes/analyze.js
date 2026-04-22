const { generateFeedback } = require("../services/aiFeedback");
const { extractKeywordsFromJD } = require("../services/jdParser");
const { computeAtsScore } = require("../services/atsScorer");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const path = require("path");

const { extractTextFromPDF } = require("../services/pdfParser");
const { cleanResumeText } = require("../services/textCleaner");

const router = express.Router();

/* =========================
   🔧 FIX: Ensure uploads folder exists
========================= */
const uploadPath = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

/* =========================
   Multer Storage
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath); // ✅ use ensured path
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

/* =========================
   Safe JSON Parse
========================= */
const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

/* =========================
   POST /api/analyze
========================= */
router.post("/", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Please send a PDF as 'resume'.",
      });
    }

    // 1. Extract raw text
    const rawText = await extractTextFromPDF(req.file.path);

    // 2. Delete file AFTER processing
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Failed to delete file:", err);
    });

    // 3. Clean text
    const cleanedText = cleanResumeText(rawText);

    // 4. Extract JD Keywords
    const jobDescription = req.body.jobDescription || "";
    const jdKeywords = extractKeywordsFromJD(jobDescription);

    // 5. AI Call
    console.log("Starting AI analysis...");
    const aiResponseRaw = await generateFeedback({
      resumeText: cleanedText,
      jdKeywords: jdKeywords,
    });

    const aiResponse = safeParse(aiResponseRaw);

    if (!aiResponse || !aiResponse.success) {
      return res.status(500).json({
        success: false,
        error: "AI analysis failed to generate a valid result.",
        debug: aiResponseRaw,
      });
    }

    // 6. ATS Scoring
    const role = (req.body.role || "default").toLowerCase();
    const experienceLevel = (req.body.experienceLevel || "junior").toLowerCase();

    const fb = aiResponse.aiFeedback || {};
    const aiFeedbackText = [
      fb.overall_feedback || "",
      ...(fb.strengths || []),
      ...(fb.improvements || []),
    ].join(" ");

    const { atsScore, breakdown, keywordScoreDetails, confidence } = computeAtsScore({
      sections: aiResponse.sections,
      matchedKeywords: aiResponse.keywordAnalysis?.matched || [],
      missingKeywords: aiResponse.keywordAnalysis?.missing || [],
      role,
      experienceLevel,
      aiFeedbackText,
    });

    aiResponse.atsScore = atsScore;
    aiResponse.atsBreakdown = {
      keywordPercentage: breakdown.keywordPercentage,
      projectsScore: breakdown.projectsScore,
      skillsScore: breakdown.skillsScore,
      summaryScore: breakdown.summaryScore,
    };
    aiResponse.keywordScoreDetails = keywordScoreDetails;
    aiResponse.confidence = confidence;

    // 7. Send response
    res.json(aiResponse);

  } catch (err) {
    console.error("Error in /api/analyze:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
});

module.exports = router;