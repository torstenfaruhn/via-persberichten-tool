'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { safeLog } = require('./src/security/safeLog');

const { processDocument } = require('./src/process/processDocument');

const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || '10');
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const TMP_ROOT = path.join(os.tmpdir(), 'via-tool');
const JOB_TTL_MS = 30 * 60 * 1000;

const jobs = new Map(); // jobId -> { dir, inputPath, outputPath, createdAt, status }

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests'
    ].join('; ')
  );
  next();
});

// Basic in-memory rate limit (technical only)
const rate = new Map(); // ip -> { count, resetAt }
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;

app.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rate.get(ip);

  if (!entry || now > entry.resetAt) {
    rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_MAX) {
    return res.status(429).json({
      status: 'error',
      signals: [{ code: 'W010', message: 'Te veel aanvragen. Wacht even en probeer het opnieuw.' }],
      techHelp: true,
      auditLogUrl: null
    });
  }
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

async function ensureTmpRoot() {
  await fsp.mkdir(TMP_ROOT, { recursive: true });
}

function isAllowedExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ['.txt', '.docx', '.pdf'].includes(ext);
}

function auditLogStream(res, { processed, errorCode }) {
  const payload = {
    processed: Boolean(processed),
    errorCode: errorCode || null,
    timestamp: new Date().toISOString()
  };
  const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="via-tool-audit.json"');
  res.setHeader('Content-Length', String(data.length));
  res.status(200).end(data);
}

async function cleanupJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.delete(jobId);
  try {
    await fsp.rm(job.dir, { recursive: true, force: true });
  } catch (_) {}
}

setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) cleanupJob(jobId);
  }
}, 60 * 1000).unref();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

function requireApiKey(req, res, next) {
  const apiKey = (req.header('X-API-Key') || '').trim();
  if (!apiKey) {
    return res.status(401).json({
      status: 'error',
      signals: [{ code: 'W010', message: 'API-key ontbreekt. Vul je API-key in en probeer het opnieuw.' }],
      techHelp: false,
      auditLogUrl: null
    });
  }
  req.apiKey = apiKey;
  next();
}

app.post('/api/upload', requireApiKey, upload.single('file'), async (req, res) => {
  try {
    await ensureTmpRoot();

    if (!req.file || !req.file.originalname) {
      return res.status(400).json({
        status: 'error',
        signals: [{ code: 'E002', message: 'Bestand ontbreekt of kan niet worden gelezen. Upload opnieuw.' }],
        techHelp: false,
        auditLogUrl: null
      });
    }

    if (!isAllowedExt(req.file.originalname)) {
      return res.status(400).json({
        status: 'error',
        signals: [{ code: 'E002', message: 'Bestandstype niet ondersteund. Upload een .txt, .docx of .pdf.' }],
        techHelp: false,
        auditLogUrl: null
      });
    }

    const jobId = uuidv4();
    const dir = path.join(TMP_ROOT, jobId);
    await fsp.mkdir(dir, { recursive: true });

    const inputPath = path.join(dir, 'input' + path.extname(req.file.originalname).toLowerCase());
    await fsp.writeFile(inputPath, req.file.buffer);

    jobs.set(jobId, {
      dir,
      inputPath,
      outputPath: path.join(dir, 'output.txt'),
      createdAt: Date.now(),
      status: 'uploaded'
    });

    safeLog('job_status:uploaded');
    return res.status(200).json({ status: 'ok', jobId });
} catch (err) {
  job.status = 'error';
  const traceId = `t_${jobId}_${Date.now()}`;
  safeLogError(err, { at: 'api/process', code: 'W010', traceId });

  return res.status(500).json({
    status: 'error',
    signals: [{ code: 'W010', message: 'Technisch probleem tijdens verwerking. Herlaad de pagina (Ctrl+F5) en probeer het opnieuw.' }],
    techHelp: true,
    auditLogUrl: `/api/error-log?jobId=${encodeURIComponent(jobId)}&code=W010`,
    traceId
  });
}

});

app.post('/api/process', requireApiKey, async (req, res) => {
  const jobId = (req.body && req.body.jobId) || '';
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      signals: [{ code: 'W010', message: 'Upload opnieuw. Dit bestand is niet (meer) beschikbaar.' }],
      techHelp: false,
      auditLogUrl: null
    });
  }

  try {
    job.status = 'processing';
    safeLog('job_status:processing');

    const result = await processDocument({
      inputPath: job.inputPath,
      outputPath: job.outputPath,
      apiKey: req.apiKey,
      maxSeconds: 360
    });

    if (!result || result.ok !== true) {
      const errorCode = result?.errorCode || 'W010';
      job.status = 'error';
      safeLog(`error_code:${errorCode}`);

      return res.status(400).json({
        status: 'error',
        signals: result?.signals || [{ code: errorCode, message: 'Verwerking mislukt. Probeer het opnieuw.' }],
        techHelp: Boolean(result?.techHelp),
        auditLogUrl: `/api/error-log?jobId=${encodeURIComponent(jobId)}&code=${encodeURIComponent(errorCode)}`
      });
    }

    job.status = 'done';
    safeLog('job_status:done');

    return res.status(200).json({
      status: 'ok',
      signals: result.signals || []
    });
  } catch (_) {
    job.status = 'error';
    safeLog('error_code:W010');
    return res.status(500).json({
      status: 'error',
      signals: [{ code: 'W010', message: 'Technisch probleem tijdens verwerking. Herlaad de pagina (Ctrl+F5) en probeer het opnieuw.' }],
      techHelp: true,
      auditLogUrl: `/api/error-log?jobId=${encodeURIComponent(jobId)}&code=W010`
    });
  }
});

app.get('/api/download', requireApiKey, async (req, res) => {
  const jobId = (req.query.jobId || '').toString();
  const job = jobs.get(jobId);

  if (!job || job.status !== 'done') {
    return res.status(404).json({
      status: 'error',
      signals: [{ code: 'W010', message: 'Er is geen download beschikbaar. Bewerk het document opnieuw.' }],
      techHelp: false,
      auditLogUrl: null
    });
  }

  try {
    await fsp.access(job.outputPath, fs.constants.R_OK);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nieuwsbericht.txt"');

    const stream = fs.createReadStream(job.outputPath);
    stream.pipe(res);

    stream.on('close', async () => {
      await cleanupJob(jobId);
    });
    stream.on('error', async () => {
      await cleanupJob(jobId);
    });
  } catch (_) {
    safeLog('error_code:W010');
    return res.status(500).json({
      status: 'error',
      signals: [{ code: 'W010', message: 'Technisch probleem bij downloaden. Probeer het opnieuw.' }],
      techHelp: true,
      auditLogUrl: `/api/error-log?jobId=${encodeURIComponent(jobId)}&code=W010`
    });
  }
});

app.get('/api/error-log', async (req, res) => {
  const jobId = (req.query.jobId || '').toString();
  const code = (req.query.code || 'W010').toString();
  auditLogStream(res, { processed: false, errorCode: code });
  if (jobId) cleanupJob(jobId);
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.listen(PORT, async () => {
  await ensureTmpRoot();
  safeLog(`server_started:${PORT}`);
});
