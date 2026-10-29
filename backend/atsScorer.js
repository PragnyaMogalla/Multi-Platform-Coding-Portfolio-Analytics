// backend/atsScorer.js

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have',
  'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into',
  'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d',
  'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s',
  'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
  'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  'will', 'shall', 'may', 'might', 'must', 'experience', 'responsibilities', 'requirements', 'qualification',
  'skills', 'looking', 'work', 'working', 'ability', 'knowledge', 'years', 'plus', 'including', 'role',
  'team', 'opportunity', 'candidate', 'position', 'job', 'ideal', 'strong', 'good', 'well', 'etc'
]);

const ACTION_VERBS = [
  'developed', 'engineered', 'architected', 'implemented', 'optimized', 'deployed',
  'integrated', 'designed', 'automated', 'spearheaded', 'built', 'reduced', 'increased',
  'delivered', 'scaled', 'mentored', 'analyzed', 'created', 'maintained', 'formulated'
];

const STANDARD_SECTIONS = [
  { name: 'Education', test: /education|academic|degree|b\.?tech|university|college/i },
  { name: 'Experience / Work History', test: /experience|employment|work history|internship/i },
  { name: 'Technical Skills', test: /skills|technologies|proficiencies|competencies|languages/i },
  { name: 'Projects', test: /projects|portfolio|personal projects|open source/i }
];

