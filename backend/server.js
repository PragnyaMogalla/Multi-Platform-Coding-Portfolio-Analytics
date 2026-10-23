import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5050;

/* ============================================================================
   PERSISTENCE LAYER (JSON Database)
   ========================================================================== */
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [
        {
          id: 'admin_seed_1',
          name: 'Campus Placement Admin',
          username: 'admin_lead',
          email: 'admin@college.edu',
          password: 'admin123',
          role: 'community',
          communityCode: 'RBU-2026',
          members: [],
          pendingRequests: [],
          createdAt: new Date().toISOString()
        }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return { users: [] };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* ============================================================================
   TAXONOMY & DYNAMIC NORMALIZATION ENGINE
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

const GRAPH_DIFFICULTY_WEIGHT = { easy: 1, medium: 2, hard: 3 };

function bumpTopic(topicCounts, canonicalTopic, difficultyLevel, count = 1) {
  if (!canonicalTopic) return;
  const weight = (GRAPH_DIFFICULTY_WEIGHT[difficultyLevel] || 1) * count;
  topicCounts[canonicalTopic] = (topicCounts[canonicalTopic] || 0) + weight;
}

// Drop-and-Renormalize Core Logic
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
    breakdown.push({ key: c.key, label: c.label, max: c.max, points: Math.round(points * 10) / 10, available: true });
  }
  const score = maxAvailable > 0 ? Math.round((achieved / maxAvailable) * 1000) / 10 : null;
  return { score, breakdown, achieved: Math.round(achieved * 10) / 10, maxAvailable };
}

/* ============================================================================
   PROFILE PARSERS
   ========================================================================== */
const URL_PATTERNS = [
  { platform: 'leetcode', regex: /leetcode\.com\/(?:u\/)?([a-zA-Z0-9_-]+)/i },
  { platform: 'codeforces', regex: /codeforces\.com\/profile\/([a-zA-Z0-9_-]+)/i },
  { platform: 'codechef', regex: /codechef\.com\/users\/([a-zA-Z0-9_-]+)/i },
  { platform: 'hackerrank', regex: /hackerrank\.com\/(?:profile\/)?([a-zA-Z0-9_-]+)/i },
  { platform: 'github', regex: /github\.com\/([a-zA-Z0-9_-]+)/i }
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
  return { username: trimmed.split('/').filter(Boolean).pop() || trimmed };
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };

/* ============================================================================
   PLATFORM SCRAPERS & SCORERS (ALIGNED TO NORMALISER.DOCX)
   ========================================================================== */

// 1. CODEFORCES (85 Pts Max Base)
async function fetchCodeforces(username) {
  const base = 'https://codeforces.com/api';
  const out = { platform: 'codeforces', available: false, username };
  try {
    const [infoRes, statusRes, ratingRes] = await Promise.all([
      axios.get(`${base}/user.info`, { params: { handles: username } }),
      axios.get(`${base}/user.status`, { params: { handle: username, from: 1, count: 5000 } }),
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
    out.error = `Codeforces: ${err.message}`;
  }
  return out;
}

function scoreCodeforces(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'rating', label: 'Rating / Rank (40 Pts)', max: 40,
      compute: () => {
        if (d.rating == null) return null;
        const currentScore = (d.rating / 1648) * 40;
        if (d.maxRating == null) return currentScore;
        const maxScore = (d.maxRating / 1648) * 40;
        return 0.7 * currentScore + 0.3 * maxScore;
      }
    },
    { key: 'problems', label: 'Problem-Solving Metrics (25 Pts)', max: 25, compute: () => (d.weightedProblems != null ? (d.weightedProblems / 375) * 25 : null) },
    { key: 'contests', label: 'Contest Activity (15 Pts)', max: 15, compute: () => (d.contestsCount != null ? (d.contestsCount / 50) * 15 : null) },
    { key: 'consistency', label: 'Profile Consistency (5 Pts)', max: 5, compute: () => (d.activeMonthsLast12 != null ? (d.activeMonthsLast12 / 12) * 5 : null) }
  ]);
}

