import mysql from 'mysql2/promise'
import { AppEnv } from './env.mjs'
import { logger } from './logger.mjs'
import { whereBuilder } from './util.mjs'
import dayjs from 'dayjs'

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
    let tableDay = dayjs().subtract(1, 'day').format("YYYYMMDD")

    const createSql = `CREATE TABLE IF NOT EXISTS records_tmp LIKE records`
    const renameSql = `RENAME TABLE records TO records_${tableDay}, records_tmp TO records`

    logger.info(createSql)
    await query(createSql)
    logger.info(renameSql)
    return await query(renameSql)
}

export async function deleteTable() {
    let res = await query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() and 
        table_name like 'records\\_%' 
        order by table_name desc 
        limit ${AppEnv.dataKeepDays}, 18446744073709551615;
    `)

    if (res.rows.length === 0) {
        logger.info("没有需要删除的表")
    }

    for (const ele of res.rows) {
        console.log(ele.table_name)
        logger.info(`try delete table ${ele.table_name}`)
        await query(`DROP TABLE IF EXISTS ${mysql.escapeId(ele.table_name)}`)
    }
}

export async function queryRecord(c) {
    logger.info(c)
    let wh = whereBuilder(c)
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
        ${mysql.escapeId(getTableNameByDay(c.day))}
    where
        ${wh.join(' and ')}
    group by sip_call_id 
    having count(*) >= ${c.msg_min}
    order by "startTime" desc
    limit ${AppEnv.QueryLimit}
    `

    logger.info(sql)
    const res = await query(sql)

    return res
}


export async function queryById(id, day) {
    const sql = `
    select
    sip_call_id,
	sip_method,
	to_char(create_time,
	'YYYY-MM-DD HH24:MI:SS') as create_time,
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
        sip_call_id = '${id}'
    order by create_time , timestamp_micro 
    `

    logger.info(sql)
    const res = await query(sql)

    return res
}
