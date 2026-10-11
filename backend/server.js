import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5050;

/* ============================================================================
   TOPIC TAXONOMY & NORMALIZATION
   ========================================================================== */
const TOPIC_TAXONOMY = {
  'Arrays & Strings': ['array', 'arrays', 'string', 'strings', 'two-pointer', 'two pointers', 'sliding window', 'implementation'],
  'Hashing': ['hash table', 'hashing', 'hash-map', 'hashmap'],
  'Sorting & Searching': ['sorting', 'binary search', 'sortings', 'ternary search'],
  'Linked Lists': ['linked list', 'linked-list'],
  'Stacks & Queues': ['stack', 'queue', 'monotonic stack', 'deque'],
  'Trees': ['tree', 'binary tree', 'binary search tree', 'trees', 'trie', 'segment tree', 'fenwick tree', 'binary indexed tree'],
  'Graphs': ['graph', 'graphs', 'graph traversal', 'topological sort', 'bfs', 'dfs and similar', 'shortest paths', 'union find', 'dsu'],
  'Dynamic Programming': ['dynamic programming', 'dp', 'memoization'],
  'Greedy': ['greedy', 'greedy algorithms'],
  'Backtracking': ['backtracking', 'recursion', 'brute force'],
  'Math & Number Theory': ['math', 'number theory', 'combinatorics', 'geometry', 'probability and statistics', 'bitmask', 'bit manipulation'],
  'Divide & Conquer': ['divide and conquer', 'd&c'],
  'Design & OOP': ['design', 'object-oriented', 'data structures'],
  'Strings & Pattern Matching': ['string matching', 'kmp', 'z-function', 'suffix array'],
  'Simulation': ['simulation', 'constructive algorithms', 'interactive', 'brainteaser']
};
const ALL_TOPICS = Object.keys(TOPIC_TAXONOMY);
const HIGH_STAKES_TOPICS = new Set(['Dynamic Programming', 'Graphs', 'Trees', 'Backtracking', 'Design & OOP']);

const RAW_TO_CANONICAL = new Map();
for (const [canonical, aliases] of Object.entries(TOPIC_TAXONOMY)) {
  RAW_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) RAW_TO_CANONICAL.set(alias.toLowerCase(), canonical);
}
function toCanonicalTopic(rawTag) {
  return rawTag ? RAW_TO_CANONICAL.get(String(rawTag).trim().toLowerCase()) || null : null;
}

// Graph Difficulty Weights: Easy = 1, Medium = 2, Hard = 3
const GRAPH_DIFFICULTY_WEIGHT = { easy: 1, medium: 2, hard: 3 };

function bumpTopic(topicCounts, canonicalTopic, difficultyLevel, count = 1) {
  if (!canonicalTopic) return;
  const weight = (GRAPH_DIFFICULTY_WEIGHT[difficultyLevel] || 1) * count;
  topicCounts[canonicalTopic] = (topicCounts[canonicalTopic] || 0) + weight;
}

// Drops unavailable components and renormalizes score out of 100
function scoreComponents(components) {
  let achieved = 0, maxAvailable = 0;
  const breakdown = [];
  for (const c of components) {
    const value = c.compute();
    if (value === null || value === undefined) {
      breakdown.push({ key: c.key, label: c.label, max: c.max, available: false });
      continue;
    }
    const points = Math.max(0, Math.min(c.max, value));
    achieved += points;
    maxAvailable += c.max;
    breakdown.push({ key: c.key, label: c.label, max: c.max, points: Math.round(points * 100) / 100, available: true });
  }
  const score = maxAvailable > 0 ? Math.round((achieved / maxAvailable) * 1000) / 10 : null;
  return { score, breakdown, achieved: Math.round(achieved * 100) / 100, maxAvailable };
}

/* ============================================================================
   PROFILE URL / USERNAME PARSING
   ========================================================================== */
