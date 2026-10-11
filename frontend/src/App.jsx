import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import './styles.css';

const API_BASE = 'http://localhost:5050';
const PLATFORM_COLORS = { leetcode: '#F5A623', codeforces: '#5B8DEF', codechef: '#8B6FE0', hackerrank: '#4FD1C5' };
const PLATFORM_LABELS = { leetcode: 'LeetCode', codeforces: 'Codeforces', codechef: 'CodeChef', hackerrank: 'HackerRank' };

async function analyzeCandidate(profiles) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Analysis failed');
  return data;
}

function InputForm({ onAnalyze, loading, hasResult }) {
  const [values, setValues] = useState({ leetcode: '', codeforces: '', codechef: '', hackerrank: '' });
  const filledCount = Object.values(values).filter((v) => v.trim()).length;

  const fields = [
    { key: 'leetcode', label: 'LeetCode', placeholder: 'username or URL' },
    { key: 'codeforces', label: 'Codeforces', placeholder: 'handle or URL' },
    { key: 'codechef', label: 'CodeChef', placeholder: 'username or URL' },
    { key: 'hackerrank', label: 'HackerRank', placeholder: 'username or URL' }
  ];

  function handleSubmit(e) {
    e.preventDefault();
    if (!filledCount || loading) return;
    onAnalyze(values);
  }

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <div className="input-form__grid">
        {fields.map((f) => (
          <div className="input-field" key={f.key}>
            <label htmlFor={f.key}>
              <span className="input-field__swatch" style={{ background: PLATFORM_COLORS[f.key] }} />
              {f.label}
            </label>
            <input
              id={f.key}
              type="text"
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
      <div className="input-form__actions">
        <button className="btn-primary" type="submit" disabled={!filledCount || loading}>
          {loading ? 'Normalizing profiles…' : hasResult ? 'Re-run analysis' : 'Build candidate dashboard'}
        </button>
        <span className="input-form__hint">
          {filledCount === 0 ? 'Enter at least one username or profile link.' : `Analyzing ${filledCount} provided platform${filledCount > 1 ? 's' : ''}.`}
        </span>
      </div>
    </form>
  );
}

function FinalCandidateDashboard({ data }) {
  const { score } = data;
  const tone = score.dataConfidence.platformsAvailable >= 3 ? 'strong' : score.dataConfidence.platformsAvailable === 2 ? 'moderate' : score.dataConfidence.platformsAvailable === 1 ? 'limited' : 'none';

  const chartData = score.platformSummaries.map((p) => ({
    name: PLATFORM_LABELS[p.platform] || p.platform,
    platform: p.platform,
    score: p.available && p.platformScore != null ? p.platformScore : 0,
    available: p.available
  }));

  const contestChartData = Object.entries(score.contestPerformance.byPlatform)
    .filter(([_, count]) => count !== null)
    .map(([platform, count]) => ({
      name: PLATFORM_LABELS[platform] || platform,
      platform,
      contests: count
    }));

  const radarData = Object.entries(score.topicMastery).map(([topic, val]) => ({
    topic: topic.length > 14 ? topic.split(' & ')[0] : topic,
    score: val
  }));

  const { totals, percentages, total } = score.difficultyProfile;
  const diffSegments = total ? [
    { key: 'easy', label: 'Easy (W: 1)', color: '#4FD1C5', pct: percentages.easy, count: totals.easy },
    { key: 'medium', label: 'Medium (W: 2)', color: '#F0A857', pct: percentages.medium, count: totals.medium },
    { key: 'hard', label: 'Hard (W: 3)', color: '#E5636B', pct: percentages.hard, count: totals.hard }
  ] : [];

  return (
    <div className="dashboard">
      <section className="card card--hero">
        <div className="hero-score">
          <span className="hero-score__number mono">{score.overallScore ?? '—'}</span>
          <span className="hero-score__scale">/ 100</span>
        </div>
        <div className="hero-meta">
          <h2>Total Candidate Score</h2>
          <div className={`confidence-badge confidence-badge--${tone}`}>
            <span className="confidence-badge__dot" />
            <span>{score.dataConfidence.label} — {score.dataConfidence.platformsAvailable} of {score.dataConfidence.platformsRequested} platforms connected</span>
          </div>
        </div>
      </section>

      {/* Platform Wise Breakdowns */}
      <section className="card">
        <h3 className="card__title">Platform Scoring & Renormalization Matrix</h3>
        <p className="card__subtitle">Components dropped due to private/unscraped data are excluded and scaled to 100%.</p>
        <div className="platform-grid">
          {score.platformSummaries.map((p) => (
            <div className="platform-card" key={p.platform} style={{ borderTopColor: PLATFORM_COLORS[p.platform] }}>
              <div className="platform-card__header">
                <span className="platform-card__name">{PLATFORM_LABELS[p.platform]}</span>
                <span className="platform-card__score mono">{p.available ? `${p.platformScore}/100` : 'N/A'}</span>
              </div>
              {p.available ? (
                <>
                  <div className="platform-card__formula mono">
                    Base: {p.achieved} / {p.maxAvailable} pts
                  </div>
                  <table className="breakdown-table mono">
                    <tbody>
                      {p.scoreBreakdown
                        .filter((b) => b.available)
                        .map((b) => (
                          <tr key={b.key}>
                            <td>{b.label}</td>
                            <td>{`${b.points}/${b.max}`}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div className="empty-note">Platform not configured or data unavailable</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Platform Comparison Bar Chart */}
      <section className="card">
        <h3 className="card__title">Platform Normalized Comparison</h3>
        <p className="card__subtitle">Comparison of scores across connected coding platforms (each out of 100).</p>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--hairline)' }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--hairline)' }} tickLine={false} width={45} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 13 }}
                formatter={(val, _, entry) => [entry.payload.available ? `${val} / 100` : 'No Data', 'Normalized Score']}
              />
              <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {chartData.map((d) => <Cell key={d.platform} fill={d.available ? PLATFORM_COLORS[d.platform] : 'var(--hairline)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* SWOT Analysis Board */}
      <section className="card">
        <h3 className="card__title">SWOT Analysis Board</h3>
        <p className="card__subtitle">Calculated from DSA taxonomy mastery; high-stakes topics categorized as threats when score &lt; 30.</p>
        <div className="swot-grid">
          <div className="swot-quadrant swot-quadrant--s">
            <h4>Strengths <span>({score.swot.strengths.length})</span></h4>
            <ul className="swot-list">
              {score.swot.strengths.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              {score.swot.strengths.length === 0 && <span className="empty-note">None identified</span>}
            </ul>
          </div>
          <div className="swot-quadrant swot-quadrant--w">
            <h4>Weaknesses <span>({score.swot.weaknesses.length})</span></h4>
            <ul className="swot-list">
              {score.swot.weaknesses.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              {score.swot.weaknesses.length === 0 && <span className="empty-note">None identified</span>}
            </ul>
          </div>
          <div className="swot-quadrant swot-quadrant--o">
            <h4>Opportunities <span>({score.swot.opportunities.length})</span></h4>
            <ul className="swot-list">
              {score.swot.opportunities.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              {score.swot.opportunities.length === 0 && <span className="empty-note">None identified</span>}
            </ul>
          </div>
          <div className="swot-quadrant swot-quadrant--t">
            <h4>Threats (High Stakes) <span>({score.swot.threats.length})</span></h4>
            <ul className="swot-list">
              {score.swot.threats.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              {score.swot.threats.length === 0 && <span className="empty-note">None identified</span>}
            </ul>
          </div>
        </div>
      </section>

      {/* Topic Radar & Difficulty Profiles */}
      <div className="dashboard__row">
        <section className="card">
          <h3 className="card__title">Topic Coverage Graph</h3>
          <p className="card__subtitle">Weighted cross-platform solving across the 15 standard DSA areas.</p>
          <div style={{ width: '100%', height: 290 }}>
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="var(--hairline)" />
                <PolarAngleAxis dataKey="topic" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} />
                <Radar dataKey="score" stroke="var(--signal)" fill="var(--signal)" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <h3 className="card__title">Graph Difficulty Distribution</h3>
          <p className="card__subtitle">Weighted solves aggregated across platforms (Easy: 1, Medium: 2, Hard: 3).</p>
          {total ? (
            <div className="difficulty-chart">
              <div className="difficulty-chart__bar">
                {diffSegments.map((s) => <div key={s.key} className="difficulty-chart__segment" style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label}: ${s.count} (${s.pct}%)`} />)}
              </div>
              <div className="difficulty-chart__legend">
                {diffSegments.map((s) => (
                  <div className="difficulty-chart__legend-item" key={s.key}>
                    <span className="difficulty-chart__swatch" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="mono">{s.count} ({s.pct}%)</span>
                  </div>
                ))}
              </div>
              <p className="empty-note" style={{ marginTop: 'var(--space-3)' }}>{total} difficulty-tagged questions solved.</p>
            </div>
          ) : (
            <p className="empty-note">No difficulty-tagged problems available.</p>
          )}
        </section>
      </div>

      {/* Contests Performed Visualizer */}
      <section className="card">
        <h3 className="card__title">Contests Performed Across Platforms</h3>
        <p className="card__subtitle">Cumulative contests: <strong className="mono">{score.contestPerformance.total}</strong> across all platforms.</p>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={contestChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--hairline)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--hairline)' }} tickLine={false} width={45} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 13 }}
              />
              <Bar dataKey="contests" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {contestChartData.map((d) => <Cell key={d.platform} fill={PLATFORM_COLORS[d.platform]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Languages Used */}
      {score.languageAnalysis.length > 0 && (
        <section className="card">
          <h3 className="card__title">Languages Used</h3>
          <p className="card__subtitle">Solved questions categorized by programming language in descending order.</p>
          <div className="chip-row">
            {score.languageAnalysis.map((l) => (
              <span className="chip mono" key={l.language}>
                {l.language} <span className="chip__count">({l.count})</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleAnalyze(profiles) {
    setLoading(true);
    setError(null);
    try {
      const data = await analyzeCandidate(profiles);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__title">
          <span className="app-header__mark">◆</span>
          <h1>Multi-Platform Coding Portfolio Analytics</h1>
        </div>
        <p className="app-header__tag">Cross-platform normalizer adhering strictly to the dynamic component drop and 100-point re-scaling specification.</p>
      </header>
      <main>
        <InputForm onAnalyze={handleAnalyze} loading={loading} hasResult={!!result} />
        {error && <div className="banner banner--error">{error}</div>}
        {result && <FinalCandidateDashboard data={result} />}
      </main>
      <footer className="app-footer">Candidate Dashboard normalizer implementation matching the Normaliser.docx specification.</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);