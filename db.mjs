import mysql from 'mysql2/promise'
import { AppEnv } from './env.mjs'
import { logger } from './logger.mjs'
import { whereBuilder } from './util.mjs'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

const pool = mysql.createPool({
    user: AppEnv.DBUser,
    password: AppEnv.DBPasswd,
    host: AppEnv.DBAddr,
    port: AppEnv.DBPort,
    database: AppEnv.DBName,
    waitForConnections: true,
    connectionLimit: 20,
    connectTimeout: 2000,
})

async function query(sql) {
    const [rows] = await pool.query(sql)
    return { rows }
}

function getTableNameByDay(day) {
    let today = dayjs().format('YYYY-MM-DD')
    if (day === today) {
        return 'records'
    }

    return `records_${day.replaceAll('-', '')}`
}

export async function tableSplit() {
    let tableDay = dayjs().tz(AppEnv.timeZone).subtract(1, 'day').format("YYYYMMDD")

    const createSql = `CREATE TABLE IF NOT EXISTS records_tmp LIKE records`
    const renameSql = `RENAME TABLE records TO records_${tableDay}, records_tmp TO records`

    logger.info(createSql)
    await query(createSql)
    logger.info(renameSql)
    return await query(renameSql)
}

export async function deleteTable() {
    if (!Number.isSafeInteger(AppEnv.dataKeepDays) || AppEnv.dataKeepDays < 0) {
        throw new Error('dataKeepDays 必须是非负整数')
    }
    const cutoff = dayjs().tz(AppEnv.timeZone).subtract(AppEnv.dataKeepDays, 'day').format('YYYYMMDD')
    let res = await query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() and 
        table_name like 'records\\_%' 
        order by table_name;
    `)

    // 仅处理日期归档表，不能把临时表或备份表计入保留范围。
    const expired = res.rows.filter(({ table_name }) => {
        const match = /^records_(\d{8})$/.exec(table_name)
        return match && dayjs(match[1]).format('YYYYMMDD') === match[1] && match[1] < cutoff
    })

    if (expired.length === 0) {
        logger.info("没有需要删除的表")
    }

    for (const ele of expired) {
        logger.info(`try delete table ${ele.table_name}`)
        await query(`DROP TABLE IF EXISTS ${mysql.escapeId(ele.table_name)}`)
    }
}

export async function queryRecord(c) {
    logger.info(c)
    let wh = whereBuilder(c)
    const msgMin = Math.max(1, Number.parseInt(c.msg_min, 10) || 1)
    const page = Math.max(1, Number.parseInt(c.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.pageSize, 10) || AppEnv.QueryLimit))
    const offset = (page - 1) * pageSize
    const tableName = mysql.escapeId(getTableNameByDay(c.day))
    const grouped = `
        select sip_call_id
        from ${tableName}
        where ${wh.join(' and ')}
        group by sip_call_id
        having count(*) >= ${msgMin}`
    const countSql = `select count(*) as total from (${grouped}) grouped_records`
    const sql = `
      select
        sip_call_id as "CallID",
        date_format(min(create_time),'%H:%i:%s') as "startTime",
        date_format(min(create_time),'%Y-%m-%d') as "day",
        date_format(max(create_time),'%H:%i:%s') as "stopTime",
        timediff(max(create_time), min(create_time)) as "duration",
        min(from_user) as "caller",
        min(to_user) as "callee",
        count(*) as "msgTotal",
        max(user_agent) as "UA",
        max(response_code) as "finalCode",
        max(cseq_method) as "cseq_method",
        max(leg_uid) as "uid",
        max(src_host) as "srcHost",
        max(dst_host) as "dstHost",
        group_concat(DISTINCT CASE WHEN response_code BETWEEN 170 AND 190 THEN response_code END) AS "tempCode"
    from
        ${tableName}
    where
        ${wh.join(' and ')}
    group by sip_call_id 
    having count(*) >= ${msgMin}
    order by min(create_time) desc, sip_call_id asc
    limit ${pageSize} offset ${offset}
    `

    logger.info(sql)
    const [res, count] = await Promise.all([query(sql), query(countSql)])

    return { rows: res.rows, total: Number(count.rows[0]?.total || 0), page, pageSize }
}


export async function queryById(id, day) {
    const sql = `
    select
    sip_call_id,
	sip_method,
	date_format(create_time, '%Y-%m-%d %H:%i:%s') as create_time,
	timestamp_micro,
	raw_msg,
    cseq_number,
	case 
		when sip_protocol = 6 then 'TCP'
		when sip_protocol = 17 then 'UDP'
		when sip_protocol = 22 then 'TLS'
		when sip_protocol = 50 then 'ESP'
		else 'Unknown'
	end as sip_protocl,
	replace(src_host,':','_') as src_host,
	replace(dst_host,':','_') as dst_host,
    response_desc,
    length(raw_msg) as msg_len
    from
        ${mysql.escapeId(getTableNameByDay(day))}
    where
        sip_call_id = ${mysql.escape(id)}
    order by create_time , timestamp_micro 
    `

    logger.info(sql)
    const res = await query(sql)

    return res
}
