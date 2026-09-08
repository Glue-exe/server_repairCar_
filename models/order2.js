const pool = require("../libs/db_pool.js");
const path = require("path");
const fs = require("fs");

module.exports = {
    getPriorities: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    p_id AS id, 
                    p_name AS name 
                FROM priority 
                ORDER BY p_id ASC;
            `;

            const rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            return {
                isError: true,
                data: [],
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    getOrderStatuses: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    os_id AS id, 
                    os_name AS name 
                FROM order_status 
                ORDER BY os_id ASC;
            `;

            const rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            return {
                isError: true,
                data: [],
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    getAllOrders: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    o.o_id,
                    o.o_vehicle_id,
                    o.o_symptom,
                    o.o_order_status_id,
                    os.os_name,
                    o.o_priority_id,
                    p.p_name AS priority_name,
                    o.o_created_at,
                    v.v_license_plate,
                    v.v_color,
                    vb.vb_name AS brand_name,
                    vm.vm_name AS model_name,
                    c.cus_id,
                    c.cus_first_name,
                    c.cus_last_name,
                    c.cus_phone,
                    (
                        SELECT COUNT(*)::int 
                        FROM order_technician ot 
                        WHERE ot.ot_order_id = o.o_id
                    ) AS technician_count,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'account_id', acc.acc_id,
                                    'firstname', emp.emp_first_name,
                                    'lastname', emp.emp_last_name,
                                    'role_name', ar.ar_name
                                )
                            )
                            FROM order_technician ot
                            INNER JOIN account acc ON ot.ot_account_id = acc.acc_id
                            INNER JOIN account_role ar ON acc.acc_role_id = ar.ar_id
                            INNER JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                            WHERE ot.ot_order_id = o.o_id
                        ),
                        '[]'::json
                    ) AS technicians,
                    COALESCE(
                        (
                            SELECT json_agg(oi.oi_image_url) 
                            FROM order_image oi 
                            WHERE oi.oi_order_id = o.o_id
                        ),
                        '[]'::json
                    ) AS images
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                INNER JOIN priority p ON o.o_priority_id = p.p_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                ORDER BY o.o_created_at DESC;
            `;

            const rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            return {
                isError: true,
                data: [],
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    getOrdersByVehicleId: async (vehicleId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT
                    o.o_id,
                    o.o_vehicle_id,
                    o.o_symptom,
                    o.o_order_status_id,
                    os.os_name,
                    o.o_created_at,
                    COALESCE(
                        (SELECT json_agg(oi.oi_image_url) FROM order_image oi WHERE oi.oi_order_id = o.o_id),
                        '[]'::json
                    ) AS images,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'account_id', acc.acc_id,
                                    'firstname', emp.emp_first_name,
                                    'lastname', emp.emp_last_name,
                                    'role_name', ar.ar_name
                                )
                            )
                            FROM order_technician ot
                            INNER JOIN account acc ON ot.ot_account_id = acc.acc_id
                            INNER JOIN account_role ar ON acc.acc_role_id = ar.ar_id
                            INNER JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                            WHERE ot.ot_order_id = o.o_id
                        ),
                        '[]'::json
                    ) AS technicians
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                WHERE o.o_vehicle_id = $1
                ORDER BY o.o_created_at DESC;
            `;

            const rows = await conn.query(sql, [vehicleId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            return {
                isError: true,
                data: [],
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    createOrder: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            var sql = `
                INSERT INTO orders (
                    o_vehicle_id,
                    o_symptom,
                    o_order_status_id,
                    o_priority_id,
                    o_created_by_account_id
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING o_id, o_symptom, o_created_at;
            `;

            const rows = await conn.query(sql, [
                data.o_vehicle_id,
                data.o_symptom,
                data.o_order_status_id,
                data.o_priority_id,
                data.o_created_by_account_id
            ]);

            const newOrderId = rows.rows[0].o_id;

            // บันทึกรูป
            const uploadDir = path.join(__dirname, "../uploads");
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            if (data.images && Array.isArray(data.images)) {
                for (let i = 0; i < data.images.length; i++) {
                    const base64Data = data.images[i];
                    if (base64Data) {
                        const fileName = `order_${newOrderId}_${Date.now()}_${i}.jpg`;
                        const filePath = path.join(uploadDir, fileName);
                        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
                        fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));

                        const imageUrl = `/uploads/${fileName}`;

                        var imageSql = `
                            INSERT INTO order_image (
                                oi_order_id,
                                oi_image_url
                            ) VALUES ($1, $2);
                        `;
                        await conn.query(imageSql, [newOrderId, imageUrl]);
                    }
                }
            }

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');
            return {
                isError: true,
                data: "",
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    getOrderTechnicians: async (orderId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    acc.acc_id AS account_id,
                    emp.emp_first_name AS firstname,
                    emp.emp_last_name AS lastname,
                    ar.ar_name AS role_name
                FROM order_technician ot
                INNER JOIN account acc ON ot.ot_account_id = acc.acc_id
                INNER JOIN account_role ar ON acc.acc_role_id = ar.ar_id
                INNER JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                WHERE ot.ot_order_id = $1;
            `;

            const rows = await conn.query(sql, [orderId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: [],
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    acceptOrder: async (orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "INSERT INTO order_technician (ot_order_id, ot_account_id) VALUES ($1, $2)";
            await conn.query(sql, [orderId, accountId]);

            result = {
                isError: false,
                data: "รับงานสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    cancelOrderTechnician: async (orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "DELETE FROM order_technician WHERE ot_order_id = $1 AND ot_account_id = $2";
            await conn.query(sql, [orderId, accountId]);

            result = {
                isError: false,
                data: "ยกเลิกสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    updateOrderStatus: async (orderId, statusId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "UPDATE orders SET o_order_status_id = $1, o_updated_at = CURRENT_TIMESTAMP WHERE o_id = $2 RETURNING o_id, o_order_status_id";
            await conn.query(sql, [statusId, orderId]);

            var logSql = `
                INSERT INTO repair_log (rl_order_id, rl_updated_by_account_id, rl_created_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP);
            `;
            await conn.query(logSql, [orderId, accountId]);

            result = {
                isError: false,
                data: "อัปเดตสถานะสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    }
};
