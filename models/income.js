const pool = require('../libs/db_pool');

module.exports = {
    getMonthlyIncome: async () => {
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
                GROUP BY TO_CHAR(paid_date, 'YYYY-MM')
                ORDER BY month_year DESC;
            `

            const rows = await conn.query(sql);
            return {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            }
        } catch (error) {
            return {
                isError: true,
                data: [],
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }
    }
};