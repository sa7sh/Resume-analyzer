const cleanResumeText = (text) => {
  return text
    // collapse multiple spaces on the same line (but NOT newlines)
    .replace(/[^\S\n]+/g, " ")

    // remove trailing spaces at end of each line
    .replace(/ +\n/g, "\n")

    // collapse more than 2 consecutive newlines into 2
    .replace(/\n{3,}/g, "\n\n")

    // trim overall
    .trim();
};

module.exports = { cleanResumeText };