const URL_PATTERNS = [
  { platform: 'leetcode', regex: /leetcode\.com\/(?:u\/)?([a-zA-Z0-9_-]+)/i },
  { platform: 'codeforces', regex: /codeforces\.com\/profile\/([a-zA-Z0-9_-]+)/i },
  { platform: 'codechef', regex: /codechef\.com\/users\/([a-zA-Z0-9_-]+)/i },
  { platform: 'hackerrank', regex: /hackerrank\.com\/(?:profile\/)?([a-zA-Z0-9_-]+)/i }
];

function parseProfileInput(platformKey, rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return { username: trimmed.replace(/\/+$/, '') };
  const match = URL_PATTERNS.find((p) => p.platform === platformKey);
  const found = match && trimmed.match(match.regex);
  if (found) return { username: found[1] };
  for (const p of URL_PATTERNS) {
    const anyFound = trimmed.match(p.regex);
    if (anyFound) return { username: anyFound[1] };
  }
  throw new Error(`Could not parse username from "${rawInput}"`);
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };

/* ============================================================================
   CODEFORCES (Total: 85 pts)
   ========================================================================== */
async function fetchCodeforces(username) {
  const base = 'https://codeforces.com/api';
  const out = { platform: 'codeforces', available: false, username };
  try {
    const [infoRes, statusRes, ratingRes] = await Promise.all([
      axios.get(`${base}/user.info`, { params: { handles: username } }),
      axios.get(`${base}/user.status`, { params: { handle: username, from: 1, count: 10000 } }),
      axios.get(`${base}/user.rating`, { params: { handle: username } }).catch(() => ({ data: { result: [] } }))
    ]);
    const info = infoRes.data.result[0];
    const contests = ratingRes.data.result || [];

    const solvedSet = new Set();
    const languageCounts = {};
    const topicCounts = {};
    let weightedProblems = 0;
    const activeMonths = new Set();
    const graphBuckets = { easy: 0, medium: 0, hard: 0 };

    for (const sub of statusRes.data.result || []) {
      if (sub.verdict !== 'OK') continue;
      const key = `${sub.problem.contestId}-${sub.problem.index}`;
      if (solvedSet.has(key)) continue;
      solvedSet.add(key);
      languageCounts[sub.programmingLanguage] = (languageCounts[sub.programmingLanguage] || 0) + 1;
      activeMonths.add(new Date(sub.creationTimeSeconds * 1000).toISOString().slice(0, 7));

      const r = sub.problem.rating || 0;
      let level = 'easy';
      if (r) {
        if (r < 1200) { weightedProblems += 1; level = 'easy'; graphBuckets.easy++; }
        else if (r < 1600) { weightedProblems += 2; level = 'medium'; graphBuckets.medium++; }
        else if (r < 2000) { weightedProblems += 3; level = 'medium'; graphBuckets.medium++; }
        else if (r < 2400) { weightedProblems += 4; level = 'hard'; graphBuckets.hard++; }
        else { weightedProblems += 5; level = 'hard'; graphBuckets.hard++; }
      }
      for (const tag of sub.problem.tags || []) {
        bumpTopic(topicCounts, toCanonicalTopic(tag), level);
      }
    }

    const now = Date.now();
    const activeMonthsLast12 = [...activeMonths].filter((m) => {
      const diffDays = (now - new Date(m + '-01').getTime()) / 86400000;
      return diffDays <= 365;
    }).length;

    out.available = true;
    out.rating = info?.rating ?? null;
    out.maxRating = info?.maxRating ?? null;
    out.problemsSolved = solvedSet.size;
    out.weightedProblems = weightedProblems;
    out.contestsCount = contests.length;
    out.activeMonthsLast12 = activeMonthsLast12;
    out.topicCounts = topicCounts;
    out.languageCounts = languageCounts;
    out.graphBuckets = graphBuckets;
  } catch (err) {
    out.error = `Failed to fetch Codeforces data: ${err.message}`;
  }
  return out;
}

