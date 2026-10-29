import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import PDFParser from 'pdf2json';
import 'dotenv/config';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType } from 'docx';
import { auditResumeAgainstJob, ROLE_PRESETS } from './atsScorer.js';
import 'dotenv/config'; // Loads your .env file


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
   TAXONOMY & NORMALIZATION ENGINE
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
   PLATFORM SCRAPERS & SCORERS
   ========================================================================== */
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
    const activeMonthsLast12 = [...activeMonths].filter((m) => (now - new Date(m + '-01').getTime()) / 86400000 <= 365).length;

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
    } catch {}

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
    { key: 'problemsAndDifficulty', label: 'Problem Solving (50 Pts)', max: 50, compute: () => (d.weightedSolving != null ? Math.min(50, (d.weightedSolving / 700) * 50) : null) },
    { key: 'contest', label: 'Contest Metrics (20 Pts)', max: 20, compute: () => ((d.rating != null ? Math.min(15, (d.rating / 1600) * 15) : 0) + (d.contestsAttended != null ? Math.min(5, (d.contestsAttended / 50) * 5) : 0)) },
    { key: 'diversity', label: 'Diversity (10 Pts)', max: 10, compute: () => Math.min(6, (Object.keys(d.topicCounts || {}).length / 15) * 6) + Math.min(4, (Object.keys(d.languageCounts || {}).length / 4) * 4) },
    { key: 'badgesAndConsistency', label: 'Badges & Consistency (10 Pts)', max: 10, compute: () => Math.min(4, (d.badgesCount || 0)) + Math.min(3, ((d.activeDaysLast12Months || 0) / 60) * 3) + ((d.activeDaysLast12Months || 0) > 10 ? 3 : 1) }
  ]);
}

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
    out.available = rating !== null || (easy + medium + hard + veryHard) > 0;
    out.rating = rating;
    out.stars = stars;
    out.problemsSolved = easy + medium + hard + veryHard;
    out.weightedSolved = easy * 1 + medium * 2 + hard * 3 + veryHard * 4;
    out.contestsCount = parseInt($('.contest-participated-count b').first().text().trim(), 10) || null;
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
    { key: 'rating', label: 'Rating (35 Pts)', max: 35, compute: () => (d.rating != null ? Math.min(35, (d.rating / 2000) * 35) : d.stars != null ? (d.stars / 7) * 35 : null) },
    { key: 'problems', label: 'Problems Solved (30 Pts)', max: 30, compute: () => (d.weightedSolved != null ? Math.min(30, (d.weightedSolved / 300) * 30) : null) },
    { key: 'contest', label: 'Contests (20 Pts)', max: 20, compute: () => (d.contestsCount != null ? Math.min(20, (d.contestsCount / 25) * 20) : null) },
    { key: 'difficulty', label: 'Difficulty (10 Pts)', max: 10, compute: () => (d.graphBuckets?.hard > 0 ? 10 : d.graphBuckets?.medium > 5 ? 7 : 4) },
    { key: 'consistency', label: 'Consistency (5 Pts)', max: 5, compute: () => (d.contestsCount > 5 ? 5 : 2) }
  ]);
}

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
    { key: 'badges', label: 'Skill Badges (35 Pts)', max: 35, compute: () => (d.badgeCategoryStars ? (d.badgeCategoryStars.problemSolving / 6) * 15 + (d.badgeCategoryStars.programmingLanguages / 6) * 10 + (d.badgeCategoryStars.specializedSkills / 6) * 5 + (d.badgeCategoryStars.tutorials / 6) * 5 : null) },
    { key: 'medals', label: 'Medals (25 Pts)', max: 25, compute: () => Math.min(25, (d.medals?.gold || 0) * 5 + (d.medals?.silver || 0) * 3 + (d.medals?.bronze || 0) * 1) },
    { key: 'problems', label: 'Verified Solves (40 Pts)', max: 40, compute: () => (d.problemsSolved != null ? Math.min(40, (d.problemsSolved / 100) * 40) : null) }
  ]);
}

async function fetchGitHub(username) {
  const out = { platform: 'github', available: false, username };
  try {
    const [userRes, reposRes] = await Promise.all([
      axios.get(`https://api.github.com/users/${username}`, { headers: UA }),
      axios.get(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers: UA }).catch(() => ({ data: [] }))
    ]);
    const profile = userRes.data;
    const repos = Array.isArray(reposRes.data) ? reposRes.data : [];

    let totalStars = 0, collaborations = 0, reposInLastYear = 0, reposInLast6Months = 0;
    const languageCounts = {};
    const oneYearAgo = Date.now() - 365 * 86400000;
    const sixMonthsAgo = Date.now() - 180 * 86400000;

    for (const r of repos) {
      if (r.fork) { collaborations++; continue; }
      totalStars += r.stargazers_count || 0;
      if (r.language) languageCounts[r.language] = (languageCounts[r.language] || 0) + 1;
      const updatedTime = new Date(r.updated_at).getTime();
      if (updatedTime >= oneYearAgo) reposInLastYear++;
      if (updatedTime >= sixMonthsAgo) reposInLast6Months++;
    }

    out.available = true;
    out.publicRepos = profile.public_repos || 0;
    out.totalStars = totalStars;
    out.collaborations = collaborations;
    out.reposInLastYear = Math.max(reposInLastYear, profile.public_repos || 0);
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
    { key: 'repos', label: 'Repositories (25 Pts)', max: 25, compute: () => (d.publicRepos != null ? Math.min(25, (d.publicRepos / 15) * 25) : null) },
    { key: 'stars', label: 'Stargazers (30 Pts)', max: 30, compute: () => (d.totalStars != null ? Math.min(30, (d.totalStars / 10) * 30) : null) },
    { key: 'diversity', label: 'Languages (25 Pts)', max: 25, compute: () => (d.languagesUsed != null ? Math.min(25, (d.languagesUsed / 5) * 25) : null) },
    {key: 'community',label: 'Followers & Reach (20 Pts)',max: 20,  compute: () => (d.followers != null ? Math.min(20, (d.followers / 20) * 20) : null)
}

  ]);
}