// 2. LEETCODE (100 Pts Max Base)
async function fetchLeetCode(username) {
  const out = { platform: 'leetcode', available: false, username };
  const query = `query userProfile($username: String!) {
    matchedUser(username: $username) {
      submitStatsGlobal { acSubmissionNum { difficulty count } }
      languageProblemCount { languageName problemsSolved }
      tagProblemCounts { advanced { tagName problemsSolved } intermediate { tagName problemsSolved } fundamental { tagName problemsSolved } }
      badges { id displayName }
      submissionCalendar
    }
    userContestRanking(username: $username) { rating attendedContestsCount }
  }`;
  try {
    const { data } = await axios.post('https://leetcode.com/graphql', { query, variables: { username } }, {
      headers: { 'Content-Type': 'application/json', Referer: `https://leetcode.com/${username}/`, ...UA }
    });
    const user = data?.data?.matchedUser;
    if (!user) { out.error = 'User not found'; return out; }
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
    for (const lang of user.languageProblemCount || []) languageCounts[lang.languageName] = lang.problemsSolved;

    let activeDays = 0;
    try {
      const cal = JSON.parse(user.submissionCalendar || '{}');
      const now = Date.now() / 1000;
      activeDays = Object.entries(cal).filter(([ts]) => now - Number(ts) <= 365 * 86400).length;
    } catch { /* optional */ }

    out.available = true;
    out.rating = contest?.rating ? Math.round(contest.rating) : null;
    out.contestsAttended = contest?.attendedContestsCount ?? null;
    out.problemsSolved = graphBuckets.easy + graphBuckets.medium + graphBuckets.hard;
    out.weightedSolving = weightedSolving;
    out.badgesCount = (user.badges || []).length;
    out.activeDaysLast12Months = activeDays;
    out.topicCounts = topicCounts;
    out.languageCounts = languageCounts;
    out.graphBuckets = graphBuckets;
  } catch (err) {
    out.error = `LeetCode: ${err.message}`;
  }
  return out;
}

function scoreLeetCode(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'problemsAndDifficulty',
      label: 'Problem Solving & Difficulty (Weighted, 50 Pts)',
      max: 50,
      compute: () => (d.weightedSolving != null ? Math.min(50, (d.weightedSolving / 700) * 50) : null)
    },
    {
      key: 'contest',
      label: 'Contest Metrics (Rating 15 + Attended 5, 20 Pts)',
      max: 20,
      compute: () => {
        if (d.rating == null && d.contestsAttended == null) return null;
        const rScore = d.rating != null ? Math.min(15, (d.rating / 1600) * 15) : 0;
        const pScore = d.contestsAttended != null ? Math.min(5, (d.contestsAttended / 50) * 5) : 0;
        return rScore + pScore;
      }
    },
    {
      key: 'diversity',
      label: 'Topic & Language Diversity (10 Pts)',
      max: 10,
      compute: () => {
        const topicsCount = Object.keys(d.topicCounts || {}).length;
        const langsCount = Object.keys(d.languageCounts || {}).length;
        return Math.min(6, (topicsCount / 15) * 6) + Math.min(4, (langsCount / 4) * 4);
      }
    },
    {
      key: 'badgesAndConsistency',
      label: 'Badges & Consistency (10 Pts)',
      max: 10,
      compute: () => {
        if (d.badgesCount == null && d.activeDaysLast12Months == null) return null;
        const badgePts = Math.min(4, (d.badgesCount || 0) * 1);
        const streakPts = Math.min(3, ((d.activeDaysLast12Months || 0) / 60) * 3);
        const activityPts = (d.activeDaysLast12Months || 0) > 10 ? 3 : 1;
        return badgePts + streakPts + activityPts;
      }
    }
  ]);
}

// 3. CODECHEF (100 Pts Max Base)
async function fetchCodeChef(username) {
  const out = { platform: 'codechef', available: false, username };
  try {
    const { data: html } = await axios.get(`https://www.codechef.com/users/${username}`, { headers: UA });
    const $ = cheerio.load(html);
    if (/page not found/i.test($('title').text())) { out.error = 'Not found'; return out; }

    const rating = parseInt($('.rating-number').first().text().trim(), 10) || null;
    const starsMatch = $('.rating-star').first().text().match(/(\d)\s*★/);
    const stars = starsMatch ? parseInt(starsMatch[1], 10) : null;

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

    out.available = rating !== null || problemsSolved > 0;
    out.rating = rating;
    out.stars = stars;
    out.problemsSolved = problemsSolved || null;
    out.weightedSolved = problemsSolved ? weightedSolved : null;
    out.contestsCount = contestsCount;
    out.graphBuckets = { easy, medium, hard: hard + veryHard };
    out.topicCounts = {};
    out.languageCounts = {};
  } catch (err) {
    out.error = `CodeChef: ${err.message}`;
  }
  return out;
}