function scoreCodeforces(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'rating', label: 'Rating / competitive rank', max: 40,
      compute: () => {
        if (d.rating == null) return null;
        const currentScore = (d.rating / 1648) * 40;
        if (d.maxRating == null) return currentScore;
        const maxScore = (d.maxRating / 1648) * 40;
        return 0.7 * currentScore + 0.3 * maxScore;
      }
    },
    {
      key: 'problems', label: 'Problem-solving activity', max: 25,
      compute: () => (d.weightedProblems != null ? (d.weightedProblems / 375) * 25 : null)
    },
    {
      key: 'contests', label: 'Contest participation', max: 15,
      compute: () => (d.contestsCount != null ? (d.contestsCount / 50) * 15 : null)
    },
    {
      key: 'consistency', label: 'Profile consistency', max: 5,
      compute: () => (d.activeMonthsLast12 != null ? (d.activeMonthsLast12 / 12) * 5 : null)
    }
  ]);
}

/* ============================================================================
   LEETCODE (Total: 100 pts)
   ========================================================================== */
async function fetchLeetCode(username) {
  const out = { platform: 'leetcode', available: false, username };
  const query = `query userProfile($username: String!) {
    matchedUser(username: $username) {
      submitStatsGlobal { acSubmissionNum { difficulty count } }
      languageProblemCount { languageName problemsSolved }
      tagProblemCounts { advanced { tagName problemsSolved } intermediate { tagName problemsSolved } fundamental { tagName problemsSolved } }
      badges { id }
      submissionCalendar
    }
    userContestRanking(username: $username) { rating attendedContestsCount }
  }`;
  try {
    const { data } = await axios.post('https://leetcode.com/graphql', { query, variables: { username } }, {
      headers: { 'Content-Type': 'application/json', Referer: `https://leetcode.com/${username}/`, ...UA }
    });
    const user = data?.data?.matchedUser;
    if (!user) { out.error = 'Username not found on LeetCode'; return out; }
    const contest = data?.data?.userContestRanking;

    const graphBuckets = { easy: 0, medium: 0, hard: 0 };
    for (const row of user.submitStatsGlobal?.acSubmissionNum || []) {
      if (row.difficulty === 'Easy') graphBuckets.easy = row.count;
      if (row.difficulty === 'Medium') graphBuckets.medium = row.count;
      if (row.difficulty === 'Hard') graphBuckets.hard = row.count;
    }
    const weightedSolving = graphBuckets.easy * 1 + graphBuckets.medium * 2 + graphBuckets.hard * 4;

    const topicCounts = {};
    const tagGroups = user.tagProblemCounts || {};
    for (const group of ['fundamental', 'intermediate', 'advanced']) {
      for (const tag of tagGroups[group] || []) {
        const canonical = toCanonicalTopic(tag.tagName);
        if (!canonical) continue;
        const level = group === 'fundamental' ? 'easy' : group === 'intermediate' ? 'medium' : 'hard';
        bumpTopic(topicCounts, canonical, level, tag.problemsSolved);
      }
    }
    const languageCounts = {};
    for (const lang of user.languageProblemCount || []) {
      languageCounts[lang.languageName] = lang.problemsSolved;
    }

    let activeDays = 0;
    try {
      const cal = JSON.parse(user.submissionCalendar || '{}');
      const now = Date.now() / 1000;
      activeDays = Object.entries(cal).filter(([ts]) => now - Number(ts) <= 365 * 86400).length;
    } catch { /* optional calendar data */ }

    out.available = true;
    out.rating = contest?.rating ? Math.round(contest.rating) : null;
    out.contestsAttended = contest?.attendedContestsCount ?? null;
    out.problemsSolved = graphBuckets.easy + graphBuckets.medium + graphBuckets.hard;
    out.weightedSolving = weightedSolving;
    out.topicsCovered = Object.keys(tagGroups).length ? new Set([...(tagGroups.fundamental || []), ...(tagGroups.intermediate || []), ...(tagGroups.advanced || [])].map((t) => t.tagName)).size : null;
    out.languagesUsed = Object.keys(languageCounts).length;
    out.badgesCount = (user.badges || []).length;
    out.activeDaysLast12Months = activeDays;
    out.topicCounts = topicCounts;
    out.languageCounts = languageCounts;
    out.graphBuckets = graphBuckets;
  } catch (err) {
    out.error = `Failed to fetch LeetCode data: ${err.message}`;
  }
  return out;
}

