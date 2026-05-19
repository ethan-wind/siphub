import crypto from 'crypto'
import { AppEnv } from './env.mjs'

const AUTH_COOKIE = 'siphub_auth'
const CAPTCHA_COOKIE = 'siphub_captcha'
const COOKIE_PATH = '/'
const TOKEN_VERSION = 'v2'
const loginAttempts = new Map()

function getSecret() {
    return AppEnv.AuthSecret || AppEnv.LoginPasswd || AppEnv.DBPasswd || 'siphub-dev-secret'
}

function hmac(value) {
    return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url')
}

function timingSafeEqual(a, b) {
    const ab = Buffer.from(a || '')
    const bb = Buffer.from(b || '')
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

export function parseCookies(req) {
    return (req.headers.cookie || '').split(';').reduce((cookies, item) => {
        const index = item.indexOf('=')
        if (index === -1) return cookies
        const key = item.slice(0, index).trim()
        const value = item.slice(index + 1).trim()
        if (!key) return cookies
        try {
            cookies[key] = decodeURIComponent(value)
        } catch {
            cookies[key] = value
        }
        return cookies
    }, {})
}

function serializeCookie(name, value, options = {}) {
    const attrs = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || COOKIE_PATH}`, 'HttpOnly', 'SameSite=Lax']
    if (options.maxAge !== undefined) attrs.push(`Max-Age=${options.maxAge}`)
    if (options.expires) attrs.push(`Expires=${options.expires.toUTCString()}`)
    if (options.secure) attrs.push('Secure')
    return attrs.join('; ')
}

function clearCookie(name, req) {
    return serializeCookie(name, '', { maxAge: 0, expires: new Date(0), secure: isSecureRequest(req) })
}

function appendCookie(res, cookie) {
    const current = res.getHeader('Set-Cookie')
    if (!current) return res.setHeader('Set-Cookie', cookie)
    if (Array.isArray(current)) return res.setHeader('Set-Cookie', [...current, cookie])
    res.setHeader('Set-Cookie', [current, cookie])
}

export function createAuthToken(username, remember) {
    const maxAge = remember ? AppEnv.AuthRememberSeconds : AppEnv.AuthSessionSeconds
    const exp = Date.now() + maxAge * 1000
    const payload = Buffer.from(JSON.stringify({
        v: TOKEN_VERSION,
        username,
        exp,
        nonce: crypto.randomBytes(16).toString('base64url')
    })).toString('base64url')
    return {
        token: `${payload}.${hmac(payload)}`,
        maxAge
    }
}

export function verifyAuthToken(token) {
    const parts = String(token || '').split('.')
    if (parts.length === 2) {
        const [payload, sig] = parts
        if (!timingSafeEqual(sig, hmac(payload))) return false

        try {
            const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
            if (data.v !== TOKEN_VERSION) return false
            if (Number(data.exp) < Date.now()) return false
            return data.username === AppEnv.LoginUser
        } catch {
            return false
        }
    }

    if (parts.length === 4) {
        const [username, exp, nonce, sig] = parts
        const payload = `${username}.${exp}.${nonce}`
        if (!timingSafeEqual(sig, hmac(payload))) return false
        if (Number(exp) < Date.now()) return false
        return username === AppEnv.LoginUser
    }

    return false
}

export function setAuthCookie(req, res, token, maxAge) {
    appendCookie(res, serializeCookie(AUTH_COOKIE, token, { maxAge, secure: isSecureRequest(req) }))
}

export function clearAuthCookie(req, res) {
    appendCookie(res, clearCookie(AUTH_COOKIE, req))
}

export function isAuthenticated(req) {
    return verifyAuthToken(parseCookies(req)[AUTH_COOKIE])
}

export function requirePageAuth(req, res, next) {
    if (isAuthenticated(req)) return next()
    res.redirect('/login')
}

export function requireApiAuth(req, res, next) {
    if (isAuthenticated(req)) return next()
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '鉴权失败' } })
}

export function checkCredentials(username, password) {
    return timingSafeEqual(username, AppEnv.LoginUser) && timingSafeEqual(password, AppEnv.LoginPasswd)
}

export function isSecureRequest(req) {
    const mode = String(AppEnv.AuthCookieSecure || 'auto').toLowerCase()
    if (mode === 'always') return true
    if (mode === 'never') return false
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    return req.secure || forwardedProto === 'https'
}

function loginKey(req, username) {
    const user = String(username || '').trim().toLowerCase() || 'anonymous'
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    return `${ip}:${user}`
}

function pruneLoginAttempts(now = Date.now()) {
    for (const [key, state] of loginAttempts) {
        const windowExpired = now - state.firstFailureAt > AppEnv.AuthLoginWindowSeconds * 1000
        const lockExpired = !state.lockUntil || state.lockUntil <= now
        if (windowExpired && lockExpired) loginAttempts.delete(key)
    }
}

export function getLoginLock(req, username) {
    pruneLoginAttempts()
    const state = loginAttempts.get(loginKey(req, username))
    if (!state?.lockUntil || state.lockUntil <= Date.now()) return null
    return {
        retryAfter: Math.ceil((state.lockUntil - Date.now()) / 1000)
    }
}

export function recordLoginFailure(req, username) {
    const now = Date.now()
    pruneLoginAttempts(now)

    const key = loginKey(req, username)
    const current = loginAttempts.get(key)
    const inWindow = current && now - current.firstFailureAt <= AppEnv.AuthLoginWindowSeconds * 1000
    const state = inWindow ? current : { failures: 0, firstFailureAt: now, lockUntil: 0 }

    state.failures += 1
    if (state.failures >= AppEnv.AuthMaxLoginAttempts) {
        state.lockUntil = now + AppEnv.AuthLockSeconds * 1000
    }

    loginAttempts.set(key, state)
    return state
}

export function clearLoginFailures(req, username) {
    loginAttempts.delete(loginKey(req, username))
}

function createCaptchaText() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join('')
}

export function createCaptcha() {
    const text = createCaptchaText()
    const payload = `${text.toLowerCase()}.${Date.now() + 5 * 60 * 1000}.${crypto.randomBytes(8).toString('base64url')}`
    return {
        text,
        token: `${payload}.${hmac(payload)}`
    }
}

export function verifyCaptcha(req, input) {
    const token = parseCookies(req)[CAPTCHA_COOKIE]
    const parts = String(token || '').split('.')
    if (parts.length !== 4) return false

    const [text, exp, nonce, sig] = parts
    const payload = `${text}.${exp}.${nonce}`
    if (!timingSafeEqual(sig, hmac(payload))) return false
    if (Number(exp) < Date.now()) return false
    return text === String(input || '').trim().toLowerCase()
}

export function setCaptchaCookie(req, res, token) {
    appendCookie(res, serializeCookie(CAPTCHA_COOKIE, token, { maxAge: 300, secure: isSecureRequest(req) }))
}

export function clearCaptchaCookie(req, res) {
    appendCookie(res, clearCookie(CAPTCHA_COOKIE, req))
}

export function renderCaptchaSvg(text) {
    const lines = Array.from({ length: 8 }, (_, i) => {
        const x1 = crypto.randomInt(0, 130)
        const y1 = crypto.randomInt(0, 42)
        const x2 = crypto.randomInt(0, 130)
        const y2 = crypto.randomInt(0, 42)
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa0a6" stroke-width="${i % 3 + 1}" opacity="0.45"/>`
    }).join('')

    const letters = text.split('').map((ch, i) => {
        const rotate = crypto.randomInt(-18, 19)
        const y = crypto.randomInt(24, 34)
        return `<text x="${18 + i * 19}" y="${y}" transform="rotate(${rotate} ${18 + i * 19} ${y})">${ch}</text>`
    }).join('')

    return `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="42" viewBox="0 0 130 42">
        <rect width="130" height="42" fill="#fbfbfb"/>
        ${lines}
        <g font-family="Menlo, Consolas, monospace" font-size="23" font-weight="700" fill="#3f4a5a">${letters}</g>
    </svg>`
}