function scoreCodeChef(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'rating', label: 'Current Rating / Stars (35 Pts)', max: 35,
      compute: () => {
        if (d.rating != null) return Math.min(35, (d.rating / 2000) * 35);
        if (d.stars != null) return (d.stars / 7) * 35;
        return null;
      }
    },
    { key: 'problems', label: 'Problems Solved (Weighted, 30 Pts)', max: 30, compute: () => (d.weightedSolved != null ? Math.min(30, (d.weightedSolved / 300) * 30) : null) },
    { key: 'contest', label: 'Contest Performance (20 Pts)', max: 20, compute: () => (d.contestsCount != null ? Math.min(20, (d.contestsCount / 25) * 20) : null) },
    { key: 'difficulty', label: 'Difficulty Beyond Beginner (10 Pts)', max: 10, compute: () => (d.graphBuckets?.hard > 0 ? 10 : d.graphBuckets?.medium > 5 ? 7 : 4) },
    { key: 'consistency', label: 'Badges & Consistency (5 Pts)', max: 5, compute: () => (d.contestsCount > 5 ? 5 : 2) }
  ]);
}

// 4. HACKERRANK (100 Pts Max Base)
const HR_CATEGORY_MAP = [
  { key: 'problemSolving', max: 15, test: /problem solving|algorithms|data structures/i },
  { key: 'programmingLanguages', max: 10, test: /python|java|c\+\+|c\b|javascript|ruby|go\b|sql/i },
  { key: 'specializedSkills', max: 5, test: /security|regex|shell|linux|ai\b/i },
  { key: 'tutorials', max: 5, test: /30 days|10 days/i }
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
    if (!badges.length && !profile) { out.error = 'No public data'; return out; }

    const categoryStars = { problemSolving: 0, programmingLanguages: 0, specializedSkills: 0, tutorials: 0 };
    const topicCounts = {};
    for (const badge of badges) {
      const stars = Math.min(6, badge.stars || 0);
      const match = HR_CATEGORY_MAP.find((c) => c.test.test(badge.badge_name || ''));
      const catKey = match ? match.key : 'problemSolving';
      categoryStars[catKey] = Math.max(categoryStars[catKey], stars);

      if (badge.badge_name) {
        const canonical = toCanonicalTopic(badge.badge_name) || 'Arrays & Strings';
        bumpTopic(topicCounts, canonical, stars >= 4 ? 'hard' : stars >= 2 ? 'medium' : 'easy');
      }
    }

    out.available = true;
    out.badgesCount = badges.length;
    out.badgeCategoryStars = categoryStars;
    out.problemsSolved = profile?.solved_challenges ?? null;
    out.medals = profile?.medals_count || { gold: 0, silver: 0, bronze: 0 };
    out.topicCounts = topicCounts;
    out.languageCounts = {};
    out.graphBuckets = { easy: 0, medium: 0, hard: 0 };
  } catch (err) {
    out.error = `HackerRank: ${err.message}`;
  }
  return out;
}

function scoreHackerRank(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    {
      key: 'badges', label: 'Skill Badges (4 Categories, 35 Pts)', max: 35,
      compute: () => {
        if (!d.badgeCategoryStars) return null;
        const c = d.badgeCategoryStars;
        return (c.problemSolving / 6) * 15 +
               (c.programmingLanguages / 6) * 10 +
               (c.specializedSkills / 6) * 5 +
               (c.tutorials / 6) * 5;
      }
    },
    {
      key: 'medals', label: 'Contest Medals (25 Pts)', max: 25,
      compute: () => {
        if (!d.medals) return 0;
        return Math.min(25, (d.medals.gold || 0) * 5 + (d.medals.silver || 0) * 3 + (d.medals.bronze || 0) * 1);
      }
    },
    {
      key: 'problems', label: 'Verified Challenge Solves (40 Pts)', max: 40,
      compute: () => (d.problemsSolved != null ? Math.min(40, (d.problemsSolved / 100) * 40) : null)
    }
  ]);
}

// 5. GITHUB (100 Pts Max Base)
async function fetchGitHub(username) {
  const out = { platform: 'github', available: false, username };
  try {
    const [userRes, reposRes] = await Promise.all([
      axios.get(`https://api.github.com/users/${username}`, { headers: UA }),
      axios.get(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers: UA }).catch(() => ({ data: [] }))
    ]);

    const profile = userRes.data;
    const repos = Array.isArray(reposRes.data) ? reposRes.data : [];

    let totalStars = 0;
    let totalForks = 0;
    let collaborations = 0;
    const languageCounts = {};
    const monthsActiveSet = new Set();
    const oneYearAgo = Date.now() - 365 * 86400000;
    const sixMonthsAgo = Date.now() - 180 * 86400000;
    let reposInLastYear = 0;
    let reposInLast6Months = 0;

    for (const r of repos) {
      if (r.fork) {
        collaborations++;
        continue;
      }
      totalStars += r.stargazers_count || 0;
      totalForks += r.forks_count || 0;
      if (r.language) {
        languageCounts[r.language] = (languageCounts[r.language] || 0) + 1;
      }
      const updatedTime = new Date(r.updated_at).getTime();
      if (updatedTime >= oneYearAgo) reposInLastYear++;
      if (updatedTime >= sixMonthsAgo) {
        reposInLast6Months++;
        monthsActiveSet.add(r.updated_at.slice(0, 7));
      }
    }

    out.available = true;
    out.publicRepos = profile.public_repos || 0;
    out.followers = profile.followers || 0;
    out.following = profile.following || 0;
    out.totalStars = totalStars;
    out.totalForks = totalForks;
    out.collaborations = collaborations;
    out.reposInLastYear = Math.max(reposInLastYear, profile.public_repos || 0);
    out.monthsActiveInLast6 = monthsActiveSet.size;
    out.reposInLast6Months = reposInLast6Months;
    out.languagesUsed = Object.keys(languageCounts).length;
    out.languageCounts = languageCounts;
    out.problemsSolved = profile.public_repos || 0;
    out.graphBuckets = { easy: 0, medium: 0, hard: 0 };
    out.topicCounts = {};
  } catch (err) {
    out.error = `GitHub: ${err.message}`;
  }
  return out;
}