function scoreLeetCode(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    { key: 'problems', label: 'Problems solved', max: 20, compute: () => (d.problemsSolved != null ? (d.problemsSolved / 300) * 20 : null) },
    { key: 'difficulty', label: 'Difficulty-weighted solving', max: 30, compute: () => (d.weightedSolving != null ? (d.weightedSolving / 700) * 30 : null) },
    {
      key: 'contest', label: 'Contest rating and ranking', max: 30,
      compute: () => {
        if (d.rating == null && d.contestsAttended == null) return null;
        const ratingScore = d.rating != null ? Math.min(25, (d.rating / 2500) * 25) : 0;
        const participationScore = d.contestsAttended != null ? Math.min(5, (d.contestsAttended / 50) * 5) : 0;
        return ratingScore + participationScore;
      }
    },
    {
      key: 'diversity', label: 'Topic and language diversity', max: 10,
      compute: () => {
        if (d.topicsCovered == null && !d.languagesUsed) return null;
        const topicScore = d.topicsCovered != null ? Math.min(6, (d.topicsCovered / 20) * 6) : 0;
        const langScore = d.languagesUsed != null ? Math.min(4, (d.languagesUsed / 4) * 4) : 0;
        return topicScore + langScore;
      }
    },
    {
      key: 'badges', label: 'Badges and consistency', max: 10,
      compute: () => {
        if (d.badgesCount == null && d.activeDaysLast12Months == null) return null;
        const badgeScore = Math.min(4, (d.badgesCount || 0) * 0.5);
        const streakScore = Math.min(3, ((d.activeDaysLast12Months || 0) / 60) * 3);
        const recentScore = (d.activeDaysLast12Months || 0) > 0 ? 3 : 0;
        return badgeScore + streakScore + recentScore;
      }
    }
  ]);
}

/* ============================================================================
   CODECHEF (Total: 100 pts)
   ========================================================================== */
