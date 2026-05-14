import validator from 'validator'
import dayjs from 'dayjs'
import mysql from 'mysql2/promise'

const regEx = /\d+/
export function isRequest(method) {
    return !regEx.test(method)
}

export function whereBuilder(cond) {
    // day
    // start
    let re = [
        `create_time >= '${cond.day} ${cond.start}'`,
        `create_time <= '${cond.day} ${cond.stop}'`
    ]

    if (cond.caller.trim().length > 0) {
        const caller = cond.caller.trim()
        if (cond.caller.indexOf('*') >= 0) {
            re.push(`from_user like ${mysql.escape(caller.replaceAll('*', '%'))}`)
        } else {
            re.push(`from_user = ${mysql.escape(caller)}`)
        }
    }

    if (cond.callee.trim().length > 0) {
        const callee = cond.callee.trim()
        if (cond.callee.indexOf('*') >= 0) {
            re.push(`to_user like ${mysql.escape(callee.replaceAll('*', '%'))}`)
        } else {
            re.push(`to_user = ${mysql.escape(callee)}`)
        }
    }

    if (cond.callid?.trim() && cond.callid.trim().length > 0) {
        re.push(`sip_call_id = ${mysql.escape(cond.callid.trim())}`)
    }

    if (cond.cseq_method?.trim() && cond.cseq_method.trim().length > 0) {
        re.push(`cseq_method = ${mysql.escape(cond.cseq_method.trim())}`)
    }

    if (cond.src_host?.trim() && cond.src_host.trim().length > 0) {
        re.push(`src_host like ${mysql.escape(`${cond.src_host.trim()}%`)}`)
    }

    if (cond.dst_host?.trim() && cond.dst_host.trim().length > 0) {
        re.push(`dst_host like ${mysql.escape(`${cond.dst_host.trim()}%`)}`)
    }

    return re
}

export function conditionChecker(cond) {
    // day
    if (!validator.isDate(cond.day)) {
        return false
    }
    // start
    if (!validator.isTime(cond.start)) {
        return false
    }
    // stop
    if (!validator.isTime(cond.stop)) {
        return false
    }

    if (cond.msg_min != "" && !validator.isInt(cond.msg_min)) {
        return false
    }

    // msg_min
    // caller
    // callee
    return True
}

export function getProtocolName(num) {
    if (num === 6) {
        return 'TCP'
    }
    if (num === 17) {
        return 'UDP'
    }
    if (num === 22) {
        return 'TLS'
    }
    if (num === 50) {
        return 'ESP'
    }
    return 'Unknown'
}

export function createSeqHtml(seq) {
    const agents = []
    seq.forEach(item => {
        if (!agents.includes(item.src_host)) agents.push(item.src_host)
        if (!agents.includes(item.dst_host)) agents.push(item.dst_host)
    })

    const res = agents.length > 0 ? [`begin ${agents.join(', ')}`] : []
    const msgLineOffset = res.length

    seq.forEach((item, index) => {
        let dis = 0

        if (index !== 0) {
            const a = dayjs(seq[index].create_time).unix() + '.' + seq[index].timestamp_micro
            const b = dayjs(seq[index - 1].create_time).unix() + '.' + seq[index - 1].timestamp_micro
            dis = parseFloat(a) - parseFloat(b)
        }

        res.push(
            `${item.src_host}-${isRequest(item.sip_method) ? '' : '-'}>${item.dst_host}: F${index} ${item.sip_method} ${item.response_desc} ${dis.toFixed(2)}s`,
        )
    })

    res.push('terminators box')

    return {
        html: res.join('\n'),
        msgLineOffset,
    }
}
