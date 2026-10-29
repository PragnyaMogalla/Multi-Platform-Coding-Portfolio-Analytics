import React, { useState, useEffect } from 'react';

const API = 'http://localhost:5050';
const ROLES = [
  'Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Data Analyst', 'Data Scientist', 'ML Engineer', 'DevOps Engineer', 'QA / Test Engineer', 'Android Developer'
];

const blankProject = { name: '', tech: '', description: '' };
const blankExp = { role: '', org: '', period: '', description: '' };

export function resumeToPlainText(r) {
  if (!r) return '';
  const lines = [];
  const h = r.header || {};
  lines.push(h.name || '');
  lines.push([h.email, h.phone, h.location].filter(Boolean).join(' | '));
  if (h.links?.length) lines.push(h.links.map((l) => `${l.label}: ${l.url}`).join(' | '));
  lines.push('');

  if (r.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(r.summary);
    lines.push('');
  }

  if (r.education?.length) {
    lines.push('EDUCATION');
    r.education.forEach((e) => {
      lines.push(`${e.institution} - ${e.period}`);
      lines.push([e.degree, e.score].filter(Boolean).join(' | '));
    });
    lines.push('');
  }

  if (r.skills?.length) {
    lines.push('TECHNICAL SKILLS');
    r.skills.forEach((s) => {
      lines.push(`${s.category}: ${s.items.join(', ')}`);
    });
    lines.push('');
  }

  if (r.projects?.length) {
    lines.push('PROJECTS');
    r.projects.forEach((p) => {
      lines.push(p.tech ? `${p.name} | ${p.tech}` : p.name);
      if (p.link) lines.push(p.link);
      (p.bullets || []).forEach((b) => lines.push(`* ${b}`));
    });
    lines.push('');
  }

  if (r.experience?.length) {
    lines.push('EXPERIENCE');
    r.experience.forEach((x) => {
      lines.push(`${[x.title, x.organization].filter(Boolean).join(' | ')} (${x.period})`);
      (x.bullets || []).forEach((b) => lines.push(`* ${b}`));
    });
    lines.push('');
  }

  if (r.codingProfile?.length) {
    lines.push('CODING PROFILES & ACHIEVEMENTS');
    r.codingProfile.forEach((b) => lines.push(`* ${b}`));
    lines.push('');
  }

  if (r.certifications?.length) {
    lines.push('CERTIFICATIONS');
    r.certifications.forEach((c) => lines.push(`* ${c}`));
    lines.push('');
  }

  if (r.achievements?.length) {
    lines.push('HONORS & AWARDS');
    r.achievements.forEach((a) => lines.push(`* ${a}`));
  }

  return lines.join('\n');
}