const FETCHERS = { leetcode: fetchLeetCode, codeforces: fetchCodeforces, codechef: fetchCodeChef, hackerrank: fetchHackerRank, github: fetchGitHub };
const SCORERS = { leetcode: scoreLeetCode, codeforces: scoreCodeforces, codechef: scoreCodeChef, hackerrank: scoreHackerRank, github: scoreGitHub };

/* ============================================================================
   RBU PLACEMENT EVALUATION SHEET MATRIX (100 MARKS MAX)
   ========================================================================== */
function calculateRbuPlacementScore(user, platforms) {
  const acad = user.academics || {};
  const exp = user.institutionalExperience || {};
  const breakdown = {};

  const pct10 = Number(acad.tenthPercentage) || 0;
  const s10 = pct10 >= 80 ? 5 : pct10 >= 75 ? 4 : pct10 >= 70 ? 3 : pct10 >= 65 ? 2 : pct10 > 0 ? 1 : 0;

  const pct12 = Number(acad.twelfthPercentage) || 0;
  const s12 = pct12 >= 80 ? 5 : pct12 >= 75 ? 4 : pct12 >= 70 ? 3 : pct12 >= 65 ? 2 : pct12 > 0 ? 1 : 0;

  const cgpa = Number(acad.cgpa) || 0;
  const sCgpa = cgpa >= 8.0 ? 5 : cgpa >= 7.5 ? 4 : cgpa >= 7.0 ? 3 : cgpa >= 6.5 ? 2 : cgpa > 0 ? 1 : 0;

  breakdown.academics = { s10, s12, sCgpa, total: s10 + s12 + sCgpa, max: 15 };

  const gh = platforms.github || {};
  let ghContributions = 0, ghCollab = 0, ghFreq = 0;
  if (gh.available) {
    const reposYr = gh.reposInLastYear || 0;
    ghContributions = reposYr > 20 ? 5 : reposYr >= 16 ? 4 : reposYr >= 11 ? 3 : reposYr >= 6 ? 2 : reposYr >= 1 ? 1 : 0;
    ghCollab = Math.min(6, (gh.collaborations || 0) * 2);
    const monthlyRate = (gh.reposInLast6Months || 0) / 6;
    ghFreq = monthlyRate >= 2 ? 4 : monthlyRate >= 1 ? 2 : 0;
  }
  breakdown.github = { contributions: ghContributions, collaborations: ghCollab, frequency: ghFreq, total: ghContributions + ghCollab + ghFreq, max: 15 };

  const hr = platforms.hackerrank || {};
  const lc = platforms.leetcode || {};
  const cf = platforms.codeforces || {};
  const cc = platforms.codechef || {};

  const hrBadges = hr.available ? (hr.badgesCount || 0) : 0;
  const fallbackBadges = hr.available ? hrBadges : (lc.badgesCount || 0);
  const sBadges = fallbackBadges >= 5 ? 5 : fallbackBadges === 4 ? 4 : fallbackBadges === 3 ? 3 : fallbackBadges === 2 ? 2 : fallbackBadges >= 1 ? 1 : 0;

  let totalMedHard = 0;
  if (hr.available && hr.problemsSolved) totalMedHard += (hr.badgeCategoryStars?.problemSolving >= 3 ? Math.round(hr.problemsSolved * 0.4) : 0);
  if (lc.available && lc.graphBuckets) totalMedHard += (lc.graphBuckets.medium || 0) + (lc.graphBuckets.hard || 0);
  if (cf.available && cf.graphBuckets) totalMedHard += (cf.graphBuckets.medium || 0) + (cf.graphBuckets.hard || 0);
  if (cc.available && cc.graphBuckets) totalMedHard += (cc.graphBuckets.medium || 0) + (cc.graphBuckets.hard || 0);

  const sMedHard = totalMedHard > 20 ? 5 : totalMedHard >= 16 ? 4 : totalMedHard >= 11 ? 3 : totalMedHard >= 6 ? 2 : totalMedHard >= 1 ? 1 : 0;
  const lcSolved = lc.available ? (lc.problemsSolved || 0) : 0;
  const sLc = lcSolved > 250 ? 10 : lcSolved >= 201 ? 9 : lcSolved >= 149 ? 8 : lcSolved >= 101 ? 7 : lcSolved >= 50 ? 6 : lcSolved >= 20 ? 5 : 0;

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

  const globalCertScore = (Number(exp.globalCertsCount) || 0) * 5;
  const nptelScore = Math.min(8, (Number(exp.nptelCoursesCount) || 0) * 4);
  const rbuCourseScore = Math.min(6, (Number(exp.rbuOnlineCoursesCount) || 0) * 3);
  breakdown.certifications = { global: globalCertScore, nptel: nptelScore, rbu: rbuCourseScore, total: Math.min(15, globalCertScore + nptelScore + rbuCourseScore), max: 15 };

  const industryProjects = (Number(exp.industryProjectsCount) || 0) * 5;
  const domainProjects = (Number(exp.domainProjectsCount) || 0) * 4;
  breakdown.projects = { industry: industryProjects, domain: domainProjects, total: Math.min(15, industryProjects + domainProjects), max: 15 };

  const hackFirst = (Number(exp.hackathonsFirstCount) || 0) * 5;
  const hackSecond = (Number(exp.hackathonsSecondCount) || 0) * 4;
  const hackThird = (Number(exp.hackathonsThirdCount) || 0) * 3;
  const hackPart = (Number(exp.hackathonsParticipationCount) || 0) * 2;
  breakdown.hackathons = { total: Math.min(10, hackFirst + hackSecond + hackThird + hackPart), max: 10 };

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

/* ============================================================================
   RANKING ENGINE
   ========================================================================== */
function getCpScore(candidate) {
  return Number(candidate.latestScore?.overallScore) || 0;
}

function getRbuScore(candidate) {
  return Number(candidate.latestScore?.rbuPlacement?.totalScore) || 0;
}

function calculateRankings(db) {
  const allCandidates = db.users.filter((u) => u.role === 'candidate');

  // 1. GLOBAL RANKING (Sorted strictly by CP Score descending)
  const globalSorted = [...allCandidates].sort((a, b) => getCpScore(b) - getCpScore(a));
  const globalRankMap = new Map();
  globalSorted.forEach((c, idx) => globalRankMap.set(c.username.toLowerCase(), idx + 1));

  // 2. COMMUNITY RANKINGS (Sorted strictly by RBU Placement Score descending)
  const communityRankMap = new Map();
  const communities = db.users.filter((u) => u.role === 'community');

  communities.forEach((lead) => {
    const memberUsernames = (lead.members || []).map((m) => m.toLowerCase());
    const communityCandidates = allCandidates
      .filter((c) => memberUsernames.includes(c.username.toLowerCase()))
      .sort((a, b) => getRbuScore(b) - getRbuScore(a));

    communityCandidates.forEach((c, idx) => {
      const key = `${lead.communityCode.toUpperCase()}__${c.username.toLowerCase()}`;
      communityRankMap.set(key, {
        rank: idx + 1,
        totalMembers: communityCandidates.length,
        communityName: lead.name,
        communityCode: lead.communityCode
      });
    });
  });

  return { globalRankMap, communityRankMap, globalTotal: allCandidates.length };
}

function attachRankingMetadata(user, db) {
  if (user.role !== 'candidate') return user;
  const { globalRankMap, communityRankMap, globalTotal } = calculateRankings(db);
  const username = user.username.toLowerCase();

  const currentGlobalRank = globalRankMap.get(username) || globalTotal;
  const allCommunityRanks = [];

  (user.communities || []).forEach((code) => {
    const key = `${code.toUpperCase()}__${username}`;
    const rankInfo = communityRankMap.get(key);
    if (rankInfo) {
      allCommunityRanks.push(rankInfo);
    } else {
      allCommunityRanks.push({
        rank: 1,
        totalMembers: 1,
        communityName: code,
        communityCode: code
      });
    }
  });

  const primaryCommInfo = allCommunityRanks[0] || null;

  user.rankings = {
    globalRank: currentGlobalRank,
    globalTotal,
    primaryCommunity: primaryCommInfo?.communityCode || null,
    communityRank: primaryCommInfo?.rank || null,
    allCommunityRanks
  };

  return user;
}

async function refreshCandidateLive(user, db) {
  try {
    const platforms = await normalizeCandidate(user.links);
    user.latestScore = analyzeCandidate(user, platforms);
    attachRankingMetadata(user, db);
    saveDB(db);
  } catch (err) {
    console.error(`Live refresh error for ${user.username}:`, err.message);
  }
  return user;
}

/* ============================================================================
   EXPRESS SERVER & API ROUTES
   ========================================================================== */
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

// Auth Routes
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

  if (newUser.role === 'candidate') {
    attachRankingMetadata(newUser, db);
    saveDB(db);
  }

  const { password: _, ...safeUser } = newUser;
  res.json({ message: 'Account created successfully', user: safeUser });
});

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

