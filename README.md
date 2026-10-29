# 🎯 Candidate Signal

**A Unified Engineering Competency Analytics & ATS-Optimized Placement Engine**

Candidate Signal bridges the gap between student technical proof-of-work, institutional placement workflows, and automated corporate recruitment. By aggregating and mathematically normalizing coding activity across multiple platforms, including LeetCode, Codeforces, CodeChef, HackerRank, and GitHub, Candidate Signal provides unpenalized multi-platform scoring, dual-track placement leaderboards, actionable algorithmic recourse, and automated ATS-optimized resume compilation.

---

## 📌 Problem Statement

- **Fragmented Portfolios:** Student proof-of-work is split across multiple competitive programming and version control platforms that use conflicting rating models.
- **Verification Bottlenecks:** College training and placement cells spend dozens of hours manually verifying spreadsheets, leading to human error and vulnerability to tampered credentials.
- **ATS Gatekeeping:** Qualified engineering students are frequently filtered out by automated corporate Applicant Tracking Systems (ATS) due to non-standard layouts, missing keywords, and unquantified achievements.

---

## ✨ Key Features

- **Dynamic Normalization Engine:** Employs a drop-and-renormalize algorithm across LeetCode, Codeforces, CodeChef, HackerRank, and GitHub, evaluating candidates based on available platform data without penalizing missing accounts.
- **Decoupled Dual-Track Leaderboards:**
  - **Global CP Track:** Evaluates pure algorithmic problem-solving skills and competitive programming ratings.
  - **Institutional Placement Track:** Integrates institutional rubrics, including academics, hackathons, certifications, and GitHub activity.
- **Algorithmic Recourse:** Prescribes concrete, actionable milestones, such as targeting medium-level DSA problems or achieving contest rating thresholds, to help candidates reach higher ranking percentiles.
- **NLP Resume Auditor & Builder:** Analyzes resumes against target Job Descriptions (JDs) using vector cosine similarity, keyword density checks, and single-column ATS-compliant DOCX document generation.
- **Tamper-Proof Profile Locking:** Candidate handles are verified and permanently locked upon onboarding to maintain administrative data integrity.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Recharts for radar charts, progress indicators, and percentile visualizations.
- **Backend:** Node.js, Express.js REST API.
- **Data Ingestion:** Automated scraping workers and GraphQL endpoints for platforms such as LeetCode and GitHub API integrations.
- **NLP & Document Processing:** Vector cosine similarity, keyword extraction, PDF parsing using `pdf2json`, and DOCX generation.
- **AI Integration:** Google Gemini API for contextual feedback and semantic analysis.

---

## 🏗️ Architecture & Pipeline

```text
             [ Coding Handles & Job Descriptions ]
                            |
                            v
          +------------------------------------------+
          |       Asynchronous Ingestion Service     |
          | LeetCode, Codeforces, CodeChef, GitHub   |
          +---------------------+--------------------+
                                |
                                v
          +------------------------------------------+
          |       Dynamic Normalization & eCDF       |
          |                                          |
          |  - 100-Point Technical Index             |
          |  - Dual-Track Placement Leaderboards     |
          +---------------------+--------------------+
                                |
                                v
          +------------------------------------------+
          |       NLP ATS Engine & Recourse Loop     |
          |                                          |
          |  - Cosine Similarity Audit               |
          |  - Actionable DSA Milestones             |
          |  - ATS-Compliant DOCX Export             |
          +------------------------------------------+
```

---

## 🚀 Getting Started

### Prerequisites

Ensure that the following tools are installed on your system:

- [Node.js](https://nodejs.org/) (v18.x or later)
- [npm](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)
- Google Gemini API key for NLP and semantic analysis

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/your-username/candidate-signal.git
cd candidate-signal
```

Replace `your-username` with the appropriate GitHub username or repository owner.

#### 2. Backend Setup

Navigate to the server directory and install the dependencies:

```bash
cd server
npm install
```

Create a `.env` file in the `server` directory and add the following configuration:

```ini
PORT=5000
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the backend server:

```bash
npm run dev
```

#### 3. Frontend Setup

Open a new terminal, navigate to the client directory, and install the dependencies:

```bash
cd client
npm install
```

Start the frontend development server:

```bash
npm run dev
```

Open the application in your browser at:

```text
http://localhost:5173
```

---

## 👥 Contributors

| Name | Role | Focus Area |
|---|---|---|
| **Pragnya Sai Sowmya Mogalla** | Backend & Scoring Lead | Normalization algorithms, composite CP index, and ML ranking |
| **Mohammed Omair Hussain** | Resume & ATS Lead | Cosine similarity, NLP parsing, and ATS keyword analysis |
| **Rudrani Deshpande** | Community & Auth Lead | Authentication, access controls, and community management |
| **Ansh Zade** | QA & Documentation Lead | System testing, defect verification, and documentation |
| **Sahil Chahare** | Frontend Lead | React architecture, performance charts, and rank simulator |

---

## 🎯 Project Objectives

- Unify coding performance and technical achievements across multiple platforms.
- Provide fair, dynamically normalized candidate scoring.
- Simplify institutional placement tracking and candidate verification.
- Help students identify skill gaps through actionable improvement recommendations.
- Improve resume compatibility with ATS systems through keyword analysis and standardized document generation.
- Support data-driven placement decisions through interactive leaderboards and analytics.

---

## 🔮 Future Enhancements

- Integration with additional competitive programming and professional portfolio platforms.
- Advanced analytics for skill-gap detection and personalized learning recommendations.
- Institution-specific dashboards and placement reports.
- Automated resume tailoring for different job descriptions.
- Role-based access control for students, placement officers, and administrators.
- Enhanced profile verification and fraud detection mechanisms.

---

## 📄 License

This project is developed for educational and placement-readiness purposes. Add an appropriate open-source license if you intend to distribute the project publicly.