export const ROLE_PRESETS = {
  'frontend': {
    title: 'Frontend / UI Engineer',
    keywords: ['react', 'javascript', 'typescript', 'html', 'css', 'redux', 'tailwind', 'next.js', 'rest api', 'ui', 'ux', 'git']
  },
  'backend': {
    title: 'Backend / Systems Engineer',
    keywords: ['node.js', 'express', 'python', 'java', 'c++', 'sql', 'postgresql', 'mongodb', 'docker', 'rest api', 'microservices', 'redis', 'git']
  },
  'fullstack': {
    title: 'Full Stack Software Engineer',
    keywords: ['javascript', 'typescript', 'react', 'node.js', 'sql', 'nosql', 'docker', 'aws', 'rest api', 'git', 'ci/cd']
  },
  'devops': {
    title: 'DevOps & Cloud Engineer',
    keywords: ['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'linux', 'bash', 'git', 'terraform', 'monitoring']
  },
  'data_ml': {
    title: 'Data Engineer / Applied ML',
    keywords: ['python', 'sql', 'pandas', 'numpy', 'machine learning', 'tensorflow', 'pytorch', 'aws', 'pipelines', 'git']
  }
};

function extractSignificantTerms(text) {
  if (!text) return { termFreq: new Map(), termList: [] };

  const clean = text
    .toLowerCase()
    .replace(/[^\w\s\+\#\.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const termFreq = new Map();

  for (const w of words) {
    termFreq.set(w, (termFreq.get(w) || 0) + 1);
  }

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    termFreq.set(bigram, (termFreq.get(bigram) || 0) + 1.5);
  }

  return { termFreq, termList: Array.from(termFreq.keys()) };
}

function calculateCosineSimilarity(freqA, freqB) {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, weight] of freqA.entries()) {
    magA += weight * weight;
    if (freqB.has(term)) {
      dotProduct += weight * freqB.get(term);
    }
  }

  for (const [, weight] of freqB.entries()) {
    magB += weight * weight;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function auditResumeAgainstJob({ resumeText, jobDescription, targetRole, candidateUser }) {
  const resume = (resumeText || '').trim();
  const jd = (jobDescription || '').trim();

  let effectiveJd = jd;
  if (!effectiveJd && targetRole) {
    const matchKey = Object.keys(ROLE_PRESETS).find(k => 
      ROLE_PRESETS[k].title.toLowerCase().includes(targetRole.toLowerCase()) ||
      targetRole.toLowerCase().includes(k)
    );
    if (matchKey) {
      effectiveJd = ROLE_PRESETS[matchKey].keywords.join(' ') + ' software engineering data structures algorithms';
    }
  }
  if (!effectiveJd) {
    effectiveJd = 'software engineer data structures algorithms git github problem solving unit testing full stack';
  }

  const resumeTokens = extractSignificantTerms(resume);
  const jdTokens = extractSignificantTerms(effectiveJd);

  const cosineSim = calculateCosineSimilarity(resumeTokens.termFreq, jdTokens.termFreq);
  const vectorScore = Math.min(100, Math.round(cosineSim * 100));

  const targetTerms = jdTokens.termList.filter((t) => !t.includes(' '));
  const matchedKeywords = [];
  const missingKeywords = [];

  targetTerms.forEach((term) => {
    if (resumeTokens.termFreq.has(term)) {
      matchedKeywords.push(term);
    } else {
      missingKeywords.push(term);
    }
  });

  const overlapPct = targetTerms.length > 0 
    ? Math.round((matchedKeywords.length / targetTerms.length) * 100)
    : 85;

  let foundSections = 0;
  STANDARD_SECTIONS.forEach((sec) => {
    if (sec.test.test(resume)) foundSections++;
  });
  const structureScore = Math.round((foundSections / STANDARD_SECTIONS.length) * 100);

  const foundVerbs = ACTION_VERBS.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(resume));
  const verbScore = Math.min(100, Math.round((foundVerbs.length / 4) * 100));

  const numbersFound = (resume.match(/\b\d+(\.\d+)?%?\b/g) || []).length;
  const quantScore = numbersFound >= 6 ? 100 : numbersFound >= 3 ? 80 : 50;

  // Blended ATS Score
  let overallScore = Math.round(
    0.45 * overlapPct +
    0.25 * vectorScore +
    0.15 * structureScore +
    0.10 * verbScore +
    0.05 * quantScore
  );

  if (resume.length > 50 && jd.length > 50 && (resume.includes(jd.slice(0, 50)) || jd.includes(resume.slice(0, 50)))) {
    overallScore = 98;
  }
  overallScore = Math.min(100, Math.max(20, overallScore));

  const deltaRecommendations = [];
  const metrics = candidateUser?.latestScore;
  const lcSummary = metrics?.platformSummaries?.find((p) => p.platform === 'leetcode');
  const ghSummary = metrics?.platformSummaries?.find((p) => p.platform === 'github');
  const cfSummary = metrics?.platformSummaries?.find((p) => p.platform === 'codeforces');

  if (lcSummary?.problemsSolved > 0 && !/leetcode/i.test(resume)) {
    deltaRecommendations.push({
      action: `Include verified LeetCode solves (${lcSummary.problemsSolved} AC)`,
      snippetToAdd: `* LeetCode: ${lcSummary.problemsSolved} Solved (${metrics.difficultyProfile?.totals?.medium || 0} Medium, ${metrics.difficultyProfile?.totals?.hard || 0} Hard) | Profile: https://leetcode.com/${candidateUser.username}`,
      scoreLift: 12
    });
  }

  if (ghSummary?.problemsSolved > 0 && !/github\.com/i.test(resume)) {
    deltaRecommendations.push({
      action: `Include verified GitHub footprint (${ghSummary.problemsSolved} Repositories)`,
      snippetToAdd: `* GitHub: ${ghSummary.problemsSolved} Public Repositories | Collaborations & PRs: ${metrics.rbuPlacement?.breakdown?.github?.collaborations || 0}`,
      scoreLift: 10
    });
  }

  if (cfSummary?.platformScore && !/codeforces/i.test(resume)) {
    deltaRecommendations.push({
      action: `Add Codeforces Competitive Rating (Index: ${cfSummary.platformScore}/100)`,
      snippetToAdd: `* Codeforces: Verified Competitive Rating ${Math.round(cfSummary.platformScore * 16.48)} | Active Contest Participant`,
      scoreLift: 8
    });
  }

  const exp = candidateUser?.institutionalExperience || {};
  if (exp.industryProjectsCount > 0 && !/industry|sih|smart india/i.test(resume)) {
    deltaRecommendations.push({
      action: `Document verified SIH / Industry Problem Statement Projects (${exp.industryProjectsCount} Projects)`,
      snippetToAdd: `* Industry Problem Statements: Engineered ${exp.industryProjectsCount} production-grade solutions following SIH & industry-mentored specifications`,
      scoreLift: 8
    });
  }

  const verifiedLangs = (metrics?.languageAnalysis || []).map((l) => l.language.toLowerCase());
  const recoverable = missingKeywords.filter((k) => verifiedLangs.includes(k));
  if (recoverable.length > 0) {
    deltaRecommendations.push({
      action: `Add verified programming languages you already code in: ${recoverable.slice(0, 4).join(', ')}`,
      snippetToAdd: `* Programming Languages: ${recoverable.slice(0, 4).join(', ')}`,
      scoreLift: 10
    });
  }

  const totalLift = deltaRecommendations.reduce((sum, r) => sum + r.scoreLift, 0);
  const potentialScore = Math.min(100, overallScore + totalLift);

  return {
    roleTitle: targetRole || 'Custom Specification',
    currentAtsScore: overallScore,
    potentialScore,
    totalLift,
    vectorScore,
    keywordScore: overlapPct,
    structureScore,
    verbScore,
    quantScore,
    matchedKeywords: matchedKeywords.slice(0, 15),
    missingKeywords: missingKeywords.slice(0, 15),
    deltaRecommendations
  };
}