app.get('/api/user/:username', async (req, res) => {
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'candidate') {
    attachRankingMetadata(user, db);
  }

  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post('/api/user/recalculate', async (req, res) => {
  const { username } = req.body;
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  await refreshCandidateLive(user, db);
  const { password: _, ...safeUser } = user;
  res.json({ message: 'Live scoring matrix recalculated!', user: safeUser });
});

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

// Personalized ML Rank Simulation Engine
app.post('/api/user/simulate-rank-increase', (req, res) => {
  const { username } = req.body;
  const db = loadDB();
  const targetUser = db.users.find(
    (u) => u.username.toLowerCase() === (username || '').toLowerCase() && u.role === 'candidate'
  );
  if (!targetUser) return res.status(404).json({ error: 'Candidate not found.' });

  attachRankingMetadata(targetUser, db);
  const currentGlobalRank = targetUser.rankings.globalRank;
  const currentCommRank = targetUser.rankings.communityRank || 1;
  const baseCp = getCpScore(targetUser);
  const baseRbu = getRbuScore(targetUser);

  const allCandidates = db.users.filter((u) => u.role === 'candidate');
  const communityMembers = targetUser.rankings.primaryCommunity
    ? allCandidates.filter((c) => (c.communities || []).includes(targetUser.rankings.primaryCommunity))
    : allCandidates;

  const userPlatforms = targetUser.links || {};
  const summaries = targetUser.latestScore?.platformSummaries || [];
  const rbuBreakdown = targetUser.latestScore?.rbuPlacement?.breakdown || {};
  const exp = targetUser.institutionalExperience || {};

  // Build Personalized Recommendation Vectors based on ACTUAL candidate data
  const personalizedStrategies = [];

  // 1. LeetCode / Coding Platform DSA Headroom
  const lcSummary = summaries.find((p) => p.platform === 'leetcode');
  const hasCodingPlatform = userPlatforms.leetcode || userPlatforms.codeforces || userPlatforms.codechef;
  if (hasCodingPlatform) {
    const currentMedHard = rbuBreakdown.codingPlatforms?.mediumHard || 0;
    const canGainMedHard = currentMedHard < 5;
    const lift = canGainMedHard ? 6.5 : 3.0;

    personalizedStrategies.push({
      id: 'dsa_medium_headroom',
      title: 'Solve 10 Medium / Hard DSA Problems',
      description: `Targeting dynamic programming and tree algorithms on ${userPlatforms.leetcode ? 'LeetCode' : 'Codeforces'}`,
      cpLift: 5.5,
      rbuLift: canGainMedHard ? 4.0 : 2.0,
      focusPlatform: userPlatforms.leetcode ? 'LeetCode' : 'Codeforces'
    });
  } else {
    // If user hasn't linked LeetCode/Codeforces, suggest linking it first
    personalizedStrategies.push({
      id: 'connect_leetcode',
      title: 'Link LeetCode or Codeforces Profile',
      description: 'Your CP Signal denominator is missing primary problem solving weight (+2.0x multiplier)',
      cpLift: 15.0,
      rbuLift: 8.0,
      focusPlatform: 'LeetCode'
    });
  }

  // 2. GitHub Software Engineering Velocity
  const ghSummary = summaries.find((p) => p.platform === 'github');
  if (userPlatforms.github) {
    const currentContribScore = rbuBreakdown.github?.contributions || 0;
    const currentFreq = rbuBreakdown.github?.frequency || 0;
    const ghHeadroom = (5 - currentContribScore) + (4 - currentFreq);

    if (ghHeadroom > 0) {
      personalizedStrategies.push({
        id: 'github_active_commits',
        title: 'Push 2 New Repositories & Maintain Bi-Weekly Activity',
        description: `Your GitHub velocity score is currently at ${rbuBreakdown.github?.total || 0}/15 M. Increasing commit frequency yields immediate points.`,
        cpLift: 3.5,
        rbuLift: Math.min(6.0, ghHeadroom * 1.5),
        focusPlatform: 'GitHub'
      });
    }
  } else {
    personalizedStrategies.push({
      id: 'connect_github',
      title: 'Link Verified GitHub Profile',
      description: 'Unlock 15 Marks on the RBU Placement Sheet and a 2.0x multiplier on CP Signal',
      cpLift: 12.0,
      rbuLift: 10.0,
      focusPlatform: 'GitHub'
    });
  }

  // 3. RBU Institutional Certifications Headroom
  const certTotal = rbuBreakdown.certifications?.total || 0;
  if (certTotal < 15) {
    const needed = 15 - certTotal;
    personalizedStrategies.push({
      id: 'clear_global_cert',
      title: 'Complete 1 Global Cloud/Security Certification',
      description: `Current Certifications: ${certTotal}/15 M. Adding an AWS/Azure/GCP credential grants +5 Marks directly to RBU ranking.`,
      cpLift: 0.0,
      rbuLift: Math.min(5.0, needed),
      focusPlatform: 'Institutional'
    });
  }

  // 4. SIH / Industry Problem Statement Projects
  const projTotal = rbuBreakdown.projects?.total || 0;
  if (projTotal < 15) {
    personalizedStrategies.push({
      id: 'complete_industry_project',
      title: 'Document 1 SIH / Industry Mentored Problem Statement',
      description: `Current Project Mark: ${projTotal}/15 M. An industry-aligned solution adds up to +5 Marks to your placement score.`,
      cpLift: 2.0,
      rbuLift: 5.0,
      focusPlatform: 'Institutional'
    });
  }

  // 5. Hackathon Podium Placements
  const hackTotal = rbuBreakdown.hackathons?.total || 0;
  if (hackTotal < 10) {
    personalizedStrategies.push({
      id: 'hackathon_podium',
      title: 'Win or Place in an Accredited Hackathon',
      description: `Current Hackathon Points: ${hackTotal}/10 M. Securing a 1st or 2nd prize adds +4 to +5 Marks.`,
      cpLift: 3.0,
      rbuLift: Math.min(5.0, 10 - hackTotal),
      focusPlatform: 'Competitions'
    });
  }

  // Calculate Relative Cohort Rank Deltas based on the candidate's personal lifts
  const recommendations = personalizedStrategies.map((strat) => {
    const simulatedCp = Math.min(100, baseCp + strat.cpLift);
    const simulatedRbu = Math.min(100, baseRbu + strat.rbuLift);

    // Global Rank: Evaluated strictly by simulated CP Score
    const newGlobalRank = allCandidates.filter(
      (c) => c.username.toLowerCase() !== targetUser.username.toLowerCase() && getCpScore(c) > simulatedCp
    ).length + 1;

    // Community Rank: Evaluated strictly by simulated RBU Placement Score
    const newCommRank = communityMembers.filter(
      (c) => c.username.toLowerCase() !== targetUser.username.toLowerCase() && getRbuScore(c) > simulatedRbu
    ).length + 1;

    const globalDelta = Math.max(0, currentGlobalRank - newGlobalRank);
    const commDelta = Math.max(0, currentCommRank - newCommRank);

    return {
      ...strat,
      simulatedScore: simulatedRbu,
      predictedGlobalRank: newGlobalRank,
      predictedCommunityRank: newCommRank,
      globalRankIncrease: globalDelta,
      communityRankIncrease: commDelta
    };
  });

  // Sort by highest combined impact on candidate's ranks
  recommendations.sort(
    (a, b) => (b.communityRankIncrease + b.globalRankIncrease) - (a.communityRankIncrease + a.globalRankIncrease)
  );

  res.json({
    currentGlobalRank,
    currentCommunityRank: currentCommRank,
    baseCp,
    baseRbu,
    recommendations
  });
});

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

app.post('/api/user/delete-account', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const userIdx = db.users.findIndex((u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password);
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

// Community Routes
app.post('/api/community/student-request', (req, res) => {
  const { studentUsername, communityCode } = req.body;
  const db = loadDB();
  const codeClean = (communityCode || '').trim().toUpperCase();
  const lead = db.users.find((u) => u.role === 'community' && (u.communityCode || '').toUpperCase() === codeClean);
  if (!lead) return res.status(404).json({ error: 'Invalid Community Code. Verify the code with your lead.' });

  const student = db.users.find((u) => u.username.toLowerCase() === studentUsername.toLowerCase());
  lead.members = lead.members || [];
  lead.pendingRequests = lead.pendingRequests || [];

  if (lead.members.includes(student.username)) return res.status(400).json({ error: 'You are already a member of this community.' });
  if (lead.pendingRequests.includes(student.username)) return res.status(400).json({ error: 'Join request already submitted. Awaiting lead approval.' });

  lead.pendingRequests.push(student.username);
  saveDB(db);
  res.json({ message: `Request successfully sent to ${lead.name} (${codeClean})!` });
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
  
  if (!lead) return res.status(404).json({ error: 'Community lead not found.' });
  if (!student) return res.status(404).json({ error: `Candidate @${studentUsername} not found. Please enter their exact handle.` });

  lead.members = lead.members || [];
  if (lead.members.includes(student.username)) {
    return res.status(400).json({ error: 'Candidate is already a verified member of your community.' });
  }

  student.incomingInvites = student.incomingInvites || [];
  if (student.incomingInvites.some((inv) => inv.code === lead.communityCode)) {
    return res.status(400).json({ error: 'Invitation already pending for this candidate.' });
  }

  student.incomingInvites.push({
    code: lead.communityCode,
    communityName: lead.name,
    invitedAt: new Date().toISOString()
  });

  saveDB(db);
  res.json({ message: `Invitation successfully dispatched to @${student.username}!` });
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
  attachRankingMetadata(student, db);
  saveDB(db);

  const { password: _, ...safeUser } = student;
  res.json({ message: `Invitation ${action === 'accept' ? 'accepted' : 'declined'}.`, user: safeUser });
});

app.get('/api/admin/cohort/:adminUsername', async (req, res) => {
  const db = loadDB();
  const lead = db.users.find((u) => u.username.toLowerCase() === req.params.adminUsername.toLowerCase());
  if (!lead) return res.status(404).json({ error: 'Admin not found.' });

  const verifiedCohort = db.users.filter((u) => u.role === 'candidate' && (lead.members || []).includes(u.username));
  await Promise.all(verifiedCohort.map((c) => refreshCandidateLive(c, db)));

  verifiedCohort.forEach((c) => attachRankingMetadata(c, db));
  verifiedCohort.sort((a, b) => getRbuScore(b) - getRbuScore(a));

  const cleanCohort = verifiedCohort.map(({ password: _, ...rest }) => rest);
  const pendingRequests = db.users.filter((u) => (lead.pendingRequests || []).includes(u.username)).map((u) => ({ name: u.name, username: u.username, email: u.email }));

  res.json({ communityCode: lead.communityCode, cohort: cleanCohort, pendingRequests });
});

app.get('/api/admin/export-csv/:adminUsername', async (req, res) => {
  const db = loadDB();
  const lead = db.users.find((u) => u.username.toLowerCase() === req.params.adminUsername.toLowerCase());
  if (!lead) return res.status(404).send('Admin not found');

  const candidates = db.users.filter((u) => u.role === 'candidate' && (lead.members || []).includes(u.username));
  await Promise.all(candidates.map((c) => refreshCandidateLive(c, db)));
  candidates.forEach((c) => attachRankingMetadata(c, db));
  candidates.sort((a, b) => getRbuScore(b) - getRbuScore(a));

  const headers = ['Community RBU Rank', 'Global CP Rank', 'Username', 'Name', 'Email', 'RBU Placement Score', 'CP Signal Index', '10th %', '12th %', 'CGPA', 'LeetCode Solves', 'GitHub Repos', 'Last Synced'];
  const rows = candidates.map((c, idx) => {
    const lcSummary = c.latestScore?.platformSummaries?.find((p) => p.platform === 'leetcode');
    const ghSummary = c.latestScore?.platformSummaries?.find((p) => p.platform === 'github');
    return [
      `"#${idx + 1}"`, `"#${c.rankings?.globalRank || 'N/A'}"`, `"${c.username}"`, `"${c.name}"`, `"${c.email}"`,
      c.latestScore?.rbuPlacement?.totalScore ?? 'N/A', c.latestScore?.overallScore ?? 'N/A',
      c.academics?.tenthPercentage || 'N/A', c.academics?.twelfthPercentage || 'N/A', c.academics?.cgpa || 'N/A',
      lcSummary?.problemsSolved ?? 'N/A', ghSummary?.problemsSolved ?? 'N/A', `"${c.latestScore?.lastUpdated || new Date().toISOString()}"`
    ];
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${lead.communityCode}_cohort_ranks.csv"`);
  res.send([headers.join(','), ...rows.map((r) => r.join(','))].join('\n'));
});

// ATS Audit Endpoint
app.get('/api/ats/roles', (req, res) => {
  const roles = Object.entries(ROLE_PRESETS).map(([id, r]) => ({ id, title: r.title, keywordsCount: r.keywords.length }));
  res.json({ roles });
});

app.post('/api/ats/audit', upload.single('resumeFile'), async (req, res) => {
  try {
    let { resumeText, jobDescription, targetRole, username } = req.body;
    if (req.file) {
      if (req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
        resumeText = await new Promise((resolve, reject) => {
          const pdfParser = new PDFParser(null, 1);
          pdfParser.on('pdfParser_dataError', (errData) => reject(errData.parserError));
          pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
          pdfParser.parseBuffer(req.file.buffer);
        });
      } else {
        resumeText = req.file.buffer.toString('utf-8');
      }
    }

    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ error: 'Please upload a resume file (.pdf, .txt) or paste your resume text.' });
    }

    const db = loadDB();
    const candidateUser = db.users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());
    const result = auditResumeAgainstJob({ resumeText, jobDescription, targetRole, candidateUser });
    res.json({ ...result, extractedResumeText: resumeText });
  } catch (err) {
    console.error('ATS Audit Error:', err);
    res.status(500).json({ error: 'Failed to process resume file: ' + err.message });
  }
});

/* ============================================================================
   ATS RESUME GENERATOR (Gemini & DOCX)
   ========================================================================== */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const PROFILE_BASE = {
  github: 'https://github.com/',
  linkedin: 'https://www.linkedin.com/in/',
  leetcode: 'https://leetcode.com/u/',
  codeforces: 'https://codeforces.com/profile/',
  codechef: 'https://www.codechef.com/users/',
  hackerrank: 'https://www.hackerrank.com/profile/'
};
const LINK_LABELS = { github: 'GitHub', linkedin: 'LinkedIn', leetcode: 'LeetCode', codeforces: 'Codeforces' };

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const strList = (v) => arr(v).map(str).filter(Boolean);

function buildHeader(user, details) {
  const links = [];
  for (const key of ['linkedin', 'github', 'leetcode', 'codeforces']) {
    const raw = user.links?.[key];
    if (!raw) continue;
    let url = raw.trim();
    if (!/^https?:\/\//i.test(url)) {
      const uname = key === 'linkedin' ? url.replace(/^\/+|\/+$/g, '') : parseProfileInput(key, url)?.username;
      url = PROFILE_BASE[key] + uname;
    }
    links.push({ label: LINK_LABELS[key], url });
  }
  return {
    name: user.name,
    email: user.email,
    phone: String(details.phone || '').trim(),
    location: String(details.location || '').trim(),
    links
  };
}

function buildCodingFacts(user) {
  const s = user.latestScore;
  if (!s) return null;
  const solved = {};
  let githubRepos = null;
  for (const p of s.platformSummaries || []) {
    if (!p.available || !p.problemsSolved) continue;
    if (p.platform === 'github') githubRepos = p.problemsSolved;
    else solved[p.platform] = p.problemsSolved;
  }
  return {
    problemsSolvedByPlatform: solved,
    githubPublicRepos: githubRepos,
    difficultySplit: s.difficultyProfile?.totals || null,
    contestsParticipated: s.contestPerformance?.total || 0,
    strongTopics: (s.swot?.strengths || []).map((t) => t.topic),
    topLanguages: (s.languageAnalysis || []).slice(0, 5).map((l) => l.language)
  };
}

const RESUME_SYSTEM_PROMPT = `You are an expert technical recruiter and ATS resume writer for STUDENTS and fresh graduates.
Write a one-page, ATS-friendly resume tailored to the target role.

HARD RULES:
- Use ONLY facts in the provided JSON. NEVER invent employers, projects, metrics, tools, certifications or dates.
- Rewrite weak descriptions into concise bullets starting with strong action verbs (Built, Designed, Implemented, Optimized, Automated...).
- Format: action + what/how (tools) + outcome, but only state outcomes the student actually gave.
- Mirror terminology from target role and job description where student genuinely has that skill.
- Plain text only: no markdown, no emojis, no first-person pronouns.
- Group skills into categories (Languages, Frameworks, Databases, Tools, Core CS).
- Ensure section headers and structure strictly match standard ATS expectations.

Return ONLY valid JSON in exactly this shape:
{
 "summary": "",
 "skills": [{"category": "", "items": [""]}],
 "education": [{"institution": "", "degree": "", "period": "", "score": ""}],
 "experience": [{"title": "", "organization": "", "period": "", "bullets": [""]}],
 "projects": [{"name": "", "tech": "", "link": "", "bullets": [""]}],
 "codingProfile": [""],
 "certifications": [""],
 "achievements": [""],
 "atsKeywords": [""],
 "tips": [""]
}`;

async function callGemini(userPrompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured on the server.');

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const { data } = await axios.post(
    url,
    {
      systemInstruction: { parts: [{ text: RESUME_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { 
        temperature: 0.4, 
        maxOutputTokens: 8192, 
        responseMimeType: 'application/json' 
      }
    },
    { 
      headers: { 
        'x-goog-api-key': GEMINI_API_KEY, 
        'Content-Type': 'application/json' 
      }, 
      timeout: 60000 
    }
  );

  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini returned an empty response.');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

function normalizeResume(raw, header, allowedLinks = null) {
  const r = raw || {};
  return {
    header,
    summary: str(r.summary),
    skills: arr(r.skills).map((s) => ({ category: str(s.category), items: strList(s.items) })).filter((s) => s.items.length),
    education: arr(r.education).map((e) => ({ institution: str(e.institution), degree: str(e.degree), period: str(e.period), score: str(e.score) })).filter((e) => e.institution || e.degree),
    experience: arr(r.experience).map((e) => ({ title: str(e.title), organization: str(e.organization), period: str(e.period), bullets: strList(e.bullets) })).filter((e) => e.title || e.organization),
    projects: arr(r.projects).map((p) => {
      const link = str(p.link);
      const ok = allowedLinks ? allowedLinks.includes(link) : /^https?:\/\//i.test(link);
      return { name: str(p.name), tech: str(p.tech), link: ok ? link : '', bullets: strList(p.bullets) };
    }).filter((p) => p.name),
    codingProfile: strList(r.codingProfile),
    certifications: strList(r.certifications),
    achievements: strList(r.achievements),
    atsKeywords: strList(r.atsKeywords),
    tips: strList(r.tips)
  };
}

const repoKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function ghHeaders() {
  const h = { ...UA, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function fetchOwnRepos(owner) {
  const { data } = await axios.get(`https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`, { headers: ghHeaders(), timeout: 15000 });
  return Array.isArray(data) ? data : [];
}

function rankRepos(repos, owner) {
  return repos.filter((r) => !r.fork && r.size > 0 && r.name.toLowerCase() !== owner.toLowerCase()).sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || (b.size || 0) - (a.size || 0));
}

function cleanReadme(md = '') {
  return String(md).replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
}

async function getFlagshipRepo(githubRaw) {
  const owner = parseProfileInput('github', githubRaw)?.username;
  if (!owner) return null;
  const top = rankRepos(await fetchOwnRepos(owner), owner)[0];
  if (!top) return null;

  const [langRes, readmeRes] = await Promise.all([
    axios.get(`https://api.github.com/repos/${owner}/${top.name}/languages`, { headers: ghHeaders(), timeout: 15000 }).catch(() => ({ data: {} })),
    axios.get(`https://api.github.com/repos/${owner}/${top.name}/readme`, { headers: { ...ghHeaders(), Accept: 'application/vnd.github.raw+json' }, timeout: 15000, transformResponse: [(d) => d] }).catch(() => ({ data: '' }))
  ]);

  const entries = Object.entries(langRes.data || {});
  const totalBytes = entries.reduce((s, [, b]) => s + b, 0) || 1;
  const languages = entries.sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, bytes]) => ({ name, percent: Math.round((bytes / totalBytes) * 100) }));

  return {
    name: top.name,
    displayName: top.name.replace(/[-_]+/g, ' '),
    url: top.html_url,
    description: top.description || '',
    topics: top.topics || [],
    stars: top.stargazers_count || 0,
    forks: top.forks_count || 0,
    sizeKB: top.size || 0,
    languages,
    tech: [...languages.map((l) => l.name), ...(top.topics || []).slice(0, 3)].join(', '),
    readmeExcerpt: cleanReadme(readmeRes.data)
  };
}

async function fetchTopRepos(githubRaw, limit = 4) {
  const owner = parseProfileInput('github', githubRaw)?.username;
  if (!owner) return [];
  return rankRepos(await fetchOwnRepos(owner), owner).slice(0, limit).map((r, i) => ({
    name: r.name.replace(/[-_]+/g, ' '),
    tech: [r.language, ...(r.topics || []).slice(0, 4)].filter(Boolean).join(', '),
    description: r.description || '',
    repo: r.name,
    repoUrl: r.html_url,
    flagship: i === 0,
    stars: r.stargazers_count || 0
  }));
}

function mergeFlagship(projects, flagship, ghUser) {
  const prefix = ghUser ? `https://github.com/${ghUser}/`.toLowerCase() : null;
  const clean = projects.map((p) => ({
    name: str(p.name),
    tech: str(p.tech),
    description: str(p.description),
    repoUrl: prefix && str(p.repoUrl).toLowerCase().startsWith(prefix) ? str(p.repoUrl) : undefined
  }));
  if (!flagship) return clean;

  const github = { stars: flagship.stars, forks: flagship.forks, sizeKB: flagship.sizeKB, languages: flagship.languages, topics: flagship.topics, readmeExcerpt: flagship.readmeExcerpt };
  const i = clean.findIndex((p) => p.repoUrl === flagship.url || repoKey(p.name) === repoKey(flagship.name));
  if (i >= 0) {
    const [p] = clean.splice(i, 1);
    clean.unshift({ ...p, name: p.name || flagship.displayName, tech: p.tech || flagship.tech, description: p.description || flagship.description, repoUrl: flagship.url, github });
  } else {
    clean.unshift({ name: flagship.displayName, tech: flagship.tech, description: flagship.description, repoUrl: flagship.url, github });
  }
  return clean.slice(0, 6);
}

app.post('/api/resume/generate', async (req, res) => {
  const { username, targetRole, jobDescription, details = {} } = req.body || {};
  const role = str(targetRole).slice(0, 100);
  if (!role) return res.status(400).json({ error: 'Target position is required.' });

  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase() && u.role === 'candidate');
  if (!user) return res.status(404).json({ error: 'Candidate not found.' });

  const header = buildHeader(user, details);
  const ghUser = user.links?.github ? parseProfileInput('github', user.links.github)?.username : null;
  let flagship = null;
  if (ghUser && details.includeTopRepo !== false) {
    try { flagship = await getFlagshipRepo(user.links.github); }
    catch (err) { console.warn('Flagship repo lookup failed:', err.message); }
  }
  const projects = mergeFlagship(arr(details.projects).slice(0, 6), flagship, ghUser);
  const allowedLinks = projects.map((p) => p.repoUrl).filter(Boolean);

  const facts = {
    targetRole: role,
    jobDescription: str(jobDescription).slice(0, 6000) || null,
    student: {
      college: str(details.college),
      degree: str(details.degree),
      graduationYear: str(details.gradYear),
      academics: {
        cgpa: user.academics?.cgpa || null,
        tenthPercentage: user.academics?.tenthPercentage || null,
        twelfthPercentage: user.academics?.twelfthPercentage || null
      },
      skills: str(details.skills),
      projects,
      experience: arr(details.experience).slice(0, 6),
      certifications: str(details.certifications),
      achievements: str(details.achievements)
    },
    codingStats: buildCodingFacts(user)
  };

  try {
    const raw = await callGemini(`Student facts (JSON):\n${JSON.stringify(facts, null, 2)}`);
    res.json({ resume: normalizeResume(raw, header, allowedLinks) });
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.message;
    console.error('Resume generation failed:', reason);
    res.status(502).json({ error: `Resume generation failed: ${reason}` });
  }
});

function resumeToDocx(r) {
  const FONT = 'Calibri';
  const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 21, ...o });
  const center = (text, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(text, o)] });
  const section = (title) => new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
    children: [run(title.toUpperCase(), { bold: true, size: 22 })]
  });
  const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [run(t)] });
  const row = (left, right) => new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9906 }],
    spacing: { before: 80 },
    children: [run(left, { bold: true }), ...(right ? [run(`\t${right}`)] : [])]
  });

  const h = r.header;
  const k = [center(h.name, { bold: true, size: 34 })];
  const contact = [h.email, h.phone, h.location].filter(Boolean).join(' | ');
  if (contact) k.push(center(contact));
  if (h.links.length) k.push(center(h.links.map((l) => `${l.label}: ${l.url}`).join(' | ')));

  if (r.summary) k.push(section('Professional Summary'), new Paragraph({ children: [run(r.summary)] }));

  if (r.education.length) {
    k.push(section('Education'));
    r.education.forEach((e) => {
      k.push(row(e.institution, e.period));
      const line = [e.degree, e.score].filter(Boolean).join(' | ');
      if (line) k.push(new Paragraph({ children: [run(line)] }));
    });
  }
  if (r.skills.length) {
    k.push(section('Technical Skills'));
    r.skills.forEach((s) => k.push(new Paragraph({ spacing: { after: 40 }, children: [run(`${s.category}: `, { bold: true }), run(s.items.join(', '))] })));
  }
  if (r.projects.length) {
    k.push(section('Projects'));
    r.projects.forEach((p) => {
      k.push(row(p.tech ? `${p.name} | ${p.tech}` : p.name));
      if (p.link) k.push(new Paragraph({ children: [run(p.link, { size: 19 })] }));
      p.bullets.forEach((b) => k.push(bullet(b)));
    });
  }
  if (r.experience.length) {
    k.push(section('Experience'));
    r.experience.forEach((e) => {
      k.push(row([e.title, e.organization].filter(Boolean).join(' | '), e.period));
      e.bullets.forEach((b) => k.push(bullet(b)));
    });
  }
  if (r.codingProfile.length) { k.push(section('Coding Profile')); r.codingProfile.forEach((b) => k.push(bullet(b))); }
  if (r.certifications.length) { k.push(section('Certifications')); r.certifications.forEach((b) => k.push(bullet(b))); }
  if (r.achievements.length) { k.push(section('Achievements')); r.achievements.forEach((b) => k.push(bullet(b))); }

  return new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 850, bottom: 850, left: 1000, right: 1000 } } },
      children: k
    }]
  });
}

