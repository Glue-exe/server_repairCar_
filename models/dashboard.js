const pool = require('../libs/db_pool');

module.exports = {
    getSummaryData: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    (
                        SELECT COALESCE(SUM(i_total), 0)::FLOAT 
                        FROM public.invoice 
                        WHERE i_payment_status_id = 2 
                          AND i_paid_at IS NOT NULL 
                          AND TO_CHAR(i_paid_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                    ) AS "monthlyIncome",
                    (
                        SELECT COUNT(*)::INT 
                        FROM public.orders 
                        WHERE o_created_at IS NOT NULL 
                          AND TO_CHAR(o_created_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                    ) AS "vehiclesThisMonth",
                    (
                        SELECT COUNT(*)::INT 
                        FROM public.orders 
                        WHERE o_order_status_id IN (1, 2)
                    ) AS "activeJobsCount",
                    (
                        SELECT COUNT(*)::INT 
                        FROM public.request_part 
                        WHERE rp_req_part_status_id = 1 OR rp_req_part_status_id IS NULL
                    ) AS "pendingApprovalsCount";
            `;

            var rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn) {
                conn.release();
            }

            return result;
        }
    }
};
