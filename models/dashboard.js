const pool = require('../libs/db_pool');

module.exports = {
    getSummaryData: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            let sql = `
                SELECT 
                -- 1. ยอดรายได้เดือนนี้ (เฉพาะที่จ่ายแล้ว)
                (
                    SELECT COALESCE(SUM(i_total), 0)::FLOAT 
                    FROM invoice 
                    WHERE i_payment_status_id = 2 
                    AND TO_CHAR(i_paid_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                ) AS "monthlyIncome",

                -- 2. ยอดเงินค้างชำระ (บิลที่ออกแล้วแต่ยังไม่จ่าย)
                (
                    SELECT COALESCE(SUM(i_total), 0)::FLOAT 
                    FROM invoice 
                    WHERE i_payment_status_id = 1
                ) AS "unpaidTotal",

                -- 3. จำนวนรถเข้าซ่อมเดือนนี้
                (
                    SELECT COUNT(*)::INT 
                    FROM orders 
                    WHERE TO_CHAR(o_created_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                ) AS "vehiclesThisMonth",

                -- 4. งานที่กำลังดำเนินการซ่อมอยู่ (รอดำเนินการ + กำลังซ่อม)
                (
                    SELECT COUNT(*)::INT 
                    FROM orders 
                    WHERE o_order_status_id IN (1, 2)
                ) AS "activeJobsCount",

                -- 5. รายการขอเบิกอะไหล่ที่ยังรอการอนุมัติ
                (
                    SELECT COUNT(*)::INT 
                    FROM request_part 
                    WHERE rp_req_part_status_id = 1
                ) AS "pendingApprovalsCount";
            `;

            let rows = await conn.query(sql);

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
