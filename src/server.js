import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { config, publicConfig, validateLiveSending } from './config.js';
import { addEvent, getLead, getState, loadState, refreshState, resetFromWorkbook, saveState, updateLead } from './store.js';
import { activateCampaign, limitStatus, pauseCampaign, processNext, startScheduler } from './scheduler.js';
import { sendLeadEmail, verifySentMailbox, verifySmtp } from './mailer.js';
import { syncInbox } from './inbox.js';
import { researchLead } from './research.js';
import { exportCsv, stateKpis, stats } from './reporting.js';
import { resetEmailJobs } from './supabaseStore.js';
import {
  changePassword,
  createUser,
  deleteUser,
  listUsers,
  login,
  logout,
  me,
  requireAdmin,
  requireAuth,
  validateSameOrigin,
} from './auth.js';

let initialization;

export function initializeApp() {
  initialization ||= loadState();
  return initialization;
}

export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve('./public')));

function asyncRoute(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
}

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/login', asyncRoute(login));
app.use('/api', asyncRoute(requireAuth));
app.use('/api', validateSameOrigin);
app.get('/api/auth/me', me);
app.post('/api/auth/logout', asyncRoute(logout));
app.post('/api/auth/password', asyncRoute(changePassword));
app.get('/api/auth/users', requireAdmin, asyncRoute(listUsers));
app.post('/api/auth/users', requireAdmin, asyncRoute(createUser));
app.delete('/api/auth/users/:id', requireAdmin, asyncRoute(deleteUser));

app.use('/api', asyncRoute(async (_req, _res, next) => {
  await initializeApp();
  await refreshState();
  next();
}));

function leadOr404(req, res) {
  const lead = getLead(req.params.id);
  if (!lead) res.status(404).json({ error: 'Lead não encontrado.' });
  return lead;
}

app.get('/api/config', (_req, res) => res.json(publicConfig()));
app.get('/api/stats', (_req, res) => res.json({ ...stats(), limits: limitStatus() }));
app.get('/api/kpis/states', (_req, res) => res.json(stateKpis()));
app.get('/api/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(getState().events.slice(0, limit));
});

app.get('/api/leads', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '');
  const confidence = String(req.query.confidence || '');
  const approval = String(req.query.approval || '');
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 5), 100);

  let leads = getState().leads;
  if (q) leads = leads.filter((l) => [l.company, l.email, l.city, l.uf, l.segment].join(' ').toLowerCase().includes(q));
  if (status) leads = leads.filter((l) => l.campaignStatus === status);
  if (confidence) leads = leads.filter((l) => l.confidence === confidence);
  if (approval === 'approved') leads = leads.filter((l) => l.approved);
  if (approval === 'pending') leads = leads.filter((l) => !l.approved && l.canSend);
  if (approval === 'blocked') leads = leads.filter((l) => !l.canSend || l.optedOut || l.bounce);

  const total = leads.length;
  const start = (page - 1) * pageSize;
  res.json({ total, page, pageSize, leads: leads.slice(start, start + pageSize) });
});

app.get('/api/leads/:id', (req, res) => {
  const lead = leadOr404(req, res);
  if (lead) res.json(lead);
});

app.patch('/api/leads/:id', asyncRoute(async (req, res) => {
  const lead = leadOr404(req, res);
  if (!lead) return;
  const allowed = [
    'subject', 'initialBody', 'followup1Body', 'followup2Body', 'notes', 'responseClass',
    'paused', 'email', 'specificSource', 'personalizationBasis', 'confidence',
  ];
  const patch = {};
  for (const key of allowed) if (Object.hasOwn(req.body, key)) patch[key] = req.body[key];
  if (Object.hasOwn(patch, 'responseClass') && patch.responseClass) {
    patch.replied = true;
    patch.paused = true;
    if (patch.responseClass === 'Opt-out') {
      patch.optedOut = true;
      patch.approved = false;
      patch.campaignStatus = 'Opt-out';
    } else {
      patch.campaignStatus = 'Respondeu';
    }
  }
  const updated = updateLead(lead.id, patch);
  addEvent('lead.updated', { leadId: lead.id, fields: Object.keys(patch) });
  await saveState();
  res.json(updated);
}));

