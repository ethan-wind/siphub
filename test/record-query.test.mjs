import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'

const statements = []
mock.method(mysql, 'createPool', () => ({
    async query(sql) {
        statements.push(sql)
        return [sql.includes('grouped_records') ? [{ total: 3 }] : []]
    }
}))
const { queryRecord } = await import('../db.mjs')

test('呼叫列表在分页前按完整开始时间倒序，并以 CallID 稳定排序', async () => {
    const result = await queryRecord({
        day: '2026-09-30', start: '00:00:00', stop: '23:59:59',
        caller: '', callee: '', page: 2, pageSize: 2
    })
    const sql = statements.find(statement => !statement.includes('grouped_records'))
    // 校验发给数据库的排序表达式，防止把带引号的别名当作字符串常量。
    assert.match(sql, /order by\s+min\(create_time\)\s+desc,\s*sip_call_id\s+asc\s+limit 2 offset 2/i)
    assert.equal(result.total, 3)
    assert.equal(result.page, 2)
})
