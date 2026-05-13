import { Router } from "express"
import { logger } from "../logger.mjs"
import { queryRecord, queryById } from "../db.mjs"
import { createSeqHtml } from "../util.mjs"
import { requireApiAuth } from "../auth.mjs"

export const route = Router()

route.use(requireApiAuth)

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

route.post('/record', asyncHandler(async (req, res) => {
    let re = await queryRecord(req.body)
    logger.info(`row length ${re.rows.length}`)
    res.render('home/sipcdr', { table: re.rows })
}))

route.get('/call', asyncHandler(async (req, res) => {
    let re = await queryById(req.query.id, req.query.day)
    let rows = re.rows
    let seq = createSeqHtml(rows)
    logger.debug(seq)

    res.render('diagram/index', {
        seq: seq.html, table: rows
    })
}))