async function fetchCodeChef(username) {
  const out = { platform: 'codechef', available: false, username };
  try {
    const { data: html } = await axios.get(`https://www.codechef.com/users/${username}`, { headers: UA });
    const $ = cheerio.load(html);
    if (/page not found/i.test($('title').text())) { out.error = 'Username not found on CodeChef'; return out; }

    const rating = parseInt($('.rating-number').first().text().trim(), 10) || null;
    const starsMatch = $('.rating-star').first().text().match(/(\d)\s*★/);
    const stars = starsMatch ? parseInt(starsMatch[1], 10) : (rating ? null : null);

    let easy = 0, medium = 0, hard = 0, veryHard = 0;
    $('.problems-solved .content h5').each((_, el) => {
      const label = $(el).text().toLowerCase();
      const match = label.match(/\((\d+)\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      if (/school|easy|beginner/.test(label)) easy += count;
      else if (/medium/.test(label)) medium += count;
      else if (/hard/.test(label) && !/very/.test(label)) hard += count;
      else if (/very hard|challenge/.test(label)) veryHard += count;
      else medium += count;
    });
    const problemsSolved = easy + medium + hard + veryHard;
    const weightedSolved = easy * 1 + medium * 2 + hard * 3 + veryHard * 4;

    const contestsCount = parseInt($('.contest-participated-count b').first().text().trim(), 10) || null;
    const badgesCount = $('.badge, .star-block').length || null;

    out.available = rating !== null || problemsSolved > 0;
    out.rating = rating;
    out.stars = stars;
    out.problemsSolved = problemsSolved || null;
    out.weightedSolved = problemsSolved ? weightedSolved : null;
    out.difficultyMix = problemsSolved ? { easy, medium, hard, veryHard } : null;
    out.contestsCount = contestsCount;
    out.badgesCount = badgesCount;
    out.graphBuckets = { easy, medium, hard: hard + veryHard };
    out.topicCounts = {};
    out.languageCounts = {};
  } catch (err) {
    out.error = `Failed to fetch CodeChef data: ${err.message}`;
  }
  return out;
}

function scoreCodeChef(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'rating', label: 'Current rating / stars', max: 35,
      compute: () => {
        if (d.rating != null) return (d.rating / 2000) * 35;
        if (d.stars != null) return (d.stars / 7) * 35;
        return null;
      }
    },
    { key: 'problems', label: 'Problems solved', max: 30, compute: () => (d.weightedSolved != null ? (d.weightedSolved / 300) * 30 : null) },
    {
      key: 'contest', label: 'Contest performance', max: 20,
      compute: () => {
        if (d.contestsCount == null) return null;
        const participationScore = Math.min(10, (d.contestsCount / 25) * 10);
        return 0.2 * participationScore;
      }
    },
    {
      key: 'difficulty', label: 'Difficulty of solved problems', max: 10,
      compute: () => {
        if (!d.difficultyMix || !d.problemsSolved) return null;
        const hardShare = (d.difficultyMix.hard + d.difficultyMix.veryHard) / d.problemsSolved;
        if (d.difficultyMix.veryHard / d.problemsSolved > 0.15) return 10;
        if (hardShare > 0.3) return 8;
        if (hardShare > 0.1) return 5;
        return 2;
      }
    },
    { key: 'badges', label: 'Badges and consistency', max: 5, compute: () => (d.badgesCount != null ? Math.min(5, d.badgesCount) : null) }
  ]);
}

/* ============================================================================
   HACKERRANK (Total: 100 pts)
   ========================================================================== */
const HR_CATEGORY_MAP = [
  { key: 'programmingLanguages', max: 10, test: /python|java|c\+\+|c\b|javascript|ruby|scala|go\b|ocaml|haskell|kotlin/i },
  { key: 'specializedSkills', max: 5, test: /security|regex|shell|linux|functional|database|sql|react|angular|ai\b|artificial intelligence/i },
  { key: 'tutorials', max: 5, test: /10 days|30 days|tutorial/i },
  { key: 'problemSolving', max: 15, test: /.*/ }
];

async function fetchHackerRank(username) {
  const out = { platform: 'hackerrank', available: false, username };
  try {
    const [badgesRes, profileRes] = await Promise.all([
      axios.get(`https://www.hackerrank.com/rest/hackers/${username}/badges`, { headers: UA }),
      axios.get(`https://www.hackerrank.com/rest/hackers/${username}/profile`, { headers: UA }).catch(() => null)
    ]);
    const badges = badgesRes.data?.models || [];
    const profile = profileRes?.data?.model;
    if (!badges.length && !profile) { out.error = 'No public HackerRank data found'; return out; }

    const categoryStars = { programmingLanguages: 0, specializedSkills: 0, tutorials: 0, problemSolving: 0 };
    const topicCounts = {};
    for (const badge of badges) {
      const stars = Math.min(6, badge.stars || 0);
      const bucket = HR_CATEGORY_MAP.find((c) => c.test.test(badge.badge_name || ''));
      const key = bucket ? bucket.key : 'problemSolving';
      categoryStars[key] = Math.max(categoryStars[key], stars);
      if (badge.badge_name) {
        const canonical = toCanonicalTopic(badge.badge_name) || (/algorithm|data structure/i.test(badge.badge_name) ? 'Arrays & Strings' : null);
        if (canonical) bumpTopic(topicCounts, canonical, stars >= 4 ? 'hard' : stars >= 2 ? 'medium' : 'easy');
      }
    }

    out.available = true;
    out.badgeCategoryStars = categoryStars;
    out.medals = null;
    out.certifications = null;
    out.roleCertificatesCount = null;
    out.problemsSolved = profile?.solved_challenges ?? null;
    out.topicCounts = topicCounts;
    out.languageCounts = {};
    out.graphBuckets = { easy: 0, medium: 0, hard: 0 };
  } catch (err) {
    out.error = `Failed to fetch HackerRank data: ${err.message}`;
  }
  return out;
}