function scoreGitHub(d) {
  if (!d.available) return { score: null, breakdown: [] };
  return scoreComponents([
    { key: 'repos', label: 'Repository & Project Volume (25 Pts)', max: 25, compute: () => (d.publicRepos != null ? Math.min(25, (d.publicRepos / 15) * 25) : null) },
    { key: 'stars', label: 'Stargazers & Code Impact (30 Pts)', max: 30, compute: () => (d.totalStars != null ? Math.min(30, (d.totalStars / 10) * 30) : null) },
    { key: 'diversity', label: 'Language Stack Diversity (25 Pts)', max: 25, compute: () => (d.languagesUsed != null ? Math.min(25, (d.languagesUsed / 5) * 25) : null) },
    { key: 'community', label: 'Followers & Reach (20 Pts)', max: 20, compute: () => (d.followers != null ? Math.min(20, (d.followers / 20) * 20) : null) }
  ]);
}

const FETCHERS = { 
  leetcode: fetchLeetCode, 
  codeforces: fetchCodeforces, 
  codechef: fetchCodeChef, 
  hackerrank: fetchHackerRank,
  github: fetchGitHub
};

const SCORERS = { 
  leetcode: scoreLeetCode, 
  codeforces: scoreCodeforces, 
  codechef: scoreCodeChef, 
  hackerrank: scoreHackerRank,
  github: scoreGitHub
};

/* ============================================================================
   RBU PLACEMENT EVALUATION SHEET MATRIX (100 MARKS MAX)
   ========================================================================== */
