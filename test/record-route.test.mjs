import test from 'node:test'
import assert from 'node:assert/strict'

import { createRecordViewModel } from '../router/api.mjs'

test('列表查询结果使用 table 字段传给 EJS 模板', () => {
    const rows = [{ CallID: 'call-1' }]
    const result = createRecordViewModel({ rows, total: 1, page: 1, pageSize: 10 }, { caller: '' })

    assert.equal(result.table, rows)
    assert.equal(result.total, 1)
    assert.equal(result.page, 1)
    assert.equal(result.pageSize, 10)
})
