import test from 'node:test'
import assert from 'node:assert/strict'

import { renderCaptchaSvg } from '../auth.mjs'

test('验证码字符使用轻度高斯模糊', () => {
    const svg = renderCaptchaSvg('ABCDE')

    assert.match(svg, /<filter id="captcha-blur"/)
    assert.match(svg, /<feGaussianBlur stdDeviation="0\.45"\/?>/)
    assert.match(svg, /<g[^>]*filter="url\(#captcha-blur\)"/)
})