function scoreHackerRank(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'badges', label: 'Badges and achievements', max: 35,
      compute: () => {
        if (!d.badgeCategoryStars) return null;
        const c = d.badgeCategoryStars;
        return (c.problemSolving / 6) * 15 + (c.programmingLanguages / 6) * 10 + (c.specializedSkills / 6) * 5 + (c.tutorials / 6) * 5;
      }
    },
    {
      key: 'medals', label: 'Contest medals', max: 25,
      compute: () => (d.medals ? Math.min(25, 5 * d.medals.gold + 3 * d.medals.silver + d.medals.bronze) : null)
    },
    {
      key: 'certifications', label: 'Skill certifications', max: 30,
      compute: () => (d.certifications ? Math.min(30, 5 * d.certifications.basic + 10 * d.certifications.intermediate + 15 * d.certifications.advanced) : null)
    },
    {
      key: 'roleCerts', label: 'Role-based certifications', max: 10,
      compute: () => (d.roleCertificatesCount == null ? null : d.roleCertificatesCount >= 2 ? 10 : d.roleCertificatesCount === 1 ? 5 : 0)
    }
  ]);
}

const FETCHERS = { leetcode: fetchLeetCode, codeforces: fetchCodeforces, codechef: fetchCodeChef, hackerrank: fetchHackerRank };
const SCORERS = { leetcode: scoreLeetCode, codeforces: scoreCodeforces, codechef: scoreCodeChef, hackerrank: scoreHackerRank };

/* ============================================================================
   CANDIDATE ANALYZER
   ========================================================================== */
function buildTopicMastery(platforms) {
  const totals = {};
  for (const topic of ALL_TOPICS) totals[topic] = 0;
  for (const p of Object.values(platforms)) {
    if (!p.available || !p.topicCounts) continue;
    for (const [topic, weight] of Object.entries(p.topicCounts)) {
      if (topic in totals) totals[topic] += weight;
    }
  }
  const maxWeight = Math.max(1, ...Object.values(totals));
  const mastery = {};
  for (const topic of ALL_TOPICS) {
    mastery[topic] = Math.round(Math.min(100, (totals[topic] / maxWeight) * 100));
  }
  return mastery;
}

function buildSwot(mastery) {
  const strengths = [], weaknesses = [], opportunities = [], threats = [];
  for (const topic of ALL_TOPICS) {
    const score = mastery[topic];
    if (score >= 70) strengths.push({ topic, score });
    else if (score >= 30) weaknesses.push({ topic, score });
    else if (HIGH_STAKES_TOPICS.has(topic)) threats.push({ topic, score });
    else opportunities.push({ topic, score });
  }
  const bySc = (a, b) => b.score - a.score;
  return { strengths: strengths.sort(bySc), weaknesses: weaknesses.sort(bySc), opportunities: opportunities.sort(bySc), threats: threats.sort(bySc) };
}