app.post('/api/resume/docx', async (req, res) => {
  try {
    const resume = req.body?.resume;
    if (!resume?.header?.name) return res.status(400).json({ error: 'Resume data missing.' });
    const buffer = await Packer.toBuffer(resumeToDocx(normalizeResume(resume, resume.header)));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.docx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Could not build the DOCX file.' });
  }
});

function normLang(name) {
  const n = String(name || '');
  if (/kotlin/i.test(n)) return 'Kotlin';
  if (/c\+\+/i.test(n)) return 'C++';
  if (/c#/i.test(n)) return 'C#';
  if (/python|pypy/i.test(n)) return 'Python';
  if (/typescript/i.test(n)) return 'TypeScript';
  if (/javascript|node\.?js/i.test(n)) return 'JavaScript';
  if (/\bjava\b/i.test(n)) return 'Java';
  if (/rust/i.test(n)) return 'Rust';
  if (/^go\b|golang/i.test(n)) return 'Go';
  if (/^(gnu )?c(\d+)?\b/i.test(n)) return 'C';
  return n.trim();
}

app.get('/api/resume/prefill/:username', async (req, res) => {
  const db = loadDB();
  const user = db.users.find((u) => u.username.toLowerCase() === req.params.username.toLowerCase() && u.role === 'candidate');
  if (!user) return res.status(404).json({ error: 'Candidate not found.' });

  const s = user.latestScore;
  const exp = user.institutionalExperience || {};
  const n = (v) => Number(v) || 0;
  const plural = (c, word) => `${c} ${word}${c === 1 ? '' : 's'}`;
  const notes = [];

  const langs = [...new Set((s?.languageAnalysis || []).map((l) => normLang(l.language)).filter(Boolean))].slice(0, 7);
  const topics = (s?.swot?.strengths || []).map((t) => t.topic);
  const skills = [...new Set([
    ...langs,
    ...(s?.difficultyProfile?.total > 0 ? ['Data Structures & Algorithms'] : []),
    ...topics
  ])].join(', ');

  let projects = [];
  if (user.links?.github) {
    try { projects = await fetchTopRepos(user.links.github); }
    catch (err) { notes.push('Could not read your GitHub repositories right now, so add projects manually.'); }
  } else {
    notes.push('No GitHub profile is linked, so add projects manually.');
  }

  const experience = [];
  if (exp.internationalInternship) experience.push({ role: 'International Internship / Credit Transfer', org: '', period: '', description: '' });
  for (let i = 0; i < n(exp.reputedInternshipsCount); i++) experience.push({ role: 'Intern', org: '', period: '', description: '' });
  for (let i = 0; i < n(exp.eduskillsInternshipsCount); i++) experience.push({ role: 'Intern', org: 'EduSkills', period: '', description: '' });

  const ach = [];
  if (n(exp.hackathonsFirstCount)) ach.push(`Won 1st prize in ${plural(n(exp.hackathonsFirstCount), 'hackathon/competition')}`);
  if (n(exp.hackathonsSecondCount)) ach.push(`Won 2nd prize in ${plural(n(exp.hackathonsSecondCount), 'hackathon/competition')}`);
  if (n(exp.hackathonsThirdCount)) ach.push(`Received 3rd place/consolation prize in ${plural(n(exp.hackathonsThirdCount), 'hackathon/competition')}`);
  if (n(exp.hackathonsParticipationCount)) ach.push(`Participated in ${plural(n(exp.hackathonsParticipationCount), 'hackathon/coding competition')}`);

  res.json({ skills, projects, experience, achievements: ach.join('\n'), note: notes.join(' ') });
});

const server = app.listen(PORT, () => {
  console.log(`Candidate Dashboard server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is busy. Kill the zombie process and restart.`);
    process.exit(1);
  } else {
    throw err;
  }
});