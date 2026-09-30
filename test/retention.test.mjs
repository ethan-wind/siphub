import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import { CronJob } from 'cron'
import { AppEnv } from '../env.mjs'

let tables
let failRename
const pool = {
    async query(sql) {
        if (/information_schema\.tables/.test(sql)) {
            let names = [...tables].filter(name => name.startsWith('records_')).sort().reverse()
            const limit = sql.match(/limit\s+(\d+),/i)
            if (limit) names = names.slice(Number(limit[1]))
            return [names.map(table_name => ({ table_name }))]
        }
        if (/^DROP TABLE/.test(sql)) tables.delete(sql.match(/`([^`]+)`/)[1])
        if (/^RENAME TABLE/.test(sql) && failRename) throw new Error('archive already exists')
        return [[]]
    }
}
mock.method(mysql, 'createPool', () => pool)
const { deleteTable } = await import('../db.mjs')
const { startCron } = await import('../cron.mjs')

test.beforeEach(t => {
    const original = { ...AppEnv }
    t.after(() => Object.assign(AppEnv, original))
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-29T16:05:00Z') })
    AppEnv.dataKeepDays = 3
    AppEnv.timeZone = 'Asia/Shanghai'
    failRename = false
    tables = new Set(['records', 'records_20260927', 'records_20260928', 'records_20260929'])
})

test('日期不连续且历史表数少于保留天数时，仍删除过期表', async () => {
    tables = new Set(['records', 'records_20260101'])
    await deleteTable()
    assert.deepEqual([...tables], ['records'])
})

test('按配置时区保留最近三天，只删除有效日期的过期历史表', async () => {
    const retained = [...tables, 'records_tmp', 'records_backup', 'records_20260230', 'records_20261001']
    tables = new Set([...retained, 'records_20260926'])
    await deleteTable()
    assert.deepEqual([...tables].sort(), retained.sort())
})

test('保留零天时只删除今天之前的历史表', async () => {
    AppEnv.dataKeepDays = 0
    tables.add('records_20260930')
    await deleteTable()
    assert.deepEqual([...tables], ['records', 'records_20260930'])
})

test('非法保留天数不能触发删除', async () => {
    for (const value of [-1, 1.5, NaN]) {
        AppEnv.dataKeepDays = value
        await assert.rejects(deleteTable(), /dataKeepDays/)
    }
    assert.equal(tables.size, 4)
})

test('分表失败后定时任务仍清理过期表', async t => {
    let job
    t.mock.method(CronJob.prototype, 'start', function () { job = this })
    failRename = true
    tables.add('records_20260101')
    startCron()
    await job._callbacks[0]()
    assert.equal(tables.has('records_20260101'), false)
})
