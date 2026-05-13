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
  bailian: {
    label: '阿里百炼',
    keyName: 'bailian',
    keyPlaceholder: 'sk-...',
    mainModel: 'qwen-plus',
    imageModel: 'wan2.7-image',
  },
};

const SAMPLE_METHOD = `我们提出一个用于学术图示生成的检索增强多智能体框架。检索器会先从参考库中选择相关图例，规划器再把论文方法部分和目标图注转换为详细的视觉规格。风格智能体会补充适合论文发表的版式与配色建议，生成器据此渲染多张候选图，评审器则迭代检查语义一致性与可读性。`;

const STATUS_LABELS = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
};

function App() {
  const [apiBase, setApiBase] = useState(API_BASE_DEFAULT);
  const [provider, setProvider] = useState('openrouter');
  const [apiKeys, setApiKeys] = useState({ openrouter: '', gemini: '', openai: '', bailian: '' });
  const [methodContent, setMethodContent] = useState(SAMPLE_METHOD);
  const [caption, setCaption] = useState('图 1：所提出的多智能体学术图示生成框架总览。');
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
          <img className="brand-logo" src={logoUrl} alt="PaperBanana 标志" />
          <div>
            <h1>PaperBanana 工作台</h1>
            <div className="brand-tags">
              <span>多智能体</span>
              <span>学术图示生成</span>
            </div>
          </div>
        </div>
        <div className="header-links">
          <a href="https://huggingface.co/papers/2601.23265" target="_blank" rel="noreferrer">
            <FileText size={16} /> 论文
          </a>
          <a href="https://github.com/dwzhu-pku/PaperBanana" target="_blank" rel="noreferrer">
            <Sparkles size={16} /> GitHub
          </a>
        </div>
      </header>

      <nav className="paper-tabs">
        <button type="button" className="active">生成候选图</button>
        <button type="button">任务记录</button>
      </nav>

      <section className="workspace">
        <form className="generator" onSubmit={submitJob}>
          <div className="section-head">
            <Settings2 size={20} />
            <div>
              <h2>生成设置</h2>
              <p>选择模型接口、生成流程和图像渲染参数。</p>
            </div>
          </div>

          <div className="field">
            <span>模型接口</span>
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
            <summary><KeyRound size={17} /> API 密钥</summary>
            <p>不需要填写全部密钥，只填当前选中的模型接口即可。</p>
            <label className="field">
              <span>{providerConfig.label} API 密钥</span>
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
            <span>后端地址</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="留空则使用同源后端" />
          </label>

          <div className="settings-grid">
            <Select label="生成流程" value={pipelineMode} onChange={setPipelineMode} options={[
              ['demo_planner_critic', '规划器 + 评审器'],
              ['demo_full', '完整流程'],
              ['vanilla', '基础生成'],
            ]} />
            <Select label="检索设置" value={retrievalSetting} onChange={setRetrievalSetting} options={[
              ['none', '不使用检索'],
              ['auto', '自动检索'],
              ['random', '随机参考'],
              ['manual', '手动参考'],
            ]} />
            <Select label="画面比例" value={aspectRatio} onChange={setAspectRatio} options={[
              ['16:9', '16:9'],
              ['21:9', '21:9'],
              ['3:2', '3:2'],
              ['1:1', '1:1'],
            ]} />
            <label className="field compact">
              <span>候选图数量</span>
              <input type="number" min="1" max="4" value={numCandidates} onChange={(event) => setNumCandidates(event.target.value)} />
            </label>
            <label className="field compact">
              <span>评审轮数</span>
              <input type="number" min="0" max="3" value={maxCriticRounds} onChange={(event) => setMaxCriticRounds(event.target.value)} />
            </label>
          </div>

          <div className="model-grid">
            <label className="field">
              <span>主模型名称</span>
              <input value={mainModelName} onChange={(event) => setMainModelName(event.target.value)} />
            </label>
            <label className="field">
              <span>图像生成模型</span>
              <input value={imageGenModelName} onChange={(event) => setImageGenModelName(event.target.value)} />
            </label>
          </div>

          {health?.mock_enabled ? (
            <label className="mock-switch">
              <input type="checkbox" checked={mock} onChange={(event) => setMock(event.target.checked)} />
              <span>模拟模式</span>
            </label>
          ) : null}

          <button className="primary-button" type="submit" disabled={!canSubmit}>
            {isSubmitting ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            生成候选图
          </button>
          {error ? <div className="error-line"><AlertTriangle size={16} /> {formatErrorMessage(error)}</div> : null}
        </form>

        <section className="input-results">
          <div className="section-head">
            <FileText size={20} />
            <div>
              <h2>输入内容</h2>
              <p>粘贴论文方法部分和目标图注。</p>
            </div>
          </div>

          <div className="two-col input-copy">
            <label className="field">
              <span>论文方法内容</span>
              <textarea value={methodContent} onChange={(event) => setMethodContent(event.target.value)} rows={12} />
            </label>

            <label className="field">
              <span>目标图注</span>
              <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={12} />
            </label>
          </div>

          <div className="section-head results-head">
            <ImageIcon size={20} />
            <div>
              <h2>生成结果</h2>
              <p>{currentJobId ? `任务编号 ${currentJobId}` : '提交任务后显示生成结果。'}</p>
            </div>
          </div>
          <JobStatus job={job} apiBase={apiBaseNormalized} />
        </section>
      </section>

      <section className="admin-panel">
        <div className="section-head">
          <Eye size={20} />
          <div>
            <h2>站长观察面板</h2>
            <p>输入 ADMIN_TOKEN 查看最近任务、模型选择和失败原因。</p>
          </div>
        </div>
        <div className="admin-controls">
          <input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="ADMIN_TOKEN" />
          <button type="button" onClick={loadAdminJobs}><RefreshCcw size={17} />刷新</button>
        </div>
        {adminError ? <div className="error-line"><AlertTriangle size={16} /> {formatErrorMessage(adminError)}</div> : null}
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
              <span title={item.caption}>{item.prompt_char_count} 字</span>
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
        <span>{job.num_candidates} 张候选图</span>
      </div>
      {job.error ? <div className="error-line"><AlertTriangle size={16} /> {formatErrorMessage(job.error)}</div> : null}
      <div className="image-grid">
        {job.result_images.map((image) => (
          <figure key={image.filename}>
            <img src={resolveImageUrl(apiBase, image.url)} alt={`候选图 ${image.candidate_id + 1}`} />
            <figcaption>候选图 {image.candidate_id + 1}</figcaption>
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
  return <span className={className}>{icon}{STATUS_LABELS[status] || status || '未知'}</span>;
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
      if (candidate.mode === 'laf' && data.runtime !== 'laf') throw new Error('当前地址不是 Laf 后端');
      if (candidate.mode === 'fastapi' && !data.ok) throw new Error('当前地址不是 FastAPI 后端');
      return { ...data, backendMode: candidate.mode };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('后端暂时不可用');
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

function formatErrorMessage(message) {
  if (!message) return '';
  if (message.includes('Missing API key')) return '缺少所选模型接口的 API 密钥。';
  if (message.includes('ADMIN_TOKEN is not configured')) return '管理接口未启用：还没有配置 ADMIN_TOKEN。';
  if (message.includes('Admin API disabled')) return '管理接口未启用。';
  if (message.includes('Backend is unavailable')) return '后端暂时不可用。';
  if (message.includes('HTTP 503')) return '服务暂时不可用，请稍后重试。';
  return message;
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
