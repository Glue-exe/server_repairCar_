const pool = require('../libs/db_pool');

module.exports = {
    searchVehicalOrCustomer: async (searchVehicalOrCustomer) => {
        let conn;
        try {
            conn = await pool.connect();
            // ดึงข้อมูลชื่อลูกค้าและรถ
            const queryText = `
                SELECT 
                    c.cus_id,
                    c.cus_id AS id,
                    c.cus_id AS customer_id,
                    c.cus_first_name AS cus_firstname,
                    c.cus_first_name AS first_name,
                    c.cus_last_name AS cus_lastname,
                    c.cus_last_name AS last_name,
                    c.cus_phone AS cus_phone,
                    c.cus_phone AS phone,
                    v.v_id AS veh_id,
                    v.v_id AS id,
                    v.v_id AS vehicle_id,
                    v.v_license_plate AS veh_licenseplate,
                    v.v_license_plate AS license_plate,
                    vb.vb_id AS brand_id,
                    vb.vb_name AS brand_name,
                    vm.vm_id AS veh_model_id,
                    vm.vm_name AS veh_model,
                    vm.vm_name AS model_name,
                    v.v_color AS veh_color,
                    v.v_color AS color,
                    v.v_year AS veh_year,
                    v.v_year AS year
                FROM customer c
                JOIN vehicle v ON c.cus_id = v.v_customer_id
                LEFT JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                WHERE TRIM(c.cus_phone) = TRIM($1)
                   OR TRIM(v.v_license_plate) ILIKE TRIM($1);
            `;

            const vehicleResult = await conn.query(queryText, [searchVehicalOrCustomer]);
            const customersAndVehicles = vehicleResult.rows;

            // ดึงเฉพาะ รหัสรถ (v_id) ออกมา
            const vehicleIds = customersAndVehicles.map(r => r.v_id || r.id);

            let orders = [];
            // นำรหัสรถที่ได้ ไปค้นหาประวัติการซ่อม (Orders) ต่อ
            if (vehicleIds.length > 0) {
                const ordersResult = await conn.query(
                    `SELECT 
                        o.o_id AS orders_id,
                        o.o_id AS order_id,
                        o.o_id AS id,
                        v.v_customer_id AS cus_id,
                        o.o_vehicle_id AS veh_id,
                        o.o_vehicle_id AS vehicle_id,
                        o.o_created_by_account_id AS emp_id,
                        o.o_symptom AS order_symptom, 
                        o.o_symptom AS symptom,
                        o.o_order_status_id AS status_id,
                        o.o_priority_id AS orders_priority_id,
                        o.o_created_at AS created_at 
                     FROM orders o
                     JOIN vehicle v ON o.o_vehicle_id = v.v_id
                     WHERE o.o_vehicle_id = ANY($1) 
                     ORDER BY o.o_created_at DESC`,
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