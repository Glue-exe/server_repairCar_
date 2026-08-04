const pool = require('../libs/db_pool');

module.exports = {
    getMonthlyIncomeHistory: async () => {
        let conn;
        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    TO_CHAR(paid_date, 'YYYY-MM') AS month_year,
                    SUM(total)::FLOAT AS total_amount
                FROM public.invoice
                WHERE payment_status = 'Paid'
                    AND paid_date IS NOT NULL
                    AND paid_date >= CURRENT_DATE - INTERVAL '12 months'
                GROUP BY TO_CHAR(paid_date, 'YYYY-MM')
                ORDER BY month_year ASC;
            `;

            const rows = await conn.query(sql);

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
