import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  RefreshCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import logoUrl from './assets/logo.jpg';
import './styles.css';

const API_BASE_DEFAULT = import.meta.env.VITE_API_BASE || '';
const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE || '';

const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    keyName: 'openrouter',
    keyPlaceholder: 'sk-or-v1-...',
    mainModel: 'openrouter/google/gemini-3.1-pro-preview',
    imageModel: 'openrouter/google/gemini-3.1-flash-image-preview',
  },
  gemini: {
    label: 'Gemini',
    keyName: 'gemini',
    keyPlaceholder: 'AIza...',
    mainModel: 'gemini-3.1-pro-preview',
    imageModel: 'gemini-3.1-flash-image-preview',
  },
  openai: {
    label: 'OpenAI',
    keyName: 'openai',
    keyPlaceholder: 'sk-...',
    mainModel: 'gpt-4o',
    imageModel: 'gpt-image-1',
  },
};

const SAMPLE_METHOD = `We propose a retrieval-augmented multi-agent framework for academic illustration. A retriever first selects relevant reference figures. A planner turns the method section and figure caption into a detailed visual specification. A style agent enriches the specification with publication-ready layout and color guidance. A visualizer renders candidate diagrams, and a critic iteratively checks semantic alignment and readability.`;

function App() {
  const [apiBase, setApiBase] = useState(API_BASE_DEFAULT);
  const [provider, setProvider] = useState('openrouter');
  const [apiKeys, setApiKeys] = useState({ openrouter: '', gemini: '', openai: '' });
  const [methodContent, setMethodContent] = useState(SAMPLE_METHOD);
  const [caption, setCaption] = useState('Figure 1: Overview of the proposed multi-agent academic illustration framework.');
  const [mainModelName, setMainModelName] = useState(PROVIDERS.openrouter.mainModel);
  const [imageGenModelName, setImageGenModelName] = useState(PROVIDERS.openrouter.imageModel);
  const [pipelineMode, setPipelineMode] = useState('demo_planner_critic');
  const [retrievalSetting, setRetrievalSetting] = useState('none');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [numCandidates, setNumCandidates] = useState(1);
  const [maxCriticRounds, setMaxCriticRounds] = useState(1);
  const [health, setHealth] = useState(null);
  const [mock, setMock] = useState(false);
  const [currentJobId, setCurrentJobId] = useState('');
  const [job, setJob] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [adminJobs, setAdminJobs] = useState([]);
  const [adminError, setAdminError] = useState('');

  const providerConfig = PROVIDERS[provider];
  const selectedKey = apiKeys[providerConfig.keyName] || '';
  const apiBaseNormalized = apiBase.replace(/\/$/, '');

  useEffect(() => {
    let cancelled = false;
    fetchBackendHealth(apiBaseNormalized)
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseNormalized]);

  useEffect(() => {
    setMainModelName(PROVIDERS[provider].mainModel);
    setImageGenModelName(PROVIDERS[provider].imageModel);
  }, [provider]);

  useEffect(() => {
    if (!currentJobId) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getJobRequest(apiBaseNormalized, health, currentJobId);
        if (!cancelled) setJob(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiBaseNormalized, currentJobId, health]);

  const canSubmit = useMemo(() => {
    const hasKey = selectedKey.trim();
    const canMock = mock && health?.mock_enabled;
    return (hasKey || canMock) && methodContent.trim().length >= 20 && caption.trim().length >= 3 && !isSubmitting;
  }, [selectedKey, methodContent, caption, isSubmitting, mock, health]);

  async function submitJob(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    setJob(null);
    try {
      const payload = {
        provider,
        apiKeys,
        taskName: 'diagram',
        methodContent,
        caption,
        mainModelName,
        imageGenModelName,
        pipelineMode,
        retrievalSetting,
        aspectRatio,
        numCandidates: Number(numCandidates),
        maxCriticRounds: Number(maxCriticRounds),
        mock,
      };
      const created = await createJobRequest(apiBaseNormalized, health, payload);
      setCurrentJobId(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loadAdminJobs() {
    setAdminError('');
    try {
      const data = await adminJobsRequest(apiBaseNormalized, health, adminToken);
      setAdminJobs(data.jobs || []);
    } catch (err) {
      setAdminError(err.message);
    }
  }

  return (
    <main className="app-shell">
      <header className="paper-header">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="PaperBanana logo" />
          <div>
            <h1>PaperBanana Studio</h1>
            <div className="brand-tags">
              <span>Multi-Agent</span>
              <span>Scientific Diagrams</span>
            </div>
          </div>
        </div>
        <div className="header-links">
          <a href="https://huggingface.co/papers/2601.23265" target="_blank" rel="noreferrer">
            <FileText size={16} /> Paper
          </a>
          <a href="https://github.com/dwzhu-pku/PaperBanana" target="_blank" rel="noreferrer">
            <Sparkles size={16} /> GitHub
          </a>
        </div>
      </header>

      <nav className="paper-tabs">
        <button type="button" className="active">Generate Candidates</button>
        <button type="button">Task History</button>
      </nav>

      <section className="workspace">
        <form className="generator" onSubmit={submitJob}>
          <div className="section-head">
            <Settings2 size={20} />
            <div>
              <h2>Settings</h2>
              <p>Select provider, pipeline, and rendering options.</p>
            </div>
          </div>

          <div className="field">
            <span>Model Provider</span>
            <div className="segmented">
              {Object.entries(PROVIDERS).map(([id, item]) => (
                <button
                  type="button"
                  key={id}
                  className={provider === id ? 'active' : ''}
                  onClick={() => setProvider(id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <details className="api-keys-panel" open>
            <summary><KeyRound size={17} /> API Keys</summary>
            <p>You do not need all keys. Fill the key for the selected provider.</p>
            <label className="field">
              <span>{providerConfig.label} API Key</span>
              <div className="key-input">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={selectedKey}
                  onChange={(event) => setApiKeys({ ...apiKeys, [providerConfig.keyName]: event.target.value })}
                  placeholder={providerConfig.keyPlaceholder}
                  autoComplete="off"
                />
              </div>
            </label>
          </details>

          <label className="field">
            <span>API Base</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="Leave empty for same-origin backend" />
          </label>

          <div className="settings-grid">
            <Select label="Pipeline Mode" value={pipelineMode} onChange={setPipelineMode} options={[
              ['demo_planner_critic', 'Planner + Critic'],
              ['demo_full', 'Full Pipeline'],
              ['vanilla', 'Vanilla'],
            ]} />
            <Select label="Retrieval Setting" value={retrievalSetting} onChange={setRetrievalSetting} options={[
              ['none', 'None'],
              ['auto', 'Auto'],
              ['random', 'Random'],
              ['manual', 'Manual'],
            ]} />
            <Select label="Aspect Ratio" value={aspectRatio} onChange={setAspectRatio} options={[
              ['16:9', '16:9'],
              ['21:9', '21:9'],
              ['3:2', '3:2'],
              ['1:1', '1:1'],
            ]} />
            <label className="field compact">
              <span>Candidates</span>
              <input type="number" min="1" max="4" value={numCandidates} onChange={(event) => setNumCandidates(event.target.value)} />
            </label>
            <label className="field compact">
              <span>Critic 轮数</span>
              <input type="number" min="0" max="3" value={maxCriticRounds} onChange={(event) => setMaxCriticRounds(event.target.value)} />
            </label>
          </div>

          <div className="model-grid">
            <label className="field">
              <span>Model Name</span>
              <input value={mainModelName} onChange={(event) => setMainModelName(event.target.value)} />
            </label>
            <label className="field">
              <span>Image Generation Model</span>
              <input value={imageGenModelName} onChange={(event) => setImageGenModelName(event.target.value)} />
            </label>
          </div>

          {health?.mock_enabled ? (
            <label className="mock-switch">
              <input type="checkbox" checked={mock} onChange={(event) => setMock(event.target.checked)} />
              <span>Mock 模式</span>
            </label>
          ) : null}

          <button className="primary-button" type="submit" disabled={!canSubmit}>
            {isSubmitting ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Generate Candidates
          </button>
          {error ? <div className="error-line"><AlertTriangle size={16} /> {error}</div> : null}
        </form>

        <section className="input-results">
          <div className="section-head">
            <FileText size={20} />
            <div>
              <h2>Input</h2>
              <p>Paste the method section and target figure caption.</p>
            </div>
          </div>

          <div className="two-col input-copy">
            <label className="field">
              <span>Method Content</span>
              <textarea value={methodContent} onChange={(event) => setMethodContent(event.target.value)} rows={12} />
            </label>

            <label className="field">
              <span>Figure Caption</span>
              <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={12} />
            </label>
          </div>

          <div className="section-head results-head">
            <ImageIcon size={20} />
            <div>
              <h2>Generated Candidates</h2>
              <p>{currentJobId ? `Task ${currentJobId}` : 'Submit a task to show generated diagrams.'}</p>
            </div>
          </div>
          <JobStatus job={job} apiBase={apiBaseNormalized} />
        </section>
      </section>

      <section className="admin-panel">
        <div className="section-head">
          <Eye size={20} />
          <div>
            <h2>Admin Observability</h2>
            <p>Use ADMIN_TOKEN to view recent jobs, model choices, and failures.</p>
          </div>
        </div>
        <div className="admin-controls">
          <input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="ADMIN_TOKEN" />
          <button type="button" onClick={loadAdminJobs}><RefreshCcw size={17} />刷新</button>
        </div>
        {adminError ? <div className="error-line"><AlertTriangle size={16} /> {adminError}</div> : null}
        <div className="job-table">
          <div className="job-row head">
            <span>时间</span>
            <span>状态</span>
            <span>接口</span>
            <span>模型</span>
            <span>输入</span>
          </div>
          {adminJobs.map((item) => (
            <div className="job-row" key={item.id}>
              <span>{formatDate(item.created_at || item.createdAt)}</span>
              <span><StatusBadge status={item.status} /></span>
              <span>{item.provider}</span>
              <span title={`${item.main_model_name} / ${item.image_gen_model_name}`}>{item.main_model_name}</span>
              <span title={item.caption}>{item.prompt_char_count} chars</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field compact">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
}

function JobStatus({ job, apiBase }) {
  if (!job) {
    return (
      <div className="empty-state">
        <Settings2 size={34} />
        <p>等待新任务</p>
      </div>
    );
  }

  return (
    <div className="job-detail">
      <div className="status-strip">
        <StatusBadge status={job.status} />
        <span>{job.provider}</span>
        <span>{job.aspect_ratio}</span>
        <span>{job.num_candidates} candidates</span>
      </div>
      {job.error ? <div className="error-line"><AlertTriangle size={16} /> {job.error}</div> : null}
      <div className="image-grid">
        {job.result_images.map((image) => (
          <figure key={image.filename}>
            <img src={resolveImageUrl(apiBase, image.url)} alt={`Candidate ${image.candidate_id + 1}`} />
            <figcaption>Candidate {image.candidate_id + 1}</figcaption>
          </figure>
        ))}
      </div>
      {job.status === 'running' || job.status === 'queued' ? (
        <div className="running-line"><Loader2 className="spin" size={17} />生成中，页面会自动刷新。</div>
      ) : null}
      {job.status === 'failed' && job.logs_tail ? <pre className="logs">{job.logs_tail}</pre> : null}
    </div>
  );
}

function StatusBadge({ status }) {
  const className = `status-badge ${status}`;
  const icon = status === 'succeeded' ? <CheckCircle2 size={15} /> : status === 'failed' ? <AlertTriangle size={15} /> : <Loader2 className="spin" size={15} />;
  return <span className={className}>{icon}{status}</span>;
}

async function fetchBackendHealth(apiBase) {
  const candidates = lafEndpoint(apiBase) === apiBase
    ? [{ mode: 'laf', url: apiBase }]
    : [
        { mode: 'laf', url: lafEndpoint(apiBase) },
        { mode: 'fastapi', url: `${apiBase}/api/health` },
      ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const data = await fetchJson(candidate.url);
      if (candidate.mode === 'laf' && data.runtime !== 'laf') throw new Error('Not a Laf backend');
      if (candidate.mode === 'fastapi' && !data.ok) throw new Error('Not a FastAPI backend');
      return { ...data, backendMode: candidate.mode };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Backend is unavailable');
}

async function createJobRequest(apiBase, health, payload) {
  if (shouldUseLaf(apiBase, health)) {
    const data = await fetchJson(lafEndpoint(apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createJob',
        provider: payload.provider,
        apiKeys: payload.apiKeys,
        methodContent: payload.methodContent,
        caption: payload.caption,
        mainModelName: payload.mainModelName,
        imageModelName: payload.imageGenModelName,
        pipelineMode: toLafPipeline(payload.pipelineMode),
        aspectRatio: payload.aspectRatio,
        numCandidates: payload.numCandidates,
        maxCriticRounds: payload.maxCriticRounds,
      }),
    });
    return { id: data.jobId, status: data.status };
  }

  return fetchJson(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: payload.provider,
      api_keys: payload.apiKeys,
      task_name: payload.taskName,
      method_content: payload.methodContent,
      caption: payload.caption,
      main_model_name: payload.mainModelName,
      image_gen_model_name: payload.imageGenModelName,
      pipeline_mode: payload.pipelineMode,
      retrieval_setting: payload.retrievalSetting,
      aspect_ratio: payload.aspectRatio,
      num_candidates: payload.numCandidates,
      max_critic_rounds: payload.maxCriticRounds,
      mock: payload.mock,
    }),
  });
}

async function getJobRequest(apiBase, health, jobId) {
  if (shouldUseLaf(apiBase, health)) {
    const data = await fetchJson(lafEndpoint(apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getJob', jobId }),
    });
    return normalizeJob(data.job);
  }
  return fetchJson(`${apiBase}/api/jobs/${jobId}`);
}

async function adminJobsRequest(apiBase, health, adminToken) {
  if (shouldUseLaf(apiBase, health)) {
    const data = await fetchJson(lafEndpoint(apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'adminJobs', adminToken, limit: 50 }),
    });
    return { jobs: (data.jobs || []).map(normalizeJob) };
  }
  return fetchJson(`${apiBase}/api/admin/jobs?limit=50`, {
    headers: { 'x-admin-token': adminToken },
  });
}

function shouldUseLaf(apiBase, health) {
  if (BACKEND_MODE === 'fastapi') return false;
  if (BACKEND_MODE === 'laf') return true;
  if (health?.backendMode) return health.backendMode === 'laf';
  return apiBase.includes('paperbanana-api') || apiBase === '';
}

function lafEndpoint(apiBase) {
  if (apiBase.endsWith('/paperbanana-api')) return apiBase;
  return `${apiBase}/paperbanana-api`;
}

function toLafPipeline(mode) {
  if (mode === 'demo_full') return 'full';
  if (mode === 'vanilla') return 'vanilla';
  return 'planner_critic';
}

function normalizeJob(job = {}) {
  return {
    id: job.id || job._id,
    status: job.status,
    provider: job.provider,
    method_content: job.method_content || job.methodContent || '',
    caption: job.caption || '',
    main_model_name: job.main_model_name || job.mainModelName || '',
    image_gen_model_name: job.image_gen_model_name || job.imageModelName || '',
    pipeline_mode: job.pipeline_mode || job.pipelineMode || '',
    aspect_ratio: job.aspect_ratio || job.aspectRatio || '',
    num_candidates: job.num_candidates || job.numCandidates || 0,
    max_critic_rounds: job.max_critic_rounds || job.maxCriticRounds || 0,
    prompt_char_count: job.prompt_char_count || job.promptCharCount || 0,
    result_images: (job.result_images || job.resultImages || []).map((image, index) => ({
      filename: image.filename || image.url || `${index}`,
      url: image.url,
      candidate_id: image.candidate_id ?? image.candidateId ?? index,
      mime_type: image.mime_type || image.mimeType || '',
    })),
    logs_tail: job.logs_tail || (Array.isArray(job.logs) ? job.logs.slice(-10).join('\n') : ''),
    error: job.error || '',
    created_at: job.created_at || job.createdAt,
    updated_at: job.updated_at || job.updatedAt,
    started_at: job.started_at || job.startedAt,
    completed_at: job.completed_at || job.completedAt,
  };
}

function resolveImageUrl(apiBase, url) {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${apiBase}${url}`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!res.ok || (data.code && data.code !== 0)) {
    throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

createRoot(document.getElementById('root')).render(<App />);
