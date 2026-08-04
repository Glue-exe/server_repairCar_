const pool = require('../libs/db_pool');

module.exports = {
    getSummaryData: async () => {
        let conn;
        try {
            conn = await pool.connect();

            // 1. SQL: รายได้รวมเดือนนี้
            const incomeSql = `
                SELECT COALESCE(SUM(total), 0)::FLOAT AS monthly_income
                FROM public.invoice
                WHERE payment_status = 'Paid'
                  AND paid_date IS NOT NULL
                  AND TO_CHAR(paid_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM');
            `;

            // 2. SQL: จำนวนรถเข้าซ่อมเดือนนี้
            const vehiclesSql = `
                SELECT COUNT(*)::INT AS vehicles_this_month
                FROM public.orders
                WHERE created_at IS NOT NULL
                  AND TO_CHAR(created_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM');
            `;

            // 3. SQL: งานซ่อมที่ค้างอยู่/กำลังทำ
            const activeJobsSql = `
                SELECT COUNT(*)::INT AS active_jobs_count
                FROM public.job_pool
                WHERE pool_status != 'Completed';
            `;

            // 4. SQL: อะไหล่ที่รออนุมัติ
            const pendingSql = `
                SELECT COUNT(*)::INT AS pending_count
                FROM public.request_part
                WHERE req_part_status != 'Approved' OR req_part_status IS NULL;
            `;

            // รัน Query ทั้งหมดเหมือนกัน 4 บรรทัด
            const incomeRes = await conn.query(incomeSql);
            const vehiclesRes = await conn.query(vehiclesSql);
            const activeJobsRes = await conn.query(activeJobsSql);
            const pendingRes = await conn.query(pendingSql);

            // จัดการดึงค่าผลลัพธ์ด้วย if-else ด้านล่างทั้งหมด
            let monthlyIncome = 0;
            if (incomeRes.rows.length > 0 && incomeRes.rows[0].monthly_income !== undefined) {
                monthlyIncome = incomeRes.rows[0].monthly_income;
            } else {
                monthlyIncome = 0;
            }

            let vehiclesThisMonth = 0;
            if (vehiclesRes.rows.length > 0 && vehiclesRes.rows[0].vehicles_this_month !== undefined) {
                vehiclesThisMonth = vehiclesRes.rows[0].vehicles_this_month;
            } else {
                vehiclesThisMonth = 0;
            }

            let activeJobsCount = 0;
            if (activeJobsRes.rows.length > 0 && activeJobsRes.rows[0].active_jobs_count !== undefined) {
                activeJobsCount = activeJobsRes.rows[0].active_jobs_count;
            } else {
                activeJobsCount = 0;
            }

            let pendingApprovalsCount = 0;
            if (pendingRes.rows.length > 0 && pendingRes.rows[0].pending_count !== undefined) {
                pendingApprovalsCount = pendingRes.rows[0].pending_count;
            } else {
                pendingApprovalsCount = 0;
            }

            return {
                isError: false,
                data: {
                    monthlyIncome: monthlyIncome,
                    vehiclesThisMonth: vehiclesThisMonth,
                    activeJobsCount: activeJobsCount,
                    pendingApprovalsCount: pendingApprovalsCount
                },
                errorMessage: ""
            };

        } catch (error) {
            console.error('Error in getSummaryData:', error);
            return {
                isError: true,
                data: {
                    monthlyIncome: 0,
                    vehiclesThisMonth: 0,
                    activeJobsCount: 0,
                    pendingApprovalsCount: 0
                },
                errorMessage: error.message
            };
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }
};
