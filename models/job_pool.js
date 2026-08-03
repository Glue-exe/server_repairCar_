const pool = require('../libs/db_pool');

module.exports = {
    getJobPool: async () => {
        let conn;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    jp.jop_pool_id,
                    jp.pool_status,
                    jp.claimed_at,
                    
                    -- ข้อมูลการซ่อม
                    o.orders_id,
                    o.order_symptom,
                    o.created_at AS order_created_at,
                    
                    -- ข้อมูลความสำคัญและสถานะการซ่อม
                    op.priority_name,
                    rs.status_name AS repair_status_name,
                    
                    -- ข้อมูลลูกค้า
                    c.cus_id,
                    CONCAT(c.cus_firstname, ' ', c.cus_lastname) AS customer_name,
                    c.cus_phone,
                    
                    -- ข้อมูลรถยนต์
                    v.veh_licenseplate,
                    vb.brand_name AS veh_brand,
                    v.veh_model,
                    v.veh_color,
                    
                    -- ข้อมูลช่างที่รับงานไปทำ
                    jp.claimed_by_emp_id,
                    CONCAT(emp.emp_firstname, ' ', emp.emp_lastname) AS claimed_by_emp_name

                FROM job_pool jp
                INNER JOIN orders o ON jp.orders_id = o.orders_id
                LEFT JOIN customer c ON o.cus_id = c.cus_id
                LEFT JOIN vehicle v ON o.veh_id = v.veh_id
                LEFT JOIN vehicle_brand vb ON v.brand_id = vb.brand_id
                LEFT JOIN orders_priority op ON o.orders_priority_id = op.orders_priority_id
                LEFT JOIN repair_status rs ON o.status_id = rs.status_id
                LEFT JOIN employee emp ON jp.claimed_by_emp_id = emp.emp_id
                
                ORDER BY jp.jop_pool_id DESC;
            `;

            const rows = await conn.query(sql);

            return {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            console.error('Error in getJobPool:', error);
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