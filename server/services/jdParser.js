const TECH_KEYWORDS = [
  "react",
  "node.js",
  "node js",
  "mongodb",
  "docker",
  "typescript",
  "javascript",
  "python",
  "java",
  "html",
  "css",
  "tailwind",
  "rest api",
  "api",
  "express",
  "sql",
  "mysql",
  "machine learning",
  "tensorflow",
  "pytorch"
];

const normalize = (text) => {
  return text.toLowerCase();
};

const extractKeywordsFromJD = (jdText) => {
  if (!jdText) return [];

  const normalizedJD = normalize(jdText);

  const matchedKeywords = TECH_KEYWORDS.filter((keyword) => {
    return normalizedJD.includes(keyword);
  });

  return matchedKeywords;
};

module.exports = { extractKeywordsFromJD };