app.post('/api/leads/:id/approve', asyncRoute(async (req, res) => {
  const lead = leadOr404(req, res);
  if (!lead) return;
  const approved = Boolean(req.body.approved);
  if (approved && (!lead.canSend || !lead.email)) return res.status(400).json({ error: 'Lead sem e-mail apto para envio.' });
  if (approved && lead.optedOut) return res.status(400).json({ error: 'Lead está na lista de supressão.' });
  updateLead(lead.id, {
    approved,
    approvedAt: approved ? new Date().toISOString() : null,
    campaignStatus: approved ? 'Aprovado' : 'Aguardando aprovação',
    paused: false,
    dryRunGenerated: false,
  });
  addEvent(approved ? 'lead.approved' : 'lead.unapproved', { leadId: lead.id, company: lead.company });
  await saveState();
  res.json(getLead(lead.id));
}));

app.post('/api/leads/:id/optout', asyncRoute(async (req, res) => {
  const lead = leadOr404(req, res);
  if (!lead) return;
  updateLead(lead.id, { optedOut: true, paused: true, approved: false, campaignStatus: 'Opt-out' });
  addEvent('lead.optout.manual', { leadId: lead.id, company: lead.company });
  await saveState();
  res.json(getLead(lead.id));
}));

app.post('/api/leads/:id/reset-preview', asyncRoute(async (req, res) => {
  const lead = leadOr404(req, res);
  if (!lead) return;
  updateLead(lead.id, { dryRunGenerated: false, campaignStatus: lead.approved ? 'Aprovado' : 'Aguardando aprovação' });
  if (config.dataBackend === 'supabase') await resetEmailJobs(lead.id);
  await saveState();
  res.json(getLead(lead.id));
}));

app.post('/api/approve-high-confidence', asyncRoute(async (req, res) => {
  if (req.body.confirm !== 'APROVAR ALTA CONFIANÇA') {
    return res.status(400).json({ error: 'Confirmação inválida.' });
  }
  let count = 0;
  for (const lead of getState().leads) {
    if (lead.confidence === 'Alta' && lead.canSend && lead.email && !lead.optedOut && !lead.bounce) {
      updateLead(lead.id, { approved: true, approvedAt: new Date().toISOString(), campaignStatus: 'Aprovado', paused: false, dryRunGenerated: false });
      count += 1;
    }
  }
  addEvent('leads.bulkApproved', { count, confidence: 'Alta' });
  await saveState();
  res.json({ ok: true, count });
}));

app.post('/api/approve-moderate-confidence', asyncRoute(async (req, res) => {
  if (req.body.confirm !== 'APROVAR CONFIANÇA MODERADA') {
    return res.status(400).json({ error: 'Confirmação inválida.' });
  }
  let count = 0;
  for (const lead of getState().leads) {
    if (
      lead.confidence === 'Moderada'
      && lead.canSend
      && lead.email
      && !lead.optedOut
      && !lead.bounce
    ) {
      updateLead(lead.id, {
        approved: true,
        approvedAt: new Date().toISOString(),
        campaignStatus: 'Aprovado',
        paused: false,
        dryRunGenerated: false,
      });
      count += 1;
    }
  }
  addEvent('leads.bulkApproved', { count, confidence: 'Moderada' });
  await saveState();
  res.json({ ok: true, count });
}));