export default function ResumeBuilder({ user, onClose }) {
  const [step, setStep] = useState('form'); // form | loading | preview
  const [error, setError] = useState('');
  const [resume, setResume] = useState(null);
  const [atsScoreData, setAtsScoreData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    targetRole: '', jobDescription: '', phone: '', location: '', college: '', degree: '',
    gradYear: '', skills: '', certifications: '', achievements: '',
    projects: [{ ...blankProject }], experience: []
  });

  useEffect(() => {
    fetch(`${API}/api/resume/prefill/${user.username}`)
      .then((res) => res.json())
      .then((data) => {
        setForm((prev) => ({
          ...prev,
          skills: data.skills || prev.skills,
          achievements: data.achievements || prev.achievements,
          projects: data.projects?.length ? data.projects : prev.projects,
          experience: data.experience?.length ? data.experience : prev.experience
        }));
      })
      .catch(() => {});
  }, [user.username]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (list, i, k, v) =>
    setForm((f) => ({ ...f, [list]: f[list].map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) }));
  const addItem = (list, blank) => setForm((f) => ({ ...f, [list]: [...f[list], { ...blank }] }));
  const removeItem = (list, i) => setForm((f) => ({ ...f, [list]: f[list].filter((_, idx) => idx !== i) }));

  async function generate() {
    if (!form.targetRole.trim()) return setError('Please enter the position you are applying for.');
    setError('');
    setStep('loading');
    try {
      const { targetRole, jobDescription, projects, experience, ...rest } = form;
      const r = await fetch(`${API}/api/resume/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          targetRole,
          jobDescription,
          details: {
            ...rest,
            projects: projects.filter((p) => p.name.trim()),
            experience: experience.filter((x) => x.role.trim() || x.org.trim())
          }
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Generation failed.');
      
      const builtResume = data.resume;
      setResume(builtResume);

      const plainText = resumeToPlainText(builtResume);
      try {
        const auditRes = await fetch(`${API}/api/ats/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeText: plainText,
            jobDescription: form.jobDescription,
            targetRole: form.targetRole,
            username: user.username
          })
        });
        const auditData = await auditRes.json();
        setAtsScoreData(auditData);
      } catch (auditErr) {
        console.warn('ATS check failed:', auditErr);
      }

      setStep('preview');
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
  }

  async function downloadDocx() {
    const r = await fetch(`${API}/api/resume/docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume })
    });
    if (!r.ok) return setError('Could not download the DOCX.');
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `${user.username}_${form.targetRole.replace(/\s+/g, '_')}_resume.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyText() {
    const text = resumeToPlainText(resume);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card--wide" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>ATS Resume Recommendations</h3>
            <span className="empty-note">Engineered to achieve maximum ATS score using verified candidate metrics.</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
        {error && <div className="banner banner--error">{error}</div>}

        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p className="empty-note">Tailoring keywords and quantifying verified data for {form.targetRole}…</p>
          </div>
        )}

        {step === 'form' && (
          <div className="auth-form">
            <div className="input-field">
              <label>Target Position *</label>
              <input list="role-list" value={form.targetRole} onChange={set('targetRole')} placeholder="e.g. Backend Developer" />
              <datalist id="role-list">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
            </div>
            <div className="input-field">
              <label>Target Job Description (Paste JD for keyword optimization)</label>
              <textarea rows={4} value={form.jobDescription} onChange={set('jobDescription')} placeholder="Paste target JD requirements here..." />
            </div>

            <div className="form-grid-2">
              <div className="input-field"><label>Phone</label><input value={form.phone} onChange={set('phone')} placeholder="+91 9876543210" /></div>
              <div className="input-field"><label>Location</label><input value={form.location} onChange={set('location')} placeholder="City, State" /></div>
              <div className="input-field"><label>College / University</label><input value={form.college} onChange={set('college')} placeholder="e.g. RBU Engineering" /></div>
              <div className="input-field"><label>Degree & Branch</label><input value={form.degree} onChange={set('degree')} placeholder="B.Tech, Computer Science" /></div>
              <div className="input-field"><label>Graduation Year</label><input value={form.gradYear} onChange={set('gradYear')} placeholder="2027" /></div>
              <div className="input-field"><label>Skills (comma separated)</label><input value={form.skills} onChange={set('skills')} placeholder="Python, React, SQL, Git, Docker" /></div>
            </div>

            <h4>Projects</h4>
            {form.projects.map((p, i) => (
              <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div className="form-grid-2">
                  <div className="input-field"><label>Name</label><input value={p.name} onChange={(e) => setItem('projects', i, 'name', e.target.value)} /></div>
                  <div className="input-field"><label>Tech used</label><input value={p.tech} onChange={(e) => setItem('projects', i, 'tech', e.target.value)} /></div>
                </div>
                <div className="input-field">
                  <label>What did you build / achieve?</label>
                  <textarea rows={3} value={p.description} onChange={(e) => setItem('projects', i, 'description', e.target.value)} />
                </div>
                {form.projects.length > 1 && <button className="btn-outline-danger btn-sm" onClick={() => removeItem('projects', i)}>Remove Project</button>}
              </div>
            ))}
            <button className="btn-secondary btn-sm" onClick={() => addItem('projects', blankProject)}>+ Add project</button>

            <h4 style={{ marginTop: 16 }}>Internships / Experience</h4>
            {form.experience.map((x, i) => (
              <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div className="form-grid-3">
                  <div className="input-field"><label>Role</label><input value={x.role} onChange={(e) => setItem('experience', i, 'role', e.target.value)} /></div>
                  <div className="input-field"><label>Company / Organization</label><input value={x.org} onChange={(e) => setItem('experience', i, 'org', e.target.value)} /></div>
                  <div className="input-field"><label>Period</label><input value={x.period} onChange={(e) => setItem('experience', i, 'period', e.target.value)} placeholder="Jun 2026 – Aug 2026" /></div>
                </div>
                <div className="input-field"><label>What did you do?</label>
                  <textarea rows={3} value={x.description} onChange={(e) => setItem('experience', i, 'description', e.target.value)} />
                </div>
                <button className="btn-outline-danger btn-sm" onClick={() => removeItem('experience', i)}>Remove Experience</button>
              </div>
            ))}
            <button className="btn-secondary btn-sm" onClick={() => addItem('experience', blankExp)}>+ Add experience</button>

            <div className="input-field" style={{ marginTop: 12 }}><label>Certifications (one per line)</label><textarea rows={2} value={form.certifications} onChange={set('certifications')} /></div>
            <div className="input-field"><label>Achievements / Hackathons (one per line)</label><textarea rows={2} value={form.achievements} onChange={set('achievements')} /></div>

            <button className="btn-primary" onClick={generate} style={{ marginTop: 12 }}>Generate & Benchmark ATS Resume</button>
            <p className="empty-note">Verified coding platform stats, LeetCode, and GitHub metrics are embedded automatically.</p>
          </div>
        )}

        {step === 'preview' && resume && (
          <>
            {atsScoreData && (
              <div className="platform-card" style={{ borderTopColor: 'var(--signal)', background: 'var(--panel-raised)', padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="empty-note">Calculated ATS Score</span>
                    <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: atsScoreData.currentAtsScore >= 75 ? 'var(--signal)' : 'var(--warn)' }}>
                      {atsScoreData.currentAtsScore}% Match
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <span className="empty-note">Keywords</span>
                      <div className="mono" style={{ fontWeight: 600 }}>{atsScoreData.keywordScore}%</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span className="empty-note">Vector Sim</span>
                      <div className="mono" style={{ fontWeight: 600 }}>{atsScoreData.vectorScore}%</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span className="empty-note">Structure</span>
                      <div className="mono" style={{ fontWeight: 600 }}>{atsScoreData.structureScore}%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button className="btn-primary" onClick={downloadDocx}>📥 Download DOCX</button>
              <button className="btn-secondary" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
              <button className="btn-secondary" onClick={handleCopyText}>{copied ? '✓ Copied Text' : '📋 Copy Text'}</button>
              <button className="btn-secondary" onClick={generate}>🔄 Regenerate</button>
              <button className="btn-secondary" onClick={() => setStep('form')}>✏️ Edit Details</button>
            </div>

            {resume.atsKeywords?.length > 0 && (
              <div className="no-print" style={{ marginBottom: 12 }}>
                <div className="card__subtitle">Covered ATS Keywords for {form.targetRole}</div>
                <div className="chip-row">{resume.atsKeywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
              </div>
            )}
            {resume.tips?.length > 0 && (
              <div className="step-notice no-print" style={{ marginBottom: 12 }}>
                <strong>Optimization Recommendations:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{resume.tips.map((t, idx) => <li key={idx}>{t}</li>)}</ul>
              </div>
            )}

            <ResumePaper r={resume} />
          </>
        )}
      </div>
    </div>
  );
}

function ResumePaper({ r }) {
  const h = r.header || {};
  const Section = ({ title, children }) => (
    <div style={{ marginTop: 14 }}>
      <h4 className="rp-heading" style={{ borderBottom: '1px solid var(--hairline)', paddingBottom: 2, marginBottom: 6 }}>{title}</h4>
      {children}
    </div>
  );
  const Bullets = ({ items }) => (
    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
      {(items || []).map((b, i) => <li key={i} style={{ marginBottom: 2 }}>{b}</li>)}
    </ul>
  );

  return (
    <div className="resume-paper" style={{ background: '#ffffff', color: '#111111', padding: '24px', borderRadius: '4px', fontFamily: 'Calibri, Arial, sans-serif', fontSize: '0.88rem', lineHeight: '1.4' }}>
      <h1 className="rp-name" style={{ textAlign: 'center', margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 700 }}>{h.name}</h1>
      <p className="rp-center" style={{ textAlign: 'center', margin: '0 0 2px', fontSize: '0.85rem' }}>{[h.email, h.phone, h.location].filter(Boolean).join(' | ')}</p>
      {h.links?.length > 0 && <p className="rp-center" style={{ textAlign: 'center', margin: '0 0 8px', fontSize: '0.82rem' }}>{h.links.map((l) => `${l.label}: ${l.url}`).join(' | ')}</p>}

      {r.summary && <Section title="PROFESSIONAL SUMMARY"><p style={{ margin: 0 }}>{r.summary}</p></Section>}
      {r.education?.length > 0 && (
        <Section title="EDUCATION">
          {r.education.map((e, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{e.institution}</b><span>{e.period}</span></div>
              <div>{[e.degree, e.score].filter(Boolean).join(' | ')}</div>
            </div>
          ))}
        </Section>
      )}
      {r.skills?.length > 0 && (
        <Section title="TECHNICAL SKILLS">
          {r.skills.map((s, i) => <div key={i} style={{ marginBottom: 3 }}><b>{s.category}:</b> {s.items.join(', ')}</div>)}
        </Section>
      )}
      {r.projects?.length > 0 && (
        <Section title="PROJECTS">
          {r.projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{p.tech ? `${p.name} | ${p.tech}` : p.name}</b>
                {p.link && <span style={{ fontSize: '0.78rem' }}>{p.link}</span>}
              </div>
              <Bullets items={p.bullets} />
            </div>
          ))}
        </Section>
      )}
      {r.experience?.length > 0 && (
        <Section title="EXPERIENCE">
          {r.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{[e.title, e.organization].filter(Boolean).join(' | ')}</b><span>{e.period}</span></div>
              <Bullets items={e.bullets} />
            </div>
          ))}
        </Section>
      )}
      {r.codingProfile?.length > 0 && <Section title="CODING PROFILES & COMPETITIVE METRICS"><Bullets items={r.codingProfile} /></Section>}
      {r.certifications?.length > 0 && <Section title="CERTIFICATIONS"><Bullets items={r.certifications} /></Section>}
      {r.achievements?.length > 0 && <Section title="HONORS & AWARDS"><Bullets items={r.achievements} /></Section>}
    </div>
  );
}