function analyzeCandidate(platforms) {
  const scored = {};
  for (const [key, data] of Object.entries(platforms)) {
    const { score, breakdown, achieved, maxAvailable } = SCORERS[key](data);
    scored[key] = { ...data, platformScore: score, scoreBreakdown: breakdown, achieved, maxAvailable };
  }

  const available = Object.values(scored).filter((p) => p.available);
  const withScore = available.filter((p) => p.platformScore != null);
  const overallScore = withScore.length ? Math.round((withScore.reduce((s, p) => s + p.platformScore, 0) / withScore.length) * 10) / 10 : null;

  const mastery = buildTopicMastery(scored);
  const swot = buildSwot(mastery);

  const graphTotals = { easy: 0, medium: 0, hard: 0 };
  for (const p of available) {
    if (!p.graphBuckets) continue;
    graphTotals.easy += p.graphBuckets.easy || 0;
    graphTotals.medium += p.graphBuckets.medium || 0;
    graphTotals.hard += p.graphBuckets.hard || 0;
  }
  const diffTotal = graphTotals.easy + graphTotals.medium + graphTotals.hard;
  const difficultyProfile = diffTotal
    ? {
        totals: graphTotals,
        total: diffTotal,
        percentages: {
          easy: Math.round((graphTotals.easy / diffTotal) * 1000) / 10,
          medium: Math.round((graphTotals.medium / diffTotal) * 1000) / 10,
          hard: Math.round((graphTotals.hard / diffTotal) * 1000) / 10
        }
      }
    : { totals: graphTotals, total: 0, percentages: { easy: 0, medium: 0, hard: 0 } };

  const contestsByPlatform = {};
  let contestsTotal = 0;
  for (const p of available) {
    const count = p.contestsCount ?? p.contestsAttended ?? null;
    contestsByPlatform[p.platform] = count;
    if (typeof count === 'number') contestsTotal += count;
  }

  const mergedLangs = {};
  for (const p of available) {
    if (!p.languageCounts) continue;
    for (const [lang, count] of Object.entries(p.languageCounts)) {
      mergedLangs[lang] = (mergedLangs[lang] || 0) + count;
    }
  }
  const languageAnalysis = Object.entries(mergedLangs)
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({ language, count }));

  return {
    overallScore,
    dataConfidence: {
      platformsAvailable: available.length,
      platformsRequested: Object.keys(scored).length,
      label: available.length >= 3 ? 'strong signal' : available.length === 2 ? 'moderate signal' : available.length === 1 ? 'limited signal' : 'no data',
      unavailableReasons: Object.fromEntries(Object.values(scored).filter((p) => !p.available).map((p) => [p.platform, p.error || 'Unavailable']))
    },
    platformSummaries: Object.values(scored).map((p) => ({
      platform: p.platform,
      available: p.available,
      username: p.username,
      platformScore: p.platformScore,
      scoreBreakdown: p.scoreBreakdown,
      achieved: p.achieved,
      maxAvailable: p.maxAvailable,
      problemsSolved: p.problemsSolved ?? null
    })),
    topicMastery: mastery,
    swot,
    difficultyProfile,
    contestPerformance: { byPlatform: contestsByPlatform, total: contestsTotal },
    languageAnalysis
  };
}

async function normalizeCandidate(profiles) {
  const jobs = [];
  const keys = [];
  for (const [platformKey, rawInput] of Object.entries(profiles || {})) {
    if (!rawInput || !rawInput.trim() || !FETCHERS[platformKey]) continue;
    keys.push(platformKey);
    try {
      const parsed = parseProfileInput(platformKey, rawInput);
      jobs.push(FETCHERS[platformKey](parsed.username));
    } catch (err) {
      jobs.push(Promise.resolve({ platform: platformKey, available: false, username: rawInput, error: err.message }));
    }
  }
  const results = await Promise.all(jobs);
  const platforms = {};
  results.forEach((r, i) => { platforms[keys[i]] = r; });
  return platforms;
}

/* ============================================================================
   SERVER INITIALIZATION
   ========================================================================== */
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/analyze', async (req, res) => {
  const { profiles } = req.body || {};
  if (!profiles || !Object.values(profiles).some((v) => v && v.trim())) {
    return res.status(400).json({ error: 'Provide at least one platform profile (leetcode, codeforces, codechef, hackerrank).' });
  }
  try {
    const platforms = await normalizeCandidate(profiles);
    const score = analyzeCandidate(platforms);
    res.json({ generatedAt: new Date().toISOString(), score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to analyze candidate', detail: err.message });
  }
});

app.listen(PORT, () => console.log(`Candidate Dashboard running on http://localhost:${PORT}`));