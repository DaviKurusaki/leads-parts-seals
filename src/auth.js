import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { getSupabaseAdmin } from './supabase.js';

const ACCESS_COOKIE = 'parts_seals_access';
const REFRESH_COOKIE = 'parts_seals_refresh';
const AUTH_APP = 'parts-seals';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

function normalizedUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Use de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.');
  }
  return username;
}

function loginEmail(username) {
  const digest = crypto.createHash('sha256').update(normalizedUsername(username)).digest('hex').slice(0, 40);
  return `u-${digest}@users.parts-seals.invalid`;
}

function requestAuthClient() {
  if (!config.supabase.url || !config.supabase.publishableKey) {
    throw new Error('SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY precisam estar preenchidas.');
  }
  return createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function cookieSecure() {
  return process.env.NETLIFY === 'true'
    || process.env.NODE_ENV === 'production'
    || String(process.env.URL || '').startsWith('https://');
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/api',
    maxAge,
  };
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function setSessionCookies(res, session) {
  const accessMaxAge = Math.max(Number(session.expires_in || 3600) - 30, 60) * 1000;
  res.cookie(ACCESS_COOKIE, session.access_token, cookieOptions(accessMaxAge));
  res.cookie(REFRESH_COOKIE, session.refresh_token, cookieOptions(30 * 24 * 60 * 60 * 1000));
}

function clearSessionCookies(res) {
  const options = cookieOptions(0);
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.user_metadata?.username || 'Usuário',
    role: user.app_metadata?.role === 'admin' ? 'admin' : 'user',
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at || null,
  };
}

function isPartsSealsUser(user) {
  return user?.app_metadata?.app === AUTH_APP;
}

async function bootstrapInitialAdmin(username, password) {
  const configuredUsername = process.env.INITIAL_ADMIN_USERNAME || 'Admin';
  const configuredPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (
    normalizedUsername(username) !== normalizedUsername(configuredUsername)
    || !configuredPassword
    || !safeEqual(password, configuredPassword)
  ) {
    return false;
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.createUser({
    email: loginEmail(username),
    password,
    email_confirm: true,
    app_metadata: { app: AUTH_APP, role: 'admin' },
    user_metadata: { username: String(configuredUsername).trim() || 'Admin' },
  });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  return true;
}

async function listApplicationUsers() {
  const admin = getSupabaseAdmin();
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch.filter(isPartsSealsUser));
    if (batch.length < 100) break;
  }
  return users;
}

async function resolveSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  const client = requestAuthClient();

  if (accessToken) {
    const { data, error } = await client.auth.getUser(accessToken);
    if (!error && isPartsSealsUser(data.user)) {
      req.authAccessToken = accessToken;
      return data.user;
    }
  }

  if (!refreshToken) return null;
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !isPartsSealsUser(data.user)) {
    clearSessionCookies(res);
    return null;
  }
  setSessionCookies(res, data.session);
  req.authAccessToken = data.session.access_token;
  return data.user;
}

export async function requireAuth(req, res, next) {
  const user = await resolveSession(req, res);
  if (!user) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  req.auth = publicUser(user);
  next();
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem realizar esta ação.' });
  }
  next();
}

export function validateSameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const expected = `${protocol}://${req.get('host')}`;
  if (origin !== expected) return res.status(403).json({ error: 'Origem da requisição não permitida.' });
  next();
}

export async function login(req, res) {
  const username = validateUsername(req.body.username);
  const password = String(req.body.password || '');
  if (!password) return res.status(400).json({ error: 'Informe a senha.' });

  const client = requestAuthClient();
  let result = await client.auth.signInWithPassword({ email: loginEmail(username), password });
  if (result.error && await bootstrapInitialAdmin(username, password)) {
    result = await client.auth.signInWithPassword({ email: loginEmail(username), password });
  }
  if (result.error || !result.data.session || !isPartsSealsUser(result.data.user)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  setSessionCookies(res, result.data.session);
  res.json({ user: publicUser(result.data.user) });
}

export async function logout(req, res) {
  if (req.authAccessToken) {
    const { error } = await getSupabaseAdmin().auth.admin.signOut(req.authAccessToken, 'local');
    if (error) console.warn(`Não foi possível revogar a sessão no Supabase: ${error.message}`);
  }
  clearSessionCookies(res);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: req.auth });
}

export async function listUsers(_req, res) {
  const users = (await listApplicationUsers())
    .map(publicUser)
    .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'));
  res.json({ users });
}

export async function createUser(req, res) {
  const username = validateUsername(req.body.username);
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmail(username),
    password,
    email_confirm: true,
    app_metadata: { app: AUTH_APP, role },
    user_metadata: { username },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return res.status(409).json({ error: 'Este nome de usuário já existe.' });
    }
    throw error;
  }
  res.status(201).json({ user: publicUser(data.user) });
}

export async function deleteUser(req, res) {
  const id = String(req.params.id || '');
  if (id === req.auth.id) {
    return res.status(400).json({ error: 'Você não pode apagar o usuário da sessão atual.' });
  }

  const users = await listApplicationUsers();
  const target = users.find((user) => user.id === id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (target.app_metadata?.role === 'admin') {
    const adminCount = users.filter((user) => user.app_metadata?.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Não é possível apagar o último administrador.' });
    }
  }

  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(id);
  if (error) throw error;
  res.json({ ok: true });
}

export async function changePassword(req, res) {
  const password = String(req.body.password || '');
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }
  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(req.auth.id, { password });
  if (error) throw error;
  clearSessionCookies(res);
  res.json({ ok: true, loginRequired: true });
}