app.post('/api/test-email', asyncRoute(async (req, res) => {
  const lead = getLead(req.body.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
  const targetEmail = String(req.body.targetEmail || '').trim();
  if (!targetEmail) return res.status(400).json({ error: 'Informe o e-mail que receberá o teste.' });
  const stage = Math.min(Math.max(Number(req.body.stage) || 0, 0), 2);
  const result = await sendLeadEmail(lead, stage, targetEmail);
  addEvent('email.test', { leadId: lead.id, targetEmail, stage, dryRun: result.dryRun });
  await saveState();
  res.json({ ok: true, ...result });
}));

app.post('/api/send-next', asyncRoute(async (req, res) => {
  const result = await processNext({
    ignoreBusinessWindow: Boolean(req.body.ignoreBusinessWindow),
    source: 'manual',
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.post('/api/campaign/start', asyncRoute(async (req, res) => {
  if (req.body.confirm !== 'INICIAR CAMPANHA') return res.status(400).json({ error: 'Digite INICIAR CAMPANHA para confirmar.' });
  if (config.sendMode === 'live') {
    const issues = validateLiveSending();
    if (issues.length) return res.status(400).json({ error: 'Envio ao vivo bloqueado.', issues });
    if (config.requireSentCopy) {
      const sentMailbox = await verifySentMailbox();
      if (!sentMailbox.ok) {
        return res.status(400).json({
          error: 'Não foi possível validar a cópia na pasta Enviados.',
          issues: [sentMailbox.reason],
        });
      }
    }
  }
  await activateCampaign();
  res.json({ ok: true, campaign: getState().campaign });
}));

app.post('/api/campaign/pause', asyncRoute(async (_req, res) => {
  await pauseCampaign();
  res.json({ ok: true, campaign: getState().campaign });
}));

app.post('/api/smtp/verify', asyncRoute(async (_req, res) => {
  const result = await verifySmtp();
  res.status(result.ok ? 200 : 400).json(result);
}));

app.post('/api/inbox/sync', asyncRoute(async (_req, res) => {
  const result = await syncInbox();
  res.status(result.ok ? 200 : 400).json(result);
}));

app.post('/api/leads/:id/research', asyncRoute(async (req, res) => {
  const lead = leadOr404(req, res);
  if (!lead) return;
  const research = await researchLead(lead);
  updateLead(lead.id, { research });
  addEvent('lead.researched', { leadId: lead.id, company: lead.company, confidence: research.confianca || '' });
  await saveState();
  res.json(research);
}));

app.post('/api/leads/:id/apply-research', asyncRoute(async (req, res) => {
  const lead = leadOr404(req, res);
  if (!lead) return;
  const research = lead.research;
  if (!research) return res.status(400).json({ error: 'Este lead ainda não possui pesquisa.' });
  const required = ['assunto_sugerido', 'email_inicial_sugerido'];
  if (required.some((key) => !research[key])) return res.status(400).json({ error: 'A pesquisa não retornou textos estruturados suficientes.' });
  updateLead(lead.id, {
    subject: research.assunto_sugerido,
    initialBody: research.email_inicial_sugerido,
    followup1Body: research.followup1_sugerido || lead.followup1Body,
    followup2Body: research.followup2_sugerido || lead.followup2Body,
    approved: false,
    approvedAt: null,
    campaignStatus: 'Aguardando revisão da pesquisa',
    dryRunGenerated: false,
  });
  addEvent('lead.research.applied', { leadId: lead.id, company: lead.company });
  await saveState();
  res.json(getLead(lead.id));
}));

app.post('/api/reload-workbook', asyncRoute(async (req, res) => {
  if (req.body.confirm !== 'REIMPORTAR PLANILHA') return res.status(400).json({ error: 'Confirmação inválida.' });
  await resetFromWorkbook();
  res.json({ ok: true, stats: stats() });
}));

app.get('/api/export.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="resultado-campanha-parts-seals.csv"');
  res.send(exportCsv());
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Erro interno.' });
});

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  initializeApp()
    .then(() => {
      startScheduler();
      app.listen(config.port, () => {
        console.log(`Parts Seals Prospecção: http://localhost:${config.port}`);
        console.log(`Modo de envio: ${config.sendMode}`);
        if (config.sendMode !== 'live') console.log('Nenhum e-mail real será enviado; as prévias serão salvas em data/dry-run.');
      });
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export default app;