function calculateRbuPlacementScore(user, platforms) {
  const acad = user.academics || {};
  const exp = user.institutionalExperience || {};
  const breakdown = {};

  // 1. Academics (15 Marks Max)
  const pct10 = Number(acad.tenthPercentage) || 0;
  const s10 = pct10 >= 80 ? 5 : pct10 >= 75 ? 4 : pct10 >= 70 ? 3 : pct10 >= 65 ? 2 : pct10 > 0 ? 1 : 0;

  const pct12 = Number(acad.twelfthPercentage) || 0;
  const s12 = pct12 >= 80 ? 5 : pct12 >= 75 ? 4 : pct12 >= 70 ? 3 : pct12 >= 65 ? 2 : pct12 > 0 ? 1 : 0;

  const cgpa = Number(acad.cgpa) || 0;
  const sCgpa = cgpa >= 8.0 ? 5 : cgpa >= 7.5 ? 4 : cgpa >= 7.0 ? 3 : cgpa >= 6.5 ? 2 : cgpa > 0 ? 1 : 0;

  breakdown.academics = { s10, s12, sCgpa, total: s10 + s12 + sCgpa, max: 15 };

  // 2. GitHub Profile (15 Marks Max)
  const gh = platforms.github || {};
  let ghContributions = 0;
  let ghCollab = 0;
  let ghFreq = 0;

  if (gh.available) {
    const reposYr = gh.reposInLastYear || 0;
    ghContributions = reposYr > 20 ? 5 : reposYr >= 16 ? 4 : reposYr >= 11 ? 3 : reposYr >= 6 ? 2 : reposYr >= 1 ? 1 : 0;
    ghCollab = Math.min(6, (gh.collaborations || 0) * 2);
    const monthlyRate = (gh.reposInLast6Months || 0) / 6;
    ghFreq = monthlyRate >= 2 ? 4 : monthlyRate >= 1 ? 2 : 0;
  }
  breakdown.github = { contributions: ghContributions, collaborations: ghCollab, frequency: ghFreq, total: ghContributions + ghCollab + ghFreq, max: 15 };

  // 3. Coding Platform Experience (20 Marks Max)
  const hr = platforms.hackerrank || {};
  const lc = platforms.leetcode || {};
  const cf = platforms.codeforces || {};
  const cc = platforms.codechef || {};

  const hrBadges = hr.available ? (hr.badgesCount || 0) : 0;
  const fallbackBadges = hr.available ? hrBadges : (lc.badgesCount || 0);
  const sBadges = fallbackBadges >= 5 ? 5 
                : fallbackBadges === 4 ? 4 
                : fallbackBadges === 3 ? 3 
                : fallbackBadges === 2 ? 2 
                : fallbackBadges >= 1 ? 1 : 0;

  let totalMedHard = 0;
  if (hr.available && hr.problemsSolved) {
    const hrMedHard = (hr.badgeCategoryStars?.problemSolving >= 3 ? Math.round(hr.problemsSolved * 0.4) : 0);
    totalMedHard += hrMedHard;
  }
  if (lc.available && lc.graphBuckets) {
    totalMedHard += (lc.graphBuckets.medium || 0) + (lc.graphBuckets.hard || 0);
  }
  if (cf.available && cf.graphBuckets) {
    totalMedHard += (cf.graphBuckets.medium || 0) + (cf.graphBuckets.hard || 0);
  }
  if (cc.available && cc.graphBuckets) {
    totalMedHard += (cc.graphBuckets.medium || 0) + (cc.graphBuckets.hard || 0);
  }

  const sMedHard = totalMedHard > 20 ? 5
                 : totalMedHard >= 16 ? 4
                 : totalMedHard >= 11 ? 3
                 : totalMedHard >= 6 ? 2
                 : totalMedHard >= 1 ? 1 : 0;

  const lcSolved = lc.available ? (lc.problemsSolved || 0) : 0;
  const sLc = lcSolved > 250 ? 10
            : lcSolved >= 201 ? 9
            : lcSolved >= 149 ? 8
            : lcSolved >= 101 ? 7
            : lcSolved >= 50 ? 6
            : lcSolved >= 20 ? 5 : 0;

  breakdown.codingPlatforms = {
    badges: sBadges,
    mediumHard: sMedHard,
    leetcode: sLc,
    totalBadgesCount: fallbackBadges,
    totalMedHardSolved: totalMedHard,
    leetcodeSolved: lcSolved,
    total: sBadges + sMedHard + sLc,
    max: 20
  };

  // 4. Internship Experience (10 Marks Max)
  let internScore = 0;
  if (exp.internationalInternship) {
    internScore = 10;
  } else {
    internScore += (Number(exp.reputedInternshipsCount) || 0) * 5;
    internScore += Math.min(8, (Number(exp.eduskillsInternshipsCount) || 0) * 4);
    if (exp.stipendAbove10k) internScore += 5;
    internScore = Math.min(10, internScore);
  }
  breakdown.internships = { total: internScore, max: 10 };

  // 5. Skillset & Standard Certifications (15 Marks Max)
  const globalCertScore = (Number(exp.globalCertsCount) || 0) * 5;
  const nptelScore = Math.min(8, (Number(exp.nptelCoursesCount) || 0) * 4);
  const rbuCourseScore = Math.min(6, (Number(exp.rbuOnlineCoursesCount) || 0) * 3);
  const certTotal = Math.min(15, globalCertScore + nptelScore + rbuCourseScore);
  breakdown.certifications = { global: globalCertScore, nptel: nptelScore, rbu: rbuCourseScore, total: certTotal, max: 15 };

  // 6. Projects (15 Marks Max)
  const industryProjects = (Number(exp.industryProjectsCount) || 0) * 5;
  const domainProjects = (Number(exp.domainProjectsCount) || 0) * 4;
  const projTotal = Math.min(15, industryProjects + domainProjects);
  breakdown.projects = { industry: industryProjects, domain: domainProjects, total: projTotal, max: 15 };

  // 7. Industry/Academic Coding Competitions & Hackathons (10 Marks Max)
  const hackFirst = (Number(exp.hackathonsFirstCount) || 0) * 5;
  const hackSecond = (Number(exp.hackathonsSecondCount) || 0) * 4;
  const hackThird = (Number(exp.hackathonsThirdCount) || 0) * 3;
  const hackPart = (Number(exp.hackathonsParticipationCount) || 0) * 2;
  const hackTotal = Math.min(10, hackFirst + hackSecond + hackThird + hackPart);
  breakdown.hackathons = { total: hackTotal, max: 10 };

  const totalScore = breakdown.academics.total + breakdown.github.total + breakdown.codingPlatforms.total +
                     breakdown.internships.total + breakdown.certifications.total + breakdown.projects.total +
                     breakdown.hackathons.total;

  return { totalScore: Math.min(100, totalScore), breakdown };
}

