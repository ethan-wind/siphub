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
  isAuthenticated,
  requirePageAuth,
  renderCaptchaSvg,
  setAuthCookie,
  setCaptchaCookie,
  verifyCaptcha
} from './auth.mjs'

const app = express()

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
    table: result.rows
  })
}))

app.get('/login', function (req, res) {
  if (isAuthenticated(req)) return res.redirect('/')
  res.render('home/login', { error: '' })
})

app.post('/login', function (req, res) {
  const { username = '', password = '', captcha = '', remember } = req.body

  if (!verifyCaptcha(req, captcha)) {
    return res.status(401).render('home/login', { error: '验证码错误或已过期' })
  }

  if (!checkCredentials(username, password)) {
    return res.status(401).render('home/login', { error: '用户名或密码错误' })
  }

  const auth = createAuthToken(username, remember === 'on')
  setAuthCookie(res, auth.token, auth.maxAge)
  clearCaptchaCookie(res)
  res.redirect('/')
})

app.post('/logout', function (req, res) {
  clearAuthCookie(res)
  res.redirect('/login')
})

app.get('/captcha', function (req, res) {
  const captcha = createCaptcha()
  setCaptchaCookie(res, captcha.token)
  res.type('svg').send(renderCaptchaSvg(captcha.text))
})

app.use('/api', route)

app.use((err, req, res, next) => {
  logger.error(err)
  res.status(500).send('Internal Server Error')
})

app.listen(AppEnv.Port)
