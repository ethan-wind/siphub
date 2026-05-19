import express from 'express'
import bodyParser from 'body-parser'
import { AppLoger, logger } from './logger.mjs'
import dayjs from 'dayjs'
import { route } from './router/api.mjs'
import { queryRecord } from './db.mjs'
import { startCron } from './cron.mjs'
import { AppEnv } from './env.mjs'
import {
  checkCredentials,
  clearAuthCookie,
  clearCaptchaCookie,
  createAuthToken,
  createCaptcha,
  clearLoginFailures,
  getLoginLock,
  isAuthenticated,
  recordLoginFailure,
  requirePageAuth,
  renderCaptchaSvg,
  setAuthCookie,
  setCaptchaCookie,
  verifyCaptcha
} from './auth.mjs'

const app = express()

app.set('trust proxy', AppEnv.TrustProxy === 'yes')
app.use(AppLoger())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static('public'))
app.set('view engine', 'ejs')

if (AppEnv.enableCron === 'yes') {
  logger.info('enable crontab')
  startCron()
} else {
  logger.info('disable crontab')
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

app.get('/', requirePageAuth, asyncHandler(async function (req, res) {
  let n = dayjs()
  let day = n.format('YYYY-MM-DD')
  let start = n.subtract(10, 'm').format('HH:mm:ss')
  let stop = n.format('HH:mm:ss')

  let result = await queryRecord({
    day,
    start,
    stop,
    caller: '',
    callee: '',
    msg_min: 1,
    callid: '',
    cseq_method: ''
  })

  res.render('home/index', {
    day,
    start,
    stop,
    table: result.rows,
    currentUser: AppEnv.LoginUser
  })
}))

app.get('/login', function (req, res) {
  if (isAuthenticated(req)) return res.redirect('/')
  res.render('home/login', { error: '' })
})

app.post('/login', function (req, res) {
  const { username = '', password = '', captcha = '', remember } = req.body
  const lock = getLoginLock(req, username)

  res.set('Cache-Control', 'no-store')

  if (lock) {
    return res.status(429).render('home/login', { error: `登录失败次数过多，请 ${lock.retryAfter} 秒后再试` })
  }

  if (!verifyCaptcha(req, captcha)) {
    clearCaptchaCookie(req, res)
    recordLoginFailure(req, username)
    return res.status(401).render('home/login', { error: '验证码错误或已过期' })
  }

  if (!checkCredentials(username, password)) {
    clearCaptchaCookie(req, res)
    recordLoginFailure(req, username)
    return res.status(401).render('home/login', { error: '用户名或密码错误' })
  }

  clearLoginFailures(req, username)
  const auth = createAuthToken(username, remember === 'on')
  setAuthCookie(req, res, auth.token, auth.maxAge)
  clearCaptchaCookie(req, res)
  res.redirect('/')
})

app.post('/logout', requirePageAuth, function (req, res) {
  clearAuthCookie(req, res)
  res.redirect('/login')
})

app.get('/captcha', function (req, res) {
  const captcha = createCaptcha()
  res.set('Cache-Control', 'no-store')
  setCaptchaCookie(req, res, captcha.token)
  res.type('svg').send(renderCaptchaSvg(captcha.text))
})

app.use('/api', route)

app.use((err, req, res, next) => {
  logger.error(err)
  res.status(500).send('Internal Server Error')
})

app.listen(AppEnv.Port)