/* ============================================================================
   SWOT & COMPOSITE CP NORMALIZER
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

function analyzeCandidate(user, platforms) {
  const scored = {};
  for (const [key, data] of Object.entries(platforms)) {
    const { score, breakdown, achieved, maxAvailable } = SCORERS[key](data);
    scored[key] = { ...data, platformScore: score, scoreBreakdown: breakdown, achieved, maxAvailable };
  }

  const available = Object.values(scored).filter((p) => p.available);

  // Normalizer Platform Multipliers from Normaliser.docx
  const PLATFORM_WEIGHTS = { hackerrank: 1.0, leetcode: 2.0, codechef: 3.0, codeforces: 3.5, github: 2.0 };
  let weightedScoreSum = 0;
  let totalPlatformWeight = 0;

  for (const p of available) {
    if (p.platformScore != null) {
      const w = PLATFORM_WEIGHTS[p.platform] || 1.0;
      weightedScoreSum += p.platformScore * w;
      totalPlatformWeight += w;
    }
  }

  const overallScore = totalPlatformWeight > 0 ? Math.round((weightedScoreSum / totalPlatformWeight) * 10) / 10 : null;

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

  const rbuPlacement = calculateRbuPlacementScore(user, scored);

  return {
    overallScore,
    rbuPlacement,
    lastUpdated: new Date().toISOString(),
    dataConfidence: {
      platformsAvailable: available.length,
      platformsRequested: Object.keys(scored).length,
      label: available.length >= 3 ? 'strong signal' : available.length === 2 ? 'moderate signal' : 'limited signal'
    },
    platformSummaries: Object.values(scored).map((p) => ({
      platform: p.platform,
      available: p.available,
      username: p.username,
      platformScore: p.platformScore,
      scoreBreakdown: p.scoreBreakdown,
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

async function refreshCandidateLive(user, db) {
  try {
    const platforms = await normalizeCandidate(user.links);
    user.latestScore = analyzeCandidate(user, platforms);
    saveDB(db);
  } catch (err) {
    console.error(`Live refresh error for ${user.username}:`, err.message);
  }
  return user;
}

/* ============================================================================
   EXPRESS SERVER & API ROUTES (REAL-TIME ENABLED)
   ========================================================================== */
const app = express();
app.use(cors());
app.use(express.json());

// 1. Sign Up
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, username, password, role, links, academics, institutionalExperience } = req.body;
  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Name, email, username, and password are required.' });
  }

  const db = loadDB();
  const cleanUser = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  if (db.users.some((u) => u.username.toLowerCase() === cleanUser)) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }
  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'Email already registered.' });
  }

  const cleanRole = role === 'community' ? 'community' : 'candidate';
  const filteredLinks = {};
  if (cleanRole === 'candidate') {
    const cpKeys = ['leetcode', 'codeforces', 'codechef', 'hackerrank', 'github'];
    const hasAtLeastOne = cpKeys.some((k) => links?.[k] && links[k].trim());
    if (!hasAtLeastOne) {
      return res.status(400).json({ error: 'Provide at least one profile link.' });
    }
    [...cpKeys, 'linkedin'].forEach((k) => {
      if (links?.[k]?.trim()) filteredLinks[k] = links[k].trim();
    });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    name: name.trim(),
    email: cleanEmail,
    username: cleanUser,
    password,
    role: cleanRole,
    createdAt: new Date().toISOString()
  };

  if (cleanRole === 'community') {
    newUser.communityCode = 'RBU-' + Math.floor(1000 + Math.random() * 9000);
    newUser.members = [];
    newUser.pendingRequests = [];
  } else {
    newUser.links = filteredLinks;
    newUser.lockedLinks = Object.keys(filteredLinks);
    newUser.academics = academics || { tenthPercentage: 0, twelfthPercentage: 0, cgpa: 0 };
    newUser.institutionalExperience = institutionalExperience || {};
    newUser.communities = [];
    newUser.incomingInvites = [];
    try {
      const platforms = await normalizeCandidate(newUser.links);
      newUser.latestScore = analyzeCandidate(newUser, platforms);
    } catch {
      newUser.latestScore = null;
    }
  }

  db.users.push(newUser);
  saveDB(db);

  const { password: _, ...safeUser } = newUser;
  res.json({ message: 'Account created successfully', user: safeUser });
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === username?.trim().toLowerCase() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

  if (user.role === 'candidate') {
    await refreshCandidateLive(user, db);
  }

  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// 3. Auto-Live User Refresh
