const pool = require('../libs/db_pool');

// Dashboard ของ Owner — GET /api/dashboard/summary?range=today|week|month|year
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

            // ขอบเขตช่วงเวลา (ใช้ timezone ของ DB) — สัปดาห์เริ่มจันทร์ · ปี = กราฟรายเดือน, ช่วงอื่น = รายวัน
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
                    END AS range_end,
                    CASE WHEN $1 = 'year' THEN 'month' ELSE 'day' END AS trend_unit
                ;`,
                [range]
            );

            const rangeStart = bounds.rows[0].range_start;
            const rangeEnd = bounds.rows[0].range_end;
            const trendUnit = bounds.rows[0].trend_unit;

            // KPI — รายได้/ค่าแรง/อะไหล่ = บิลชำระแล้วในช่วงที่เลือก
            // unpaid = รวมทุกช่วง · activeRepairs = สถานะ 2 เท่านั้น (ตัวเลขปัจจุบัน)
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
                        SELECT COALESCE(SUM(i_total), 0)::FLOAT
                        FROM invoice
                        WHERE i_payment_status_id = 1
                            AND i_cancelled_at IS NULL
                    ) AS "unpaidTotal",
                    (
                        SELECT COUNT(*)::INT
                        FROM orders
                        WHERE o_created_at >= $1
                            AND o_created_at < $2
                    ) AS "vehiclesInRange",
                    (
                        SELECT COUNT(*)::INT
                        FROM orders
                        WHERE o_order_status_id = 2
                    ) AS "activeRepairs",
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

            // กราฟแนวโน้ม — เติมวัน/เดือนที่รายได้ 0 ให้กรอบเวลาครบ (generate_series)
            const trend = await conn.query(
                `
                WITH paid AS (
                    SELECT
                        date_trunc(CASE WHEN $3 = 'month' THEN 'month' ELSE 'day' END, i_paid_at) AS period,
                        SUM(i_total) AS total
                    FROM invoice
                    WHERE i_payment_status_id = 2
                        AND i_cancelled_at IS NULL
                        AND i_paid_at >= $1
                        AND i_paid_at < $2
                    GROUP BY 1
                )
                SELECT
                    TO_CHAR(
                        gs.period,
                        CASE WHEN $3 = 'month' THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END
                    ) AS period,
                    COALESCE(p.total, 0)::FLOAT AS total
                FROM generate_series(
                    $1::timestamptz,
                    $2::timestamptz - (CASE WHEN $3 = 'month' THEN INTERVAL '1 month' ELSE INTERVAL '1 day' END) / 2,
                    CASE WHEN $3 = 'month' THEN INTERVAL '1 month' ELSE INTERVAL '1 day' END
                ) AS gs(period)
                LEFT JOIN paid p ON p.period = gs.period
                ORDER BY gs.period
                ;`,
                [rangeStart, rangeEnd, trendUnit]
            );

            const data = {
                range: range,
                ...kpi.rows[0],
                trend: trend.rows,
            };

            result = {
                isError: false,
                data: data,
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
};
