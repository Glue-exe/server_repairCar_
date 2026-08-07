const pool = require('../libs/db_pool');

module.exports = {
    searchVehicalOrCustomer: async (searchVehicalOrCustomer) => {
        let conn;
        try {
            
            conn = await pool.connect();
            //ดึงข้อมูลชื่อลูกค้าและรถ
            const queryText = `
                SELECT 
                    c.cus_id,
                    c.cus_firstname,
                    c.cus_lastname,
                    c.cus_phone,
                    v.veh_id,
                    v.veh_licenseplate,
                    vm.model_name AS veh_model,
                    v.veh_color,
                    vy.year AS veh_year
                FROM customer c
                JOIN vehicle v ON c.cus_id = v.customer_id
                JOIN vehicle_model vm ON v.veh_model_id = vm.model_id
                JOIN vehicle_model_year vy ON v.model_year_id = vy.model_year_id
                WHERE TRIM(c.cus_phone) = TRIM($1)
                   OR TRIM(v.veh_licenseplate) ILIKE TRIM($1);
            `;
            
            const vehicleResult = await conn.query(queryText, [searchVehicalOrCustomer]);
            const customersAndVehicles = vehicleResult.rows;

            //ดึงเฉพาะ รหัสรถ (veh_id) ออกมา
            const vehicleIds = customersAndVehicles.map(r => r.veh_id);

            let orders = [];
            //นำรหัสรถที่ได้ ไปค้นหาประวัติการซ่อม (Orders) ต่อ
            if (vehicleIds.length > 0) {
                const ordersResult = await conn.query(
                    `SELECT 
                        orders_id, cus_id, veh_id, emp_id, order_symptom, 
                        status_id, orders_priority_id, labor_cost, repair_time, created_at 
                     FROM orders 
                     WHERE veh_id = ANY($1) 
                     ORDER BY created_at DESC`,
                    [vehicleIds]
                );
                orders = ordersResult.rows;
            }

            return {
                isError: false,
                data: {
                    customersAndVehicles: customersAndVehicles,
                    orders: orders
                },
                errorMessage: ""
            };

        } catch (error) {
            return {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn) conn.release();
        }
    }
};