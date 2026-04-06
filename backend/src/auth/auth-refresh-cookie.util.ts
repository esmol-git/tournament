import type { Request, Response } from 'express';
import { parse as parseCookieHeader } from 'cookie';

/** HttpOnly cookie: refresh token для POST /auth/refresh с credentials (кросс-origin к API). */
export const AUTH_REFRESH_COOKIE_NAME = 'tp_refresh_token';

const REFRESH_MAX_AGE_SEC =
  (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 24 * 60 * 60;

export function parseRefreshTokenFromCookieHeader(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;
  const parsed = parseCookieHeader(cookieHeader);
  const v = parsed[AUTH_REFRESH_COOKIE_NAME];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function setAuthRefreshCookie(
  res: Response,
  req: Request,
  refreshToken: string,
): void {
  const opts = refreshCookieOptions(req);
  res.cookie(AUTH_REFRESH_COOKIE_NAME, refreshToken, opts);
}

export function clearAuthRefreshCookie(res: Response, req: Request): void {
  const opts = refreshCookieOptions(req);
  res.clearCookie(AUTH_REFRESH_COOKIE_NAME, { ...opts, maxAge: 0 });
}

function refreshCookieOptions(req: Request): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'none';
  path: string;
  maxAge: number;
  domain?: string;
} {
  const sameSiteRaw = (process.env.AUTH_REFRESH_COOKIE_SAMESITE ?? 'lax')
    .trim()
    .toLowerCase();
  const sameSite: 'lax' | 'none' = sameSiteRaw === 'none' ? 'none' : 'lax';
  const isProd = process.env.NODE_ENV === 'production';
  const domain = cookieDomainFromRequest(req);
  return {
    httpOnly: true,
    /** Cross-site API (отдельный поддомен) — только SameSite=None + Secure. */
    secure: isProd || sameSite === 'none',
    sameSite,
    path: '/auth',
    maxAge: REFRESH_MAX_AGE_SEC,
    ...(domain ? { domain } : {}),
  };
}

function cookieDomainFromRequest(req: Request): string | undefined {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin.trim()) return undefined;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return undefined;
    if (host.endsWith('.localhost')) return '.localhost';
    const parts = host.split('.').filter(Boolean);
    if (parts.length < 3) return undefined;
    return `.${parts.slice(-2).join('.')}`;
  } catch {
    return undefined;
  }
}
