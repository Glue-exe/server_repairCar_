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
                        SELECT COALESCE(SUM(total), 0)::FLOAT 
                        FROM public.invoice 
                        WHERE payment_status = 'Paid' 
                          AND paid_date IS NOT NULL 
                          AND TO_CHAR(paid_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                    ) AS "monthlyIncome",
                    (
                        SELECT COUNT(*)::INT 
                        FROM public.orders 
                        WHERE created_at IS NOT NULL 
                          AND TO_CHAR(created_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                    ) AS "vehiclesThisMonth",
                    (
                        SELECT COUNT(*)::INT 
                        FROM public.job_pool 
                        WHERE pool_status != 'Completed'
                    ) AS "activeJobsCount",
                    (
                        SELECT COUNT(*)::INT 
                        FROM public.request_part 
                        WHERE req_part_status != 'Approved' OR req_part_status IS NULL
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