app.get('/api/user/:username', async (req, res) => {
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'candidate') {
    await refreshCandidateLive(user, db);
  }

  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// 4. Force Live Re-sync
app.post('/api/user/recalculate', async (req, res) => {
  const { username } = req.body;
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  await refreshCandidateLive(user, db);
  const { password: _, ...safeUser } = user;
  res.json({ message: 'Live scoring matrix recalculated!', user: safeUser });
});

// 5. Update Academic & Placement Credentials
app.post('/api/user/update-placement-credentials', async (req, res) => {
  const { username, academics, institutionalExperience } = req.body;
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === username?.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (academics) user.academics = academics;
  if (institutionalExperience) user.institutionalExperience = institutionalExperience;

  await refreshCandidateLive(user, db);
  const { password: _, ...safeUser } = user;
  res.json({ message: 'Credentials updated and re-evaluated live!', user: safeUser });
});

// 6. Add & Lock Platform Link
app.post('/api/user/add-link', async (req, res) => {
  const { username, platform, link } = req.body;
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.lockedLinks?.includes(platform)) {
    return res.status(400).json({ error: `The ${platform} link is locked and cannot be modified.` });
  }

  user.links = user.links || {};
  user.lockedLinks = user.lockedLinks || [];
  user.links[platform] = link.trim();
  user.lockedLinks.push(platform);

  await refreshCandidateLive(user, db);
  const { password: _, ...safeUser } = user;
  res.json({ message: `Successfully added and permanently locked ${platform}.`, user: safeUser });
});

// 7. Delete Account
app.post('/api/user/delete-account', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const userIdx = db.users.findIndex(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
  );
  if (userIdx === -1) return res.status(401).json({ error: 'Invalid password. Cannot delete account.' });

  const user = db.users[userIdx];
  if (user.role === 'candidate') {
    db.users.forEach((u) => {
      if (u.role === 'community') {
        u.members = (u.members || []).filter((m) => m.toLowerCase() !== user.username.toLowerCase());
        u.pendingRequests = (u.pendingRequests || []).filter((r) => r.toLowerCase() !== user.username.toLowerCase());
      }
    });
  } else if (user.role === 'community') {
    const code = user.communityCode;
    db.users.forEach((u) => {
      if (u.role === 'candidate') {
        u.communities = (u.communities || []).filter((c) => c !== code);
        u.incomingInvites = (u.incomingInvites || []).filter((inv) => inv.code !== code);
      }
    });
  }

  db.users.splice(userIdx, 1);
  saveDB(db);
  res.json({ message: 'Account permanently deleted.' });
});

// 8. Community Workflow
app.post('/api/community/student-request', (req, res) => {
  const { studentUsername, communityCode } = req.body;
  const db = loadDB();
  const codeClean = (communityCode || '').trim().toUpperCase();
  const lead = db.users.find((u) => u.role === 'community' && (u.communityCode || '').toUpperCase() === codeClean);
  if (!lead) return res.status(404).json({ error: 'Invalid Community Code.' });

  const student = db.users.find((u) => u.username.toLowerCase() === studentUsername.toLowerCase());
  lead.members = lead.members || [];
  lead.pendingRequests = lead.pendingRequests || [];

  if (lead.members.includes(student.username)) return res.status(400).json({ error: 'Already a verified member.' });
  if (lead.pendingRequests.includes(student.username)) return res.status(400).json({ error: 'Request already pending.' });

  lead.pendingRequests.push(student.username);
  saveDB(db);
  res.json({ message: `Request sent to ${lead.name} (${codeClean})!` });
});

app.post('/api/community/admin-respond-request', (req, res) => {
  const { adminUsername, studentUsername, action } = req.body;
  const db = loadDB();
  const lead = db.users.find((u) => u.username.toLowerCase() === adminUsername.toLowerCase() && u.role === 'community');
  const student = db.users.find((u) => u.username.toLowerCase() === studentUsername.toLowerCase());

  lead.pendingRequests = (lead.pendingRequests || []).filter((u) => u.toLowerCase() !== studentUsername.toLowerCase());
  if (action === 'accept') {
    lead.members = lead.members || [];
    if (!lead.members.includes(student.username)) lead.members.push(student.username);
    student.communities = student.communities || [];
    if (!student.communities.includes(lead.communityCode)) student.communities.push(lead.communityCode);
  }
  saveDB(db);
  res.json({ message: `Request ${action === 'accept' ? 'accepted' : 'declined'}.` });
});

