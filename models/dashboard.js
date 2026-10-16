const pool = require('../libs/db_pool');

const ALLOWED_RANGES = ['today', 'week', 'month', 'year'];

module.exports = {
    getSummaryData: async (range) => {
        if (!ALLOWED_RANGES.includes(range)) {
            range = 'month';
        }

        let conn;
        let result;

        try {
            conn = await pool.connect();

            // ขอบเขตช่วงเวลา
            const bounds = await conn.query(
                `
                SELECT
                    CASE $1
                        WHEN 'today' THEN date_trunc('day', CURRENT_DATE::timestamptz)
                        WHEN 'week'  THEN date_trunc('week', CURRENT_DATE::timestamptz)
                        WHEN 'year'  THEN date_trunc('year', CURRENT_DATE::timestamptz)
                        ELSE date_trunc('month', CURRENT_DATE::timestamptz)
                    END AS range_start,
                    CASE $1
                        WHEN 'today' THEN date_trunc('day', CURRENT_DATE::timestamptz) + INTERVAL '1 day'
                        WHEN 'week'  THEN date_trunc('week', CURRENT_DATE::timestamptz) + INTERVAL '7 days'
                        WHEN 'year'  THEN date_trunc('year', CURRENT_DATE::timestamptz) + INTERVAL '1 year'
                        ELSE date_trunc('month', CURRENT_DATE::timestamptz) + INTERVAL '1 month'
                    END AS range_end
                ;`,
                [range]
            );

            const rangeStart = bounds.rows[0].range_start;
            const rangeEnd = bounds.rows[0].range_end;

            const kpi = await conn.query(
                `
                SELECT
                    (
                        SELECT COALESCE(SUM(i_total), 0)::FLOAT
                        FROM invoice
                        WHERE i_payment_status_id = 2
                            AND i_cancelled_at IS NULL
                            AND i_paid_at >= $1
                            AND i_paid_at < $2
                    ) AS income,
                    (
                        SELECT COUNT(*)::INT
                        FROM orders
                        WHERE o_created_at >= $1
                            AND o_created_at < $2
                    ) AS "vehiclesInRange",
                    (
                        SELECT COUNT(*)::INT
                        FROM orders
                        WHERE o_order_status_id = 1
                    ) AS "pendingRepairs",
                    (
                        SELECT COUNT(*)::INT
                        FROM orders
                        WHERE o_order_status_id = 2
                    ) AS "activeRepairs",
                    (
                        SELECT COUNT(*)::INT
                        FROM orders
                        WHERE o_order_status_id = 3
                    ) AS "awaitingPickup",
                    (
                        SELECT COUNT(*)::INT
                        FROM request_part
                        WHERE rp_req_part_status_id = 1
                    ) AS "pendingPartApprovals",
                    (
                        SELECT COALESCE(SUM(i_labor_total), 0)::FLOAT
                        FROM invoice
                        WHERE i_payment_status_id = 2
                            AND i_cancelled_at IS NULL
                            AND i_paid_at >= $1
                            AND i_paid_at < $2
                    ) AS "laborTotal",
                    (
                        SELECT COALESCE(SUM(i_parts_total), 0)::FLOAT
                        FROM invoice
                        WHERE i_payment_status_id = 2
                            AND i_cancelled_at IS NULL
                            AND i_paid_at >= $1
                            AND i_paid_at < $2
                    ) AS "partsTotal"
                ;`,
                [rangeStart, rangeEnd]
            );

            result = {
                isError: false,
                data: {
                    range: range,
                    ...kpi.rows[0],
                },
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) {
                conn.release();
            }
        }

        return result;
    },

    // รายงานกำไรสุทธิ

    getProfitReport: async (mode) => {
        if (mode !== 'year') {
            mode = 'month';
        }

        let conn;
        let result;

        try {
            conn = await pool.connect();

            if (mode === 'year') {
                const rows = await conn.query(
                    `
                    SELECT
                        TO_CHAR(i_paid_at, 'YYYY') AS period,
                        SUM(i_total)::FLOAT AS income,
                        SUM(i_parts_total)::FLOAT AS expense,
                        SUM(i_labor_total)::FLOAT AS profit
                    FROM invoice
                    WHERE i_payment_status_id = 2
                        AND i_cancelled_at IS NULL
                        AND i_paid_at IS NOT NULL
                    GROUP BY TO_CHAR(i_paid_at, 'YYYY')
                    ORDER BY period ASC;
                    `
                );

                result = {
                    isError: false,
                    data: rows.rows,
                    errorMessage: "",
                };
            } else {
                // ขอบเขต 12 เดือนล่าสุด (รวมเดือนปัจจุบัน)
                const bounds = await conn.query(
                    `
                    SELECT
                        date_trunc('month', CURRENT_DATE::timestamptz) - INTERVAL '11 months' AS range_start,
                        date_trunc('month', CURRENT_DATE::timestamptz) + INTERVAL '1 month' AS range_end;
                    `
                );

                const rangeStart = bounds.rows[0].range_start;
                const rangeEnd = bounds.rows[0].range_end;

                const rows = await conn.query(
                    `
                    WITH paid AS (
                        SELECT
                            date_trunc('month', i_paid_at) AS period,
                            SUM(i_total) AS income,
                            SUM(i_parts_total) AS expense,
                            SUM(i_labor_total) AS profit
                        FROM invoice
                        WHERE i_payment_status_id = 2
                            AND i_cancelled_at IS NULL
                            AND i_paid_at >= $1
                            AND i_paid_at < $2
                        GROUP BY 1
                    )
                    SELECT
                        TO_CHAR(gs.period, 'YYYY-MM') AS period,
                        COALESCE(p.income, 0)::FLOAT AS income,
                        COALESCE(p.expense, 0)::FLOAT AS expense,
                        COALESCE(p.profit, 0)::FLOAT AS profit
                    FROM generate_series($1::timestamptz, $2::timestamptz - INTERVAL '15 days', INTERVAL '1 month') AS gs(period)
                    LEFT JOIN paid p ON p.period = gs.period
                    ORDER BY gs.period ASC;
                    `,
                    [rangeStart, rangeEnd]
                );

                result = {
                    isError: false,
                    data: rows.rows,
                    errorMessage: "",
                };
            }
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) {
                conn.release();
            }
        }

        return result;
    },
};
