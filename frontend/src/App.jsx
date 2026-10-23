import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import './styles.css';

const API_BASE = 'http://localhost:5050';

const PLATFORM_COLORS = {
  leetcode: '#F5A623',
  codeforces: '#5B8DEF',
  codechef: '#8B6FE0',
  hackerrank: '#4FD1C5',
  github: '#8957E5'
};

const PLATFORM_LABELS = {
  leetcode: 'LeetCode',
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  hackerrank: 'HackerRank',
  github: 'GitHub'
};

/* ============================================================================
   MODAL 1: DELETE ACCOUNT
   ========================================================================== */
function DeleteAccountModal({ username, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e) {
    e.preventDefault();
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/user/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account.');
      onConfirm();
    } catch (e) {
      setErr(e.message);
      setDeleting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 style={{ color: 'var(--danger)' }}>⚠️ Delete Account Permanently</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)', margin: '12px 0' }}>
          This action <strong>cannot be undone</strong>. Your locked platform links, verified scores, and community memberships will be permanently erased.
        </p>
        {err && <div className="banner banner--error">{err}</div>}
        <form onSubmit={handleDelete}>
          <div className="input-field" style={{ marginBottom: '16px' }}>
            <label>Confirm Password</label>
            <input
              type="password"
              required
              placeholder="Enter your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={deleting}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={deleting || !password}>
              {deleting ? 'Deleting…' : 'Permanently Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   MODAL 2: ML WHAT-IF RANK OPTIMIZER & PREDICTOR
   ========================================================================== */
function MLRankPredictorModal({ user, onClose }) {
  const [simData, setSimData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/user/simulate-rank-increase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username })
    })
      .then((res) => res.json())
      .then((data) => {
        setSimData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.username]);

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card--wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>🤖 ML Predictive Rank Optimizer</h3>
          <button className="btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <p className="card__subtitle" style={{ margin: '6px 0 16px' }}>
          Community Ranks are calculated via <strong>RBU Placement Score</strong>. Global Ranks are calculated via <strong>CP Signal Index</strong>.
        </p>

        {loading ? (
          <p className="empty-note">Simulating cohort distribution and calculating relative rank models…</p>
        ) : !simData ? (
          <p className="empty-note">Could not generate simulations. Ensure community is active.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', background: 'var(--panel-raised)', borderRadius: '6px', textAlign: 'center' }}>
                <span className="empty-note">Current Community Rank (RBU)</span>
                <div className="mono" style={{ fontSize: '1.5rem', color: 'var(--signal)', fontWeight: 700 }}>
                  #{simData.currentCommunityRank || 1}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--panel-raised)', borderRadius: '6px', textAlign: 'center' }}>
                <span className="empty-note">Current Global Rank (CP)</span>
                <div className="mono" style={{ fontSize: '1.5rem', color: 'var(--blue)', fontWeight: 700 }}>
                  #{simData.currentGlobalRank || 1}
                </div>
              </div>
            </div>

            <h4 style={{ margin: '10px 0 4px', color: 'var(--text-primary)' }}>Prescriptive Action Simulations:</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {simData.recommendations.map((rec) => (
                <div key={rec.id} className="platform-card" style={{ borderTopColor: 'var(--signal)', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{rec.title}</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rec.description}</p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span className="rank-badge rank-badge--comm">
                        Community RBU: #{rec.predictedCommunityRank} 
                        {rec.communityRankIncrease > 0 ? (
                          <strong style={{ color: 'var(--signal)', marginLeft: '4px' }}>↑ +{rec.communityRankIncrease}</strong>
                        ) : ' (—)'}
                      </span>

                      <span className="rank-badge rank-badge--global">
                        Global CP: #{rec.predictedGlobalRank} 
                        {rec.globalRankIncrease > 0 ? (
                          <strong style={{ color: 'var(--blue)', marginLeft: '4px' }}>↑ +{rec.globalRankIncrease}</strong>
                        ) : ' (—)'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn-primary" onClick={onClose}>Close Simulator</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   MODAL 3: RBU PLACEMENT CREDENTIALS & EXPERIENCE EDITOR
   ========================================================================== */
function PlacementCredentialsModal({ user, onUpdate, onClose }) {
  const [academics, setAcademics] = useState(user.academics || { tenthPercentage: '', twelfthPercentage: '', cgpa: '' });
  const [exp, setExp] = useState(user.institutionalExperience || {
    internationalInternship: false,
    reputedInternshipsCount: 0,
    eduskillsInternshipsCount: 0,
    stipendAbove10k: false,
    globalCertsCount: 0,
    nptelCoursesCount: 0,
    rbuOnlineCoursesCount: 0,
    industryProjectsCount: 0,
    domainProjectsCount: 0,
    hackathonsFirstCount: 0,
    hackathonsSecondCount: 0,
    hackathonsThirdCount: 0,
    hackathonsParticipationCount: 0
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/user/update-placement-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, academics, institutionalExperience: exp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate(data.user);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card--wide">
        <h3>Edit RBU Placement Sheet Credentials</h3>
        <p className="card__subtitle" style={{ margin: '6px 0 16px' }}>
          Directly influences your <strong>Community Placement Ranking</strong>.
        </p>

        {err && <div className="banner banner--error">{err}</div>}

        <form onSubmit={handleSave}>
          <div className="form-grid-3">
            <div className="input-field">
              <label>10th Percentage (%)</label>
              <input
                type="number"
                step="0.1"
                value={academics.tenthPercentage}
                onChange={(e) => setAcademics({ ...academics, tenthPercentage: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>12th Percentage (%)</label>
              <input
                type="number"
                step="0.1"
                value={academics.twelfthPercentage}
                onChange={(e) => setAcademics({ ...academics, twelfthPercentage: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>Current B.Tech CGPA</label>
              <input
                type="number"
                step="0.01"
                value={academics.cgpa}
                onChange={(e) => setAcademics({ ...academics, cgpa: e.target.value })}
              />
            </div>
          </div>

          <h4 style={{ margin: '16px 0 8px', color: 'var(--signal)' }}>Internships & Credit Transfers (Max 10 M)</h4>
          <div className="checkbox-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exp.internationalInternship}
                onChange={(e) => setExp({ ...exp, internationalInternship: e.target.checked })}
              />
              <span>International Internship / One-Semester Credit Transfer (10 Marks)</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exp.stipendAbove10k}
                onChange={(e) => setExp({ ...exp, stipendAbove10k: e.target.checked })}
              />
              <span>Received Stipend &ge; ₹10,000 (+5 Marks Bonus)</span>
            </label>
          </div>
          <div className="form-grid-2" style={{ marginTop: '8px' }}>
            <div className="input-field">
              <label>Reputed IT / Academic Internships (5 M each)</label>
              <input
                type="number"
                min="0"
                value={exp.reputedInternshipsCount}
                onChange={(e) => setExp({ ...exp, reputedInternshipsCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>EduSkills Internships (4 M each, max 2)</label>
              <input
                type="number"
                min="0"
                max="2"
                value={exp.eduskillsInternshipsCount}
                onChange={(e) => setExp({ ...exp, eduskillsInternshipsCount: e.target.value })}
              />
            </div>
          </div>

          <h4 style={{ margin: '16px 0 8px', color: 'var(--signal)' }}>Certifications & Projects (Max 15 M each)</h4>
          <div className="form-grid-3">
            <div className="input-field">
              <label>Global Certs (AWS/GCP/Azure) (5 M)</label>
              <input
                type="number"
                min="0"
                value={exp.globalCertsCount}
                onChange={(e) => setExp({ ...exp, globalCertsCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>NPTEL Courses (4 M, max 2)</label>
              <input
                type="number"
                min="0"
                max="2"
                value={exp.nptelCoursesCount}
                onChange={(e) => setExp({ ...exp, nptelCoursesCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>RBU Online Courses (3 M, max 2)</label>
              <input
                type="number"
                min="0"
                max="2"
                value={exp.rbuOnlineCoursesCount}
                onChange={(e) => setExp({ ...exp, rbuOnlineCoursesCount: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-2" style={{ marginTop: '8px' }}>
            <div className="input-field">
              <label>Industry Problem / SIH / GOI Projects (5 M)</label>
              <input
                type="number"
                min="0"
                value={exp.industryProjectsCount}
                onChange={(e) => setExp({ ...exp, industryProjectsCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>Domain-Specific Projects (4 M each)</label>
              <input
                type="number"
                min="0"
                value={exp.domainProjectsCount}
                onChange={(e) => setExp({ ...exp, domainProjectsCount: e.target.value })}
              />
            </div>
          </div>

          <h4 style={{ margin: '16px 0 8px', color: 'var(--signal)' }}>Hackathons & Competitions (Max 10 M)</h4>
          <div className="form-grid-4">
            <div className="input-field">
              <label>1st Prize (5 M)</label>
              <input
                type="number"
                min="0"
                value={exp.hackathonsFirstCount}
                onChange={(e) => setExp({ ...exp, hackathonsFirstCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>2nd Prize (4 M)</label>
              <input
                type="number"
                min="0"
                value={exp.hackathonsSecondCount}
                onChange={(e) => setExp({ ...exp, hackathonsSecondCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>3rd / Consolation (3 M)</label>
              <input
                type="number"
                min="0"
                value={exp.hackathonsThirdCount}
                onChange={(e) => setExp({ ...exp, hackathonsThirdCount: e.target.value })}
              />
            </div>
            <div className="input-field">
              <label>Participation (2 M)</label>
              <input
                type="number"
                min="0"
                value={exp.hackathonsParticipationCount}
                onChange={(e) => setExp({ ...exp, hackathonsParticipationCount: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save & Recalculate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   AUTH MODAL (Sign Up & Login Wizard)
   ========================================================================== */
function AuthModal({ onLoginSuccess }) {
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'candidate',
    links: { leetcode: '', codeforces: '', codechef: '', hackerrank: '', github: '', linkedin: '' },
    academics: { tenthPercentage: '', twelfthPercentage: '', cgpa: '' },
    institutionalExperience: {
      internationalInternship: false,
      reputedInternshipsCount: 0,
      eduskillsInternshipsCount: 0,
      stipendAbove10k: false,
      globalCertsCount: 0,
      nptelCoursesCount: 0,
      rbuOnlineCoursesCount: 0,
      industryProjectsCount: 0,
      domainProjectsCount: 0,
      hackathonsFirstCount: 0,
      hackathonsSecondCount: 0,
      hackathonsThirdCount: 0,
      hackathonsParticipationCount: 0
    }
  });

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const cpFilled = ['leetcode', 'codeforces', 'codechef', 'hackerrank', 'github'].some(
    (k) => form.links[k] && form.links[k].trim()
  );

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, password: form.password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!termsAccepted) {
      setError('You must accept the terms verifying that submitted profiles cannot be edited.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-card__header">
        <div className="app-header__title" style={{ justifyContent: 'center' }}>
          <span className="app-header__mark">◆</span>
          <h2 style={{ fontSize: '1.5rem' }}>Candidate Signal</h2>
        </div>
        <p className="card__subtitle" style={{ textAlign: 'center', marginTop: '6px' }}>
          {mode === 'login' ? 'Sign in to access your analytics dashboard' : 'Create your verified student profile'}
        </p>
      </div>

      <div className="tab-pill-group">
        <button className={`tab-pill ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(null); }}>
          Log In
        </button>
        <button className={`tab-pill ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setStep(1); setError(null); }}>
          Create Account
        </button>
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="auth-form">
          <div className="input-field">
            <label>Unique Username</label>
            <input
              type="text"
              required
              placeholder="e.g. alex_coder"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div className="input-field">
            <label>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '10px' }}>
            {loading ? 'Authenticating & Fetching Real-Time Stats…' : 'Sign In'}
          </button>
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <span className="empty-note">Test Community Lead: <code>admin_lead</code> / <code>admin123</code></span>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="auth-form">
          {step === 1 && (
            <>
              <div className="input-field">
                <label>Account Type</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-select">
                  <option value="candidate">Individual Candidate / Portfolio</option>
                  <option value="community">Campus / Community Lead (Admin)</option>
                </select>
              </div>
              <div className="input-field">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="input-field">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. janedoe@gmail.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="input-field">
                <label>Unique Handle</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. jane_codes"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                />
              </div>
              <div className="input-field">
                <label>Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  if (!form.name || !form.email || !form.username || !form.password) {
                    setError('Please fill in all basic fields.');
                    return;
                  }
                  setError(null);
                  setStep(form.role === 'community' ? 3 : 2);
                }}
                style={{ width: '100%', marginTop: '12px' }}
              >
                Continue to Profile & Academics →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="step-notice">
                <span>⚡ Enter Academics & Profiles to begin normalization:</span>
              </div>
              <div className="dashboard__row" style={{ gap: '8px' }}>
                <div className="input-field">
                  <label>10th %</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 85.5"
                    value={form.academics.tenthPercentage}
                    onChange={(e) => setForm({ ...form, academics: { ...form.academics, tenthPercentage: e.target.value } })}
                  />
                </div>
                <div className="input-field">
                  <label>12th %</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 82.0"
                    value={form.academics.twelfthPercentage}
                    onChange={(e) => setForm({ ...form, academics: { ...form.academics, twelfthPercentage: e.target.value } })}
                  />
                </div>
                <div className="input-field">
                  <label>CGPA</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 8.4"
                    value={form.academics.cgpa}
                    onChange={(e) => setForm({ ...form, academics: { ...form.academics, cgpa: e.target.value } })}
                  />
                </div>
              </div>

              {[
                { k: 'github', label: 'GitHub URL or Username' },
                { k: 'leetcode', label: 'LeetCode URL or Username' },
                { k: 'codeforces', label: 'Codeforces Profile URL or Handle' },
                { k: 'codechef', label: 'CodeChef Profile URL or Username' },
                { k: 'hackerrank', label: 'HackerRank Profile URL or Username' },
                { k: 'linkedin', label: 'LinkedIn Profile URL' }
              ].map((f) => (
                <div className="input-field" key={f.k}>
                  <label>{f.label}</label>
                  <input
                    type="text"
                    placeholder={`https://${f.k}.com/...`}
                    value={form.links[f.k]}
                    onChange={(e) => setForm({ ...form, links: { ...form.links, [f.k]: e.target.value } })}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn-secondary" type="button" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (!cpFilled) {
                      setError('Provide at least one profile link.');
                      return;
                    }
                    setError(null);
                    setStep(3);
                  }}
                >
                  Review & Lock →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="terms-container">
                <h4>Permanent Verification Policy</h4>
                <p>Submitted links will be <strong>permanently locked</strong> to ensure anti-tampering across rankings.</p>
                <label className="checkbox-label">
                  <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                  <span>I understand that submitted profile links cannot be modified once saved.</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="btn-secondary" type="button" onClick={() => setStep(form.role === 'community' ? 1 : 2)}>
                  ← Back
                </button>
                <button className="btn-primary" type="submit" disabled={!termsAccepted || loading} style={{ flex: 1 }}>
                  {loading ? 'Performing Live Normalization…' : 'Submit & Lock Account'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}

/* ============================================================================
   DOWNSTREAM MODULE: UNIVERSAL ATS SCORER & OPTIMIZED GENERATOR
   ========================================================================== */
function DownstreamModules({ user }) {
  const [targetRole, setTargetRole] = useState('fullstack');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeInputMode, setResumeInputMode] = useState('upload');
  const [pastedResumeText, setPastedResumeText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [rolePresets, setRolePresets] = useState([]);
  const [auditResult, setAuditResult] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [generatedResume, setGeneratedResume] = useState('');
  const [copyMsg, setCopyMsg] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/ats/roles`)
      .then((res) => res.json())
      .then((d) => setRolePresets(d.roles || []))
      .catch(() => {});
  }, []);

  const score = user.latestScore;
  const lcSummary = score?.platformSummaries?.find((p) => p.platform === 'leetcode');
  const ghSummary = score?.platformSummaries?.find((p) => p.platform === 'github');
  const cfSummary = score?.platformSummaries?.find((p) => p.platform === 'codeforces');

  const defaultAutoResume = `# ${user.name.toUpperCase()}
Email: ${user.email} | Unique Signal ID: @${user.username}
LinkedIn: ${user.links?.linkedin || 'https://linkedin.com/in/' + user.username} | GitHub: ${user.links?.github || 'https://github.com/' + user.username}

## PROFESSIONAL SUMMARY
Software Engineering candidate with a verified Technical CP Signal Index of ${score?.overallScore || 'N/A'}/100 and RBU Placement Evaluation Mark of ${score?.rbuPlacement?.totalScore || 'N/A'}/100. Experienced in scalable architecture, unit testing, and full-stack software development.

## VERIFIED TECHNICAL PROFILES & METRICS
* LeetCode: ${lcSummary?.problemsSolved || 0} Solved (${score?.difficultyProfile?.totals?.medium || 0} Medium, ${score?.difficultyProfile?.totals?.hard || 0} Hard) | Profile: ${user.links?.leetcode || 'N/A'}
* Codeforces: Rating ${cfSummary?.platformScore ? Math.round(cfSummary.platformScore * 16.48) : 'Unrated'} | Profile: ${user.links?.codeforces || 'N/A'}
* GitHub: ${ghSummary?.problemsSolved || 0} Public Repositories | Collaborations & PRs: ${score?.rbuPlacement?.breakdown?.github?.collaborations || 0}

## CORE SKILLS & LANGUAGES
* Programming Languages: ${(score?.languageAnalysis || []).map((l) => l.language).join(', ') || 'C++, Java, Python, JavaScript, TypeScript'}
* Core Competencies: ${Object.keys(score?.topicMastery || {}).slice(0, 8).join(', ')}
* Developer Tools: Git, GitHub, REST APIs, Linux CLI, Docker

## EDUCATION & ACADEMICS
* B.Tech Computer Science & Engineering | CGPA: ${user.academics?.cgpa || 'N/A'}/10.0
* 12th Senior Secondary: ${user.academics?.twelfthPercentage || 'N/A'}% | 10th Secondary: ${user.academics?.tenthPercentage || 'N/A'}%

## INSTITUTIONAL EXPERIENCE & PROJECTS
* Industry & SIH Projects: Engineered ${user.institutionalExperience?.industryProjectsCount || 0} production problem statement solutions
* Domain Specific Systems: Developed ${user.institutionalExperience?.domainProjectsCount || 0} functional web and systems applications
* Global Certifications: Earned ${user.institutionalExperience?.globalCertsCount || 0} Industry Cloud / Security Credentials
* Hackathons & Contests: Earned ${user.institutionalExperience?.hackathonsFirstCount || 0} First Place Awards across ${score?.contestPerformance?.total || 0} Contests
`;

  useEffect(() => {
    setGeneratedResume(defaultAutoResume);
  }, [user]);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setUploadedFileName(file.name);
    }
  }

  async function handleAudit(e) {
    if (e) e.preventDefault();
    setAuditing(true);
    try {
      const formData = new FormData();

      if (resumeInputMode === 'upload' && selectedFile) {
        formData.append('resumeFile', selectedFile);
      } else if (resumeInputMode === 'paste') {
        formData.append('resumeText', pastedResumeText);
      } else {
        formData.append('resumeText', generatedResume);
      }

      formData.append('targetRole', targetRole);
      formData.append('jobDescription', jobDescription);
      formData.append('username', user.username);

      const res = await fetch(`${API_BASE}/api/ats/audit`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAuditResult(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setAuditing(false);
    }
  }

  function handleApplyRecommendation(rec) {
    setGeneratedResume((prev) => prev + `\n${rec.snippetToAdd}`);
    setAuditResult((prev) => ({
      ...prev,
      currentAtsScore: Math.min(100, prev.currentAtsScore + rec.scoreLift),
      deltaRecommendations: prev.deltaRecommendations.filter((r) => r.action !== rec.action)
    }));
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedResume);
    setCopyMsg(true);
    setTimeout(() => setCopyMsg(false), 2000);
  }

  return (
    <section className="card" style={{ marginTop: '24px', borderTop: '4px solid var(--signal)' }}>
      <div>
        <h3 className="card__title">Downstream Career Engine: Universal ATS Scorer & Resume Optimizer</h3>
        <p className="card__subtitle" style={{ margin: '4px 0 16px' }}>
          Select target job requirements, supply your resume, view live vector alignment scores, and apply verified additions to boost your score.
        </p>
      </div>

      <div className="dashboard__row" style={{ alignItems: 'stretch' }}>
        {/* COLUMN 1: TARGET JOB & RESUME INPUT AUDITOR */}
        <div className="platform-card" style={{ borderTopColor: 'var(--blue)', display: 'flex', flexDirection: 'column' }}>
          <div className="platform-card__header">
            <span>1. Target Job Criteria & Input</span>
          </div>

          <form onSubmit={handleAudit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <div className="input-field">
              <label>Target Role Track</label>
              <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="input-select">
                <option value="custom">Custom Job Description Only</option>
                {rolePresets.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>

            <div className="input-field">
              <label>Target Job Description (JD)</label>
              <textarea
                className="search-input mono"
                placeholder="Paste the employer's Job Description requirements here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                style={{ minHeight: '90px', resize: 'vertical', fontSize: '0.8rem' }}
              />
            </div>

            <div className="input-field" style={{ marginTop: '4px' }}>
              <label>Select Resume to Audit Against this JD:</label>
              <div className="tab-pill-group" style={{ marginBottom: '8px' }}>
                <button
                  type="button"
                  className={`tab-pill ${resumeInputMode === 'upload' ? 'active' : ''}`}
                  onClick={() => setResumeInputMode('upload')}
                >
                  📁 Upload File
                </button>
                <button
                  type="button"
                  className={`tab-pill ${resumeInputMode === 'paste' ? 'active' : ''}`}
                  onClick={() => setResumeInputMode('paste')}
                >
                  📝 Paste Text
                </button>
                <button
                  type="button"
                  className={`tab-pill ${resumeInputMode === 'live' ? 'active' : ''}`}
                  onClick={() => setResumeInputMode('live')}
                >
                  ⚡ Use Dashboard Resume
                </button>
              </div>

              {resumeInputMode === 'upload' && (
                <div>
                  <input type="file" accept=".pdf,.txt" onChange={handleFileChange} style={{ fontSize: '0.8rem' }} />
                  {uploadedFileName && (
                    <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--signal)', marginTop: '4px' }}>
                      Attached: {uploadedFileName}
                    </div>
                  )}
                </div>
              )}

              {resumeInputMode === 'paste' && (
                <textarea
                  className="search-input mono"
                  placeholder="Paste your raw resume text here..."
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  style={{ minHeight: '100px', resize: 'vertical', fontSize: '0.8rem' }}
                />
              )}

              {resumeInputMode === 'live' && (
                <p className="empty-note" style={{ color: 'var(--signal)' }}>
                  ✓ Automatically tests your verified Candidate Signal credentials (solves, repos, CGPA, projects).
                </p>
              )}
            </div>

            <button className="btn-primary" type="submit" disabled={auditing} style={{ marginTop: '8px' }}>
              {auditing ? 'Executing NLP Cosine Matching…' : '🔍 Calculate ATS Match Score'}
            </button>
          </form>

          {auditResult && (
            <div style={{ marginTop: '14px', background: 'var(--ink)', padding: '12px', borderRadius: '4px', border: '1px solid var(--hairline)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span className="empty-note">ATS Match Score</span>
                <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: auditResult.currentAtsScore >= 75 ? 'var(--signal)' : 'var(--warn)' }}>
                  {auditResult.currentAtsScore}%
                </span>
              </div>

              {auditResult.totalLift > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <span className="empty-note">Potential with Verified Data</span>
                  <span className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--signal)' }}>
                    {auditResult.potentialScore}% (↑ +{auditResult.totalLift}%)
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center', margin: '8px 0' }}>
                <div style={{ padding: '4px', background: 'var(--panel-raised)', borderRadius: '4px' }}>
                  <div className="empty-note" style={{ fontSize: '0.65rem' }}>Keywords</div>
                  <strong className="mono" style={{ fontSize: '0.8rem', color: 'var(--signal)' }}>{auditResult.keywordScore}%</strong>
                </div>
                <div style={{ padding: '4px', background: 'var(--panel-raised)', borderRadius: '4px' }}>
                  <div className="empty-note" style={{ fontSize: '0.65rem' }}>Cosine Sim</div>
                  <strong className="mono" style={{ fontSize: '0.8rem', color: 'var(--blue)' }}>{auditResult.vectorScore}%</strong>
                </div>
                <div style={{ padding: '4px', background: 'var(--panel-raised)', borderRadius: '4px' }}>
                  <div className="empty-note" style={{ fontSize: '0.65rem' }}>Verbs</div>
                  <strong className="mono" style={{ fontSize: '0.8rem', color: 'var(--purple)' }}>{auditResult.verbScore}%</strong>
                </div>
                <div style={{ padding: '4px', background: 'var(--panel-raised)', borderRadius: '4px' }}>
                  <div className="empty-note" style={{ fontSize: '0.65rem' }}>Structure</div>
                  <strong className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{auditResult.structureScore}%</strong>
                </div>
              </div>

              {auditResult.deltaRecommendations?.length > 0 && (
                <div style={{ marginTop: '10px', borderTop: '1px solid var(--hairline)', paddingTop: '8px' }}>
                  <span className="empty-note" style={{ color: 'var(--signal)', fontWeight: 600 }}>
                    ⚡ Add Verified Data to Boost ATS Score:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                    {auditResult.deltaRecommendations.map((rec, i) => (
                      <div key={i} style={{ padding: '8px', background: 'var(--panel-raised)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{rec.action}</div>
                          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--signal)' }}>
                            Predicted Score Lift: ↑ +{rec.scoreLift}%
                          </span>
                        </div>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => handleApplyRecommendation(rec)}>
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* COLUMN 2: ATS RESUME GENERATOR */}
        <div className="platform-card" style={{ borderTopColor: 'var(--signal)', display: 'flex', flexDirection: 'column' }}>
          <div className="platform-card__header">
            <span>2. Auto-Optimized ATS Resume</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn-secondary btn-sm" onClick={handleCopy}>
                {copyMsg ? '✓ Copied' : '📋 Copy Markdown'}
              </button>
              <button className="btn-primary btn-sm" onClick={() => window.print()}>
                🖨️ Print / PDF
              </button>
            </div>
          </div>
          <p className="empty-note" style={{ marginBottom: '8px' }}>
            Single-column layout with verified metrics. Updates dynamically when you click <code>+ Add</code> in recommendations.
          </p>
          <textarea
            className="resume-preview-area mono"
            value={generatedResume}
            onChange={(e) => setGeneratedResume(e.target.value)}
            style={{ flex: 1, minHeight: '460px', width: '100%', resize: 'vertical' }}
          />
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   CANDIDATE VIEW (WITH DUAL RANKINGS, LIVE INVITE POLLING & ALL COMMUNITIES)
   ========================================================================== */
function CandidateDashboard({ user, onUserUpdate, onLogout }) {
  const [candidateData, setCandidateData] = useState(user.latestScore);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [newLink, setNewLink] = useState('');
  const [commCodeInput, setCommCodeInput] = useState('');
  const [addMsg, setAddMsg] = useState(null);
  const [addErr, setAddErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [showMLModal, setShowMLModal] = useState(false);

  // Auto-poll live profile updates (including invites and rankings) every 3 seconds
  useEffect(() => {
    function fetchLatest() {
      fetch(`${API_BASE}/api/user/${user.username}`)
        .then((res) => res.json())
        .then((d) => {
          if (d.user) {
            onUserUpdate(d.user);
            setCandidateData(d.user.latestScore);
          }
        })
        .catch(() => {});
    }

    fetchLatest();
    const interval = setInterval(fetchLatest, 3000);
    return () => clearInterval(interval);
  }, [user.username]);

  const locked = user.lockedLinks || [];
  const availableToAdd = ['leetcode', 'codeforces', 'codechef', 'hackerrank', 'github', 'linkedin'].filter(
    (k) => !locked.includes(k)
  );

  async function handleRecalculate() {
    setSyncing(true);
    setAddMsg(null);
    setAddErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/user/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddMsg('Live scores and rankings recalculated!');
      onUserUpdate(data.user);
      setCandidateData(data.user.latestScore);
    } catch (e) {
      setAddErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleJoinCommunity(e) {
    e.preventDefault();
    if (!commCodeInput.trim()) return;
    setAddMsg(null);
    setAddErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/community/student-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUsername: user.username, communityCode: commCodeInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddMsg(data.message);
      setCommCodeInput('');
    } catch (err) {
      setAddErr(err.message);
    }
  }

  async function handleRespondInvite(communityCode, action) {
    setAddMsg(null);
    setAddErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/community/student-respond-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUsername: user.username, communityCode, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddMsg(data.message);
      if (data.user) onUserUpdate(data.user);
    } catch (err) {
      setAddErr(err.message);
    }
  }

  async function handleAddAndLock(e) {
    e.preventDefault();
    if (!selectedPlatform || !newLink.trim()) return;
    setLoading(true);
    setAddMsg(null);
    setAddErr(null);

    try {
      const res = await fetch(`${API_BASE}/api/user/add-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, platform: selectedPlatform, link: newLink.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddMsg(data.message);
      setNewLink('');
      setSelectedPlatform('');
      onUserUpdate(data.user);
      setCandidateData(data.user.latestScore);
    } catch (err) {
      setAddErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  const score = candidateData;
  const tone = score?.dataConfidence?.platformsAvailable >= 3 ? 'strong' : score?.dataConfidence?.platformsAvailable === 2 ? 'moderate' : 'limited';

  const chartData = (score?.platformSummaries || []).map((p) => ({
    name: PLATFORM_LABELS[p.platform] || p.platform,
    platform: p.platform,
    score: p.available && p.platformScore != null ? p.platformScore : 0,
    available: p.available
  }));

  const radarData = Object.entries(score?.topicMastery || {}).map(([topic, val]) => ({
    topic: topic.length > 14 ? topic.split(' & ')[0] : topic,
    score: val
  }));

  const rbu = score?.rbuPlacement;
  const ranks = user.rankings;

  return (
    <div className="dashboard">
      {/* TOPBAR */}
      <div className="dashboard-topbar">
        <div>
          <h2>Candidate Portfolio: {user.name}</h2>
          <span className="mono" style={{ color: 'var(--text-muted)' }}>
            @{user.username} &bull; Synced: {score?.lastUpdated ? new Date(score.lastUpdated).toLocaleTimeString() : 'Live'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary btn-sm" onClick={() => setShowMLModal(true)} style={{ background: 'linear-gradient(90deg, #4FD1C5, #5B8DEF)', color: '#0E1015' }}>
            ⚡ ML Rank Optimizer
          </button>
          <button className="btn-primary btn-sm" onClick={handleRecalculate} disabled={syncing}>
            {syncing ? 'Scraping…' : '🔄 Refresh Solves'}
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setShowPlacementModal(true)}>
            📝 Edit Placement Sheet
          </button>
          <button className="btn-secondary btn-sm" onClick={onLogout}>Sign Out</button>
          <button className="btn-outline-danger" onClick={() => setShowDeleteModal(true)}>Delete Account</button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal username={user.username} onConfirm={onLogout} onCancel={() => setShowDeleteModal(false)} />
      )}

      {showPlacementModal && (
        <PlacementCredentialsModal
          user={user}
          onUpdate={(updatedUser) => {
            onUserUpdate(updatedUser);
            setCandidateData(updatedUser.latestScore);
          }}
          onClose={() => setShowPlacementModal(false)}
        />
      )}

      {showMLModal && (
        <MLRankPredictorModal user={user} onClose={() => setShowMLModal(false)} />
      )}

      {addMsg && <div className="banner" style={{ color: 'var(--signal)', borderColor: 'var(--signal)' }}>{addMsg}</div>}
      {addErr && <div className="banner banner--error">{addErr}</div>}

      {/* INCOMING INVITATION BANNER */}
      {user.incomingInvites && user.incomingInvites.length > 0 && (
        <section className="card card--invite-banner" style={{ borderLeft: '4px solid var(--signal)', marginBottom: '16px' }}>
          <h3 className="card__title">Incoming Community Invitation</h3>
          <p className="card__subtitle">A community lead has invited you to join their ranked cohort.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {user.incomingInvites.map((inv) => (
              <div key={inv.code} className="pending-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-raised)', padding: '10px', borderRadius: '4px' }}>
                <div>
                  <strong>{inv.communityName}</strong> <span className="mono" style={{ color: 'var(--signal)' }}>({inv.code})</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary btn-sm" onClick={() => handleRespondInvite(inv.code, 'accept')}>
                    Accept & Join
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => handleRespondInvite(inv.code, 'reject')}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DUAL RANKING HEADER: GLOBAL CP RANK & ALL JOINED COMMUNITY RANKS */}
      <div className="platform-grid" style={{ marginBottom: '8px' }}>
        {/* GLOBAL RANK (CP SIGNAL) */}
        <div className="platform-card" style={{ borderTopColor: 'var(--blue)', background: 'linear-gradient(135deg, rgba(91, 141, 239, 0.1), var(--panel-raised))' }}>
          <div className="platform-card__header">
            <span>Global Rank (CP Signal)</span>
            <span className="platform-card__score mono" style={{ color: 'var(--blue)', fontSize: '1.75rem' }}>
              #{ranks?.globalRank || 1}
            </span>
          </div>
          <span className="empty-note">Evaluated across all {ranks?.globalTotal || 1} candidates via CP Signal Score</span>
        </div>

        {/* ALL COMMUNITY RANKS (RBU SCORE) */}
        {ranks?.allCommunityRanks && ranks.allCommunityRanks.length > 0 ? (
          ranks.allCommunityRanks.map((comm) => (
            <div key={comm.communityCode} className="platform-card" style={{ borderTopColor: 'var(--signal)', background: 'linear-gradient(135deg, rgba(79, 209, 197, 0.1), var(--panel-raised))' }}>
              <div className="platform-card__header">
                <span>{comm.communityName || comm.communityCode} (RBU Rank)</span>
                <span className="platform-card__score mono" style={{ color: 'var(--signal)', fontSize: '1.75rem' }}>
                  #{comm.rank}
                </span>
              </div>
              <span className="empty-note">
                Out of {comm.totalMembers} members (Ranked strictly by RBU Placement Score)
              </span>
            </div>
          ))
        ) : (
          <div className="platform-card" style={{ borderTopColor: 'var(--signal)' }}>
            <div className="platform-card__header">
              <span>Community Rank</span>
              <span className="platform-card__score mono" style={{ color: 'var(--text-muted)' }}>None</span>
            </div>
            <span className="empty-note">Request to join a community below to receive an RBU placement rank</span>
          </div>
        )}
      </div>

      {/* DUAL METRIC SCORE OVERVIEW */}
      <div className="dashboard__row">
        <section className="card card--hero">
          <div className="hero-score">
            <span className="hero-score__number mono">{score?.overallScore ?? '—'}</span>
            <span className="hero-score__scale">/ 100</span>
          </div>
          <div className="hero-meta">
            <h2>Technical CP Signal Index</h2>
            <div className={`confidence-badge confidence-badge--${tone}`}>
              <span className="confidence-badge__dot" />
              <span>{score?.dataConfidence?.label || 'Pending'} — {score?.dataConfidence?.platformsAvailable || 0} Platforms Connected</span>
            </div>
            <div className="locked-badges-row">
              {locked.map((plat) => (
                <span className="locked-badge" key={plat}>
                  🔒 {PLATFORM_LABELS[plat] || plat}: Locked
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="card card--hero" style={{ background: 'linear-gradient(135deg, #1C2438, #171A21)' }}>
          <div className="hero-score">
            <span className="hero-score__number mono" style={{ color: 'var(--blue)' }}>{rbu?.totalScore ?? '—'}</span>
            <span className="hero-score__scale">/ 100</span>
          </div>
          <div className="hero-meta">
            <h2>RBU Placement Evaluation Score</h2>
            <p className="card__subtitle" style={{ margin: 0 }}>
              Academics, GitHub, Solves, Internships, Certs, and Projects.
            </p>
          </div>
        </section>
      </div>

      {/* RBU DETAILED SCORECARD BREAKDOWN */}
      {rbu && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
            <h3 className="card__title">RBU Placement Criteria Breakdown (100 Marks Max)</h3>
            <button className="btn-secondary btn-sm" onClick={() => setShowPlacementModal(true)}>Update Experience Criteria</button>
          </div>
          <div className="platform-grid" style={{ marginTop: '12px' }}>
            <div className="platform-card" style={{ borderTopColor: 'var(--blue)' }}>
              <div className="platform-card__header">
                <span>Academics (15 M Max)</span>
                <span className="mono">{rbu.breakdown.academics.total} / {rbu.breakdown.academics.max}</span>
              </div>
              <table className="breakdown-table mono">
                <tbody>
                  <tr><td>10th Percentage ({user.academics?.tenthPercentage || 0}%)</td><td>{rbu.breakdown.academics.s10}/5</td></tr>
                  <tr><td>12th Percentage ({user.academics?.twelfthPercentage || 0}%)</td><td>{rbu.breakdown.academics.s12}/5</td></tr>
                  <tr><td>B.Tech CGPA ({user.academics?.cgpa || 0})</td><td>{rbu.breakdown.academics.sCgpa}/5</td></tr>
                </tbody>
              </table>
            </div>

            <div className="platform-card" style={{ borderTopColor: 'var(--purple)' }}>
              <div className="platform-card__header">
                <span>GitHub Metrics (15 M Max)</span>
                <span className="mono">{rbu.breakdown.github.total} / {rbu.breakdown.github.max}</span>
              </div>
              <table className="breakdown-table mono">
                <tbody>
                  <tr><td>Contributions / Repos (1 Yr)</td><td>{rbu.breakdown.github.contributions}/5</td></tr>
                  <tr><td>Collaborations</td><td>{rbu.breakdown.github.collaborations}/6</td></tr>
                  <tr><td>Monthly Active Rate</td><td>{rbu.breakdown.github.frequency}/4</td></tr>
                </tbody>
              </table>
            </div>

            <div className="platform-card" style={{ borderTopColor: 'var(--signal)' }}>
              <div className="platform-card__header">
                <span>Coding Experience (20 M Max)</span>
                <span className="mono">{rbu.breakdown.codingPlatforms.total} / {rbu.breakdown.codingPlatforms.max}</span>
              </div>
              <table className="breakdown-table mono">
                <tbody>
                  <tr><td>Badges Earned</td><td>{rbu.breakdown.codingPlatforms.badges}/5</td></tr>
                  <tr><td>Medium & Hard Questions</td><td>{rbu.breakdown.codingPlatforms.mediumHard}/5</td></tr>
                  <tr><td>LeetCode Solves Tier</td><td>{rbu.breakdown.codingPlatforms.leetcode}/10</td></tr>
                </tbody>
              </table>
            </div>

            <div className="platform-card" style={{ borderTopColor: 'var(--warn)' }}>
              <div className="platform-card__header">
                <span>Experience & Projects (50 M Max)</span>
                <span className="mono">{rbu.breakdown.internships.total + rbu.breakdown.certifications.total + rbu.breakdown.projects.total + rbu.breakdown.hackathons.total} / 50</span>
              </div>
              <table className="breakdown-table mono">
                <tbody>
                  <tr><td>Internships</td><td>{rbu.breakdown.internships.total}/10</td></tr>
                  <tr><td>Certifications</td><td>{rbu.breakdown.certifications.total}/15</td></tr>
                  <tr><td>Problem Statement Projects</td><td>{rbu.breakdown.projects.total}/15</td></tr>
                  <tr><td>Hackathons & Competitions</td><td>{rbu.breakdown.hackathons.total}/10</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* COMMUNITY REQUEST & LOCK PLATFORM */}
      <div className="dashboard__row">
        <section className="card">
          <h3 className="card__title">Join a Community</h3>
          <p className="card__subtitle">Enter code from your college or club lead to enter their ranked leaderboard.</p>
          <form onSubmit={handleJoinCommunity} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. RBU-2026"
              value={commCodeInput}
              onChange={(e) => setCommCodeInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" type="submit">Request Join</button>
          </form>
          {user.communities?.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <span className="empty-note">Joined Communities: </span>
              {user.communities.map((c) => <code key={c} style={{ marginRight: '6px' }}>{c}</code>)}
            </div>
          )}
        </section>

        {availableToAdd.length > 0 ? (
          <section className="card card--add-link">
            <h3 className="card__title">Add Further Platform Link</h3>
            <p className="card__subtitle">Once added, it is permanently locked and cannot be edited.</p>
            <form onSubmit={handleAddAndLock} className="add-link-form">
              <select value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value)} className="input-select">
                <option value="">Select Platform…</option>
                {availableToAdd.map((p) => (
                  <option value={p} key={p}>{PLATFORM_LABELS[p] || p.toUpperCase()}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Paste profile URL or handle"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn-primary" type="submit" disabled={!selectedPlatform || !newLink.trim() || loading}>
                {loading ? 'Locking…' : 'Add & Lock'}
              </button>
            </form>
          </section>
        ) : (
          <section className="card">
            <h3 className="card__title">Profile Links Complete</h3>
            <p className="card__subtitle">All supported coding and project profiles have been verified and locked.</p>
          </section>
        )}
      </div>

      {/* PLATFORM BREAKDOWN & CHARTS */}
      <section className="card">
        <h3 className="card__title">Platform Performance Breakdown</h3>
        <p className="card__subtitle">100-point normalized metric evaluation across each platform.</p>
        <div className="platform-grid">
          {(score?.platformSummaries || []).map((p) => (
            <div className="platform-card" key={p.platform} style={{ borderTopColor: PLATFORM_COLORS[p.platform] }}>
              <div className="platform-card__header">
                <span className="platform-card__name">{PLATFORM_LABELS[p.platform]}</span>
                <span className="platform-card__score mono">{p.available ? `${p.platformScore}/100` : 'N/A'}</span>
              </div>
              {p.available ? (
                <table className="breakdown-table mono">
                  <tbody>
                    {p.scoreBreakdown.filter((b) => b.available).map((b) => (
                      <tr key={b.key}>
                        <td>{b.label}</td>
                        <td>{`${b.points}/${b.max}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-note">Platform not linked yet</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ width: '100%', height: 240, marginTop: '16px' }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--hairline)' }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--hairline)' }} tickLine={false} width={45} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 13 }} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {chartData.map((d) => <Cell key={d.platform} fill={d.available ? PLATFORM_COLORS[d.platform] : 'var(--hairline)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* SWOT DIAGNOSTICS & RADAR */}
      {score?.swot && (
        <section className="card">
          <h3 className="card__title">Technical SWOT Diagnostic</h3>
          <p className="card__subtitle">Categorized from standard 15-topic data structure & algorithm competencies.</p>
          <div className="swot-grid">
            <div className="swot-quadrant swot-quadrant--s">
              <h4>Strengths <span>({score.swot.strengths.length})</span></h4>
              <ul className="swot-list">
                {score.swot.strengths.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              </ul>
            </div>
            <div className="swot-quadrant swot-quadrant--w">
              <h4>Weaknesses <span>({score.swot.weaknesses.length})</span></h4>
              <ul className="swot-list">
                {score.swot.weaknesses.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              </ul>
            </div>
            <div className="swot-quadrant swot-quadrant--o">
              <h4>Opportunities <span>({score.swot.opportunities.length})</span></h4>
              <ul className="swot-list">
                {score.swot.opportunities.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              </ul>
            </div>
            <div className="swot-quadrant swot-quadrant--t">
              <h4>High-Stakes Gaps <span>({score.swot.threats.length})</span></h4>
              <ul className="swot-list">
                {score.swot.threats.map((s) => <li key={s.topic}><span>{s.topic}</span><span className="mono">{s.score}%</span></li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* TOPIC RADAR */}
      <div className="dashboard__row">
        <section className="card">
          <h3 className="card__title">Topic Mastery Map</h3>
          <div style={{ width: '100%', height: 260 }}>
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

        {score?.languageAnalysis?.length > 0 && (
          <section className="card">
            <h3 className="card__title">Languages Used</h3>
            <p className="card__subtitle">Aggregated across GitHub repositories and coding submissions.</p>
            <div className="chip-row" style={{ marginTop: '12px' }}>
              {score.languageAnalysis.map((l) => (
                <span className="chip mono" key={l.language}>
                  {l.language} <span className="chip__count">({l.count})</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* DOWNSTREAM ATS & RESUME GENERATOR MODULES */}
      <DownstreamModules user={user} />
    </div>
  );
}

/* ============================================================================
   ADMIN / COMMUNITY VIEW (STRICTLY SORTED BY RBU SCORE)
   ========================================================================== */
function AdminDashboard({ user, onLogout }) {
  const [data, setData] = useState({ communityCode: '', cohort: [], pendingRequests: [] });
  const [activeTab, setActiveTab] = useState('roster');
  const [inviteStudent, setInviteStudent] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function loadCohort() {
    setLoading(true);
    fetch(`${API_BASE}/api/admin/cohort/${user.username}`)
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadCohort(); }, []);

  async function handleRespondRequest(studentUsername, action) {
    try {
      const res = await fetch(`${API_BASE}/api/community/admin-respond-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername: user.username, studentUsername, action })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setMsg(resData.message);
      loadCohort();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleSendInvite(e) {
    e.preventDefault();
    if (!inviteStudent.trim()) return;
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/community/admin-invite-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername: user.username, studentUsername: inviteStudent.trim() })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setMsg(resData.message);
      setInviteStudent('');
    } catch (e) {
      setErr(e.message);
    }
  }

  function handleExportCsv() {
    setExporting(true);
    window.location.href = `${API_BASE}/api/admin/export-csv/${user.username}`;
    setTimeout(() => {
      setExporting(false);
      loadCohort();
    }, 2500);
  }

  const filtered = (data.cohort || []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard">
      <div className="dashboard-topbar">
        <div>
          <h2>Community Portal: {user.name}</h2>
          <span className="mono" style={{ color: 'var(--signal)' }}>
            Community Code: <strong>{data.communityCode}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? 'Generating CSV…' : '📥 Export RBU Ranked CSV'}
          </button>
          <button className="btn-secondary" onClick={loadCohort} disabled={loading}>
            🔄 Refresh Cohort
          </button>
          <button className="btn-secondary" onClick={onLogout}>Sign Out</button>
          <button className="btn-outline-danger" onClick={() => setShowDeleteModal(true)}>Delete Community</button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal username={user.username} onConfirm={onLogout} onCancel={() => setShowDeleteModal(false)} />
      )}

      {msg && <div className="banner" style={{ color: 'var(--signal)', borderColor: 'var(--signal)' }}>{msg}</div>}
      {err && <div className="banner banner--error">{err}</div>}

      <div className="tab-pill-group" style={{ maxWidth: '440px', marginBottom: '8px' }}>
        <button className={`tab-pill ${activeTab === 'roster' ? 'active' : ''}`} onClick={() => setActiveTab('roster')}>
          📋 Community Leaderboard ({data.cohort?.length || 0})
        </button>
        <button className={`tab-pill ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
          📊 Analytics & Comparisons
        </button>
      </div>

      {activeTab === 'roster' && (
        <>
          <div className="dashboard__row">
            <section className="card">
              <h3 className="card__title">Invite Student to Community</h3>
              <p className="card__subtitle">Enter candidate's unique handle (e.g. <code>alex_coder</code>) to send an invite.</p>
              <form onSubmit={handleSendInvite} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. jane_codes"
                  value={inviteStudent}
                  onChange={(e) => setInviteStudent(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" type="submit">Send Invite</button>
              </form>
            </section>

            <section className="card">
              <h3 className="card__title">Pending Join Requests ({data.pendingRequests?.length || 0})</h3>
              <p className="card__subtitle">Students who entered code ({data.communityCode}) and await approval.</p>
              {data.pendingRequests?.length === 0 ? (
                <p className="empty-note">No pending join requests.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.pendingRequests.map((req) => (
                    <div key={req.username} className="pending-row">
                      <div>
                        <strong>{req.name}</strong> <span className="mono">(@{req.username})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-primary btn-sm" onClick={() => handleRespondRequest(req.username, 'accept')}>Accept</button>
                        <button className="btn-secondary btn-sm" onClick={() => handleRespondRequest(req.username, 'reject')}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <h3 className="card__title">RBU Placement Ranked Leaderboard</h3>
                <span className="empty-note">Ranked strictly based on each student's RBU Placement Evaluation Mark.</span>
              </div>
              <input
                type="text"
                placeholder="Search member…"
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <p className="empty-note">Scraping and updating live rankings…</p>
            ) : (
              <div className="table-responsive">
                <table className="roster-table mono">
                  <thead>
                    <tr>
                      <th>Community RBU Rank</th>
                      <th>Candidate</th>
                      <th>RBU Placement Score</th>
                      <th>Global CP Rank</th>
                      <th>CP Signal Score</th>
                      <th>Profiles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, idx) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700, color: 'var(--signal)', fontSize: '1.2rem' }}>
                          #{idx + 1}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{c.username}</span>
                        </td>
                        <td style={{ color: 'var(--blue)', fontWeight: 700, fontSize: '1.05rem' }}>
                          {c.latestScore?.rbuPlacement?.totalScore != null ? `${c.latestScore.rbuPlacement.totalScore}/100` : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          #{c.rankings?.globalRank || '—'}
                        </td>
                        <td style={{ color: 'var(--signal)', fontWeight: 700 }}>
                          {c.latestScore?.overallScore != null ? `${c.latestScore.overallScore}/100` : '—'}
                        </td>
                        <td>
                          {c.links?.github && <a href={c.links.github} target="_blank" rel="noreferrer" style={{ marginRight: '6px' }}>GH</a>}
                          {c.links?.leetcode && <a href={c.links.leetcode} target="_blank" rel="noreferrer" style={{ marginRight: '6px' }}>LC</a>}
                          {c.links?.codeforces && <a href={c.links.codeforces} target="_blank" rel="noreferrer">CF</a>}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '24px' }}>
                          No verified students in this community yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'analytics' && <CohortAnalyticsView cohort={data.cohort} />}
    </div>
  );
}

/* ============================================================================
   ADMIN ANALYTICS VIEW
   ========================================================================== */
function CohortAnalyticsView({ cohort }) {
  const [studentA, setStudentA] = useState(cohort[0]?.username || '');
  const [studentB, setStudentB] = useState(cohort[1]?.username || cohort[0]?.username || '');

  if (!cohort || cohort.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <p className="empty-note">No verified students in this cohort yet to compare.</p>
      </div>
    );
  }

  const rankingData = [...cohort]
    .map((c) => ({
      name: c.name.length > 12 ? c.name.slice(0, 10) + '…' : c.name,
      username: c.username,
      cpScore: c.latestScore?.overallScore || 0,
      rbuScore: c.latestScore?.rbuPlacement?.totalScore || 0
    }))
    .sort((a, b) => b.rbuScore - a.rbuScore);

  const topicSums = {};
  const topicCounts = {};
  cohort.forEach((c) => {
    const mastery = c.latestScore?.topicMastery || {};
    Object.entries(mastery).forEach(([topic, val]) => {
      topicSums[topic] = (topicSums[topic] || 0) + val;
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });

  const cohortTopicRadarData = Object.keys(topicSums).map((topic) => ({
    topic: topic.length > 14 ? topic.split(' & ')[0] : topic,
    avgScore: Math.round(topicSums[topic] / (topicCounts[topic] || 1))
  }));

  const candA = cohort.find((c) => c.username === studentA) || cohort[0];
  const candB = cohort.find((c) => c.username === studentB) || cohort[1] || cohort[0];

  const headToHeadRadar = Object.keys(topicSums).map((topic) => {
    const shortLabel = topic.length > 14 ? topic.split(' & ')[0] : topic;
    return {
      topic: shortLabel,
      [candA?.name || 'Student A']: candA?.latestScore?.topicMastery?.[topic] || 0,
      [candB?.name || 'Student B']: candB?.latestScore?.topicMastery?.[topic] || 0
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <section className="card">
        <div>
          <h3 className="card__title">Cohort Scoreboard (Sorted by RBU Placement Score)</h3>
          <p className="card__subtitle">RBU Placement Mark (Blue) vs. Technical CP Signal Index (Teal).</p>
        </div>

        <div style={{ width: '100%', height: 320, marginTop: '12px' }}>
          <ResponsiveContainer>
            <BarChart data={rankingData} margin={{ top: 12, right: 12, left: -16, bottom: 24 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={35} />
              <Tooltip contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="rbuScore" name="RBU Placement Score" fill="var(--blue)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="cpScore" name="CP Signal Index" fill="var(--signal)" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="dashboard__row">
        <section className="card">
          <h3 className="card__title">Cohort DSA Topic Benchmark</h3>
          <p className="card__subtitle">Average mastery score across all students.</p>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <RadarChart data={cohortTopicRadarData} outerRadius="75%">
                <PolarGrid stroke="var(--hairline)" />
                <PolarAngleAxis dataKey="topic" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} />
                <Radar name="Batch Avg" dataKey="avgScore" stroke="var(--purple)" fill="var(--purple)" fillOpacity={0.3} strokeWidth={2} />
                <Tooltip contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <h3 className="card__title">Head-to-Head Candidate Comparison</h3>
          <p className="card__subtitle">Select any two candidates to overlay their skill profiles.</p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <select value={studentA} onChange={(e) => setStudentA(e.target.value)} className="input-select" style={{ flex: 1 }}>
              {cohort.map((c, i) => (
                <option key={c.username} value={c.username}>#{i + 1} {c.name}</option>
              ))}
            </select>

            <select value={studentB} onChange={(e) => setStudentB(e.target.value)} className="input-select" style={{ flex: 1 }}>
              {cohort.map((c, i) => (
                <option key={c.username} value={c.username}>#{i + 1} {c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <RadarChart data={headToHeadRadar} outerRadius="75%">
                <PolarGrid stroke="var(--hairline)" />
                <PolarAngleAxis dataKey="topic" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} />
                <Radar name={candA?.name || 'Student A'} dataKey={candA?.name || 'Student A'} stroke="var(--signal)" fill="var(--signal)" fillOpacity={0.25} strokeWidth={2} />
                <Radar name={candB?.name || 'Student B'} dataKey={candB?.name || 'Student B'} stroke="var(--warn)" fill="var(--warn)" fillOpacity={0.25} strokeWidth={2} />
                <Tooltip contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================================
   ROOT APP
   ========================================================================== */
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cs_user') || 'null');
    } catch {
      return null;
    }
  });

  function handleLogin(user) {
    setCurrentUser(user);
    localStorage.setItem('cs_user', JSON.stringify(user));
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem('cs_user');
  }

  return (
    <div className="app-shell">
      {!currentUser ? (
        <AuthModal onLoginSuccess={handleLogin} />
      ) : currentUser.role === 'community' ? (
        <AdminDashboard user={currentUser} onLogout={handleLogout} />
      ) : (
        <CandidateDashboard user={currentUser} onUserUpdate={handleLogin} onLogout={handleLogout} />
      )}
      <footer className="app-footer">Candidate Signal Engine — Dual Rankings & Universal ATS Matcher.</footer>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}