app.post('/api/community/admin-invite-student', (req, res) => {
  const { adminUsername, studentUsername } = req.body;
  const db = loadDB();
  const lead = db.users.find((u) => u.username.toLowerCase() === adminUsername.toLowerCase() && u.role === 'community');
  const student = db.users.find((u) => u.username.toLowerCase() === (studentUsername || '').trim().toLowerCase() && u.role === 'candidate');
  if (!student) return res.status(404).json({ error: 'Candidate not found.' });

  student.incomingInvites = student.incomingInvites || [];
  if (student.incomingInvites.some((inv) => inv.code === lead.communityCode)) {
    return res.status(400).json({ error: 'Invitation already sent.' });
  }

  student.incomingInvites.push({ code: lead.communityCode, communityName: lead.name, invitedAt: new Date().toISOString() });
  saveDB(db);
  res.json({ message: `Invitation sent to @${student.username}!` });
});

app.post('/api/community/student-respond-invite', (req, res) => {
  const { studentUsername, communityCode, action } = req.body;
  const db = loadDB();
  const student = db.users.find((u) => u.username.toLowerCase() === studentUsername.toLowerCase());
  const lead = db.users.find((u) => u.role === 'community' && u.communityCode === communityCode);

  student.incomingInvites = (student.incomingInvites || []).filter((inv) => inv.code !== communityCode);
  if (action === 'accept' && lead) {
    student.communities = student.communities || [];
    if (!student.communities.includes(communityCode)) student.communities.push(communityCode);
    lead.members = lead.members || [];
    if (!lead.members.includes(student.username)) lead.members.push(student.username);
  }
  saveDB(db);
  const { password: _, ...safeUser } = student;
  res.json({ message: `Invitation ${action === 'accept' ? 'accepted' : 'declined'}.`, user: safeUser });
});

// 9. Admin - Cohort View (Live Sync)
app.get('/api/admin/cohort/:adminUsername', async (req, res) => {
  const db = loadDB();
  const lead = db.users.find((u) => u.username.toLowerCase() === req.params.adminUsername.toLowerCase());
  if (!lead) return res.status(404).json({ error: 'Admin not found.' });

  const verifiedCohort = db.users
    .filter((u) => u.role === 'candidate' && (lead.members || []).includes(u.username));

  await Promise.all(verifiedCohort.map((candidate) => refreshCandidateLive(candidate, db)));

  const cleanCohort = verifiedCohort.map(({ password: _, ...rest }) => rest);
  const pendingRequests = db.users
    .filter((u) => (lead.pendingRequests || []).includes(u.username))
    .map((u) => ({ name: u.name, username: u.username, email: u.email }));

  res.json({ communityCode: lead.communityCode, cohort: cleanCohort, pendingRequests });
});

// 10. Admin - Live Real-Time CSV Export
app.get('/api/admin/export-csv/:adminUsername', async (req, res) => {
  const db = loadDB();
  const lead = db.users.find((u) => u.username.toLowerCase() === req.params.adminUsername.toLowerCase());
  if (!lead) return res.status(404).send('Admin not found');

  const candidates = db.users.filter((u) => u.role === 'candidate' && (lead.members || []).includes(u.username));

  await Promise.all(candidates.map((c) => refreshCandidateLive(c, db)));

  const headers = [
    'Unique Username',
    'Name',
    'Email',
    'CP Signal Index (out of 100)',
    'RBU Placement Score (out of 100)',
    '10th %',
    '12th %',
    'CGPA',
    'LeetCode Solves',
    'GitHub Repos',
    'GitHub Stars',
    'Codeforces Rating',
    'Last Synced At'
  ];

  const rows = candidates.map((c) => {
    const lcSummary = c.latestScore?.platformSummaries?.find((p) => p.platform === 'leetcode');
    const ghSummary = c.latestScore?.platformSummaries?.find((p) => p.platform === 'github');
    const cfSummary = c.latestScore?.platformSummaries?.find((p) => p.platform === 'codeforces');

    return [
      `"${c.username}"`,
      `"${c.name}"`,
      `"${c.email}"`,
      c.latestScore?.overallScore ?? 'N/A',
      c.latestScore?.rbuPlacement?.totalScore ?? 'N/A',
      c.academics?.tenthPercentage || 'N/A',
      c.academics?.twelfthPercentage || 'N/A',
      c.academics?.cgpa || 'N/A',
      lcSummary?.problemsSolved ?? 'N/A',
      ghSummary?.problemsSolved ?? 'N/A',
      c.latestScore?.rbuPlacement?.breakdown?.github?.total ?? 'N/A',
      cfSummary?.platformScore ?? 'N/A',
      `"${c.latestScore?.lastUpdated || new Date().toISOString()}"`
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${lead.communityCode}_cohort_realtime.csv"`);
  res.send(csvContent);
});

app.listen(PORT, () => console.log(`Candidate Dashboard server running on http://localhost:${PORT}`));