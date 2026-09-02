const pool = require('../libs/db_pool');

module.exports = {
    getMonthlyIncomeHistory: async () => {
        let conn;
        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    TO_CHAR(i_paid_at, 'YYYY-MM') AS month_year,
                    SUM(i_total)::FLOAT AS total_amount
                FROM public.invoice
                WHERE i_payment_status_id = 2
                    AND i_paid_at IS NOT NULL
                    AND i_paid_at >= CURRENT_DATE - INTERVAL '12 months'
                GROUP BY TO_CHAR(i_paid_at, 'YYYY-MM')
                ORDER BY month_year ASC;
            `;

            var rows = await conn.query(sql);

            return {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            console.error('Error in getMonthlyIncomeHistory:', error);
            return {
                isError: true,
                data: [],
                errorMessage: error.message
            };
            
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }
};
