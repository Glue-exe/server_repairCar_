const pool = require("../libs/db_pool.js");

module.exports = {
    createOrder: async (data, imageName, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const orderSql = `
                INSERT INTO orders (
                    o_vehicle_id,
                    o_symptom,
                    o_order_status_id,
                    o_priority_id,
                    o_created_by_account_id
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING o_id, o_created_at;
            `;

            const rows = await conn.query(orderSql, [
                data.o_vehicle_id,
                data.o_symptom,
                1,
                data.o_priority_id,
                accountId
            ]);

            const newOrderId = rows.rows[0].o_id;

            if (imageName) {
                await conn.query(
                    `
                        INSERT INTO order_image (oi_order_id, oi_image_url)
                        VALUES ($1, $2);
                    `,
                    [newOrderId, imageName]
                );
            }

            await conn.query(
                `
                    INSERT INTO repair_log (rl_order_id, rl_order_status_id, rl_updated_by_account_id, rl_created_at)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP);
                `,
                [newOrderId, 1, accountId]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getOrder: async (accId) => {
        let conn;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    o.o_id,
                    o.o_symptom,
                    o.o_order_status_id,
                    os.os_name,
                    o.o_priority_id,
                    p.p_name,
                    v.v_license_plate,
                    vb.vb_id,
                    vb.vb_name,
                    v.v_vehicle_model_id,
                    vm.vm_name,
                    v.v_color,
                    v.v_year,
                    t.t_id,
                    t.t_name,
                    c.cus_first_name,
                    c.cus_last_name,
                    c.cus_phone,
                    (ot.ot_account_id IS NOT NULL) AS accept_by_me
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                INNER JOIN priority p ON o.o_priority_id = p.p_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                INNER JOIN title t ON c.cus_title_id = t.t_id
                LEFT JOIN order_technician ot 
                    ON o.o_id = ot.ot_order_id AND ot.ot_account_id = $1
                ORDER BY o.o_created_at DESC;
            `;

            const rows = await conn.query(sql, [accId]);

            return {
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
        }
    },

    getOrderById: async (accId, orderId) => {
        let conn;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    o.o_id,
                    o.o_symptom,
                    o.o_order_status_id,
                    os.os_name,
                    o.o_priority_id,
                    p.p_name,
                    v.v_license_plate,
                    vb.vb_id,
                    vb.vb_name,
                    v.v_vehicle_model_id,
                    vm.vm_name,
                    v.v_color,
                    v.v_year,
                    t.t_id,
                    t.t_name,
                    c.cus_first_name,
                    c.cus_last_name,
                    c.cus_phone,
                    (ot.ot_account_id IS NOT NULL) AS accept_by_me
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                INNER JOIN priority p ON o.o_priority_id = p.p_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                INNER JOIN title t ON c.cus_title_id = t.t_id
                LEFT JOIN order_technician ot 
                    ON o.o_id = ot.ot_order_id AND ot.ot_account_id = $1
                WHERE o.o_id = $2;
            `;

            const rows = await conn.query(sql, [accId, orderId]);

            return {
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
        }
    },

    updatePriorityOrder: async (orderId, priorityId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            var checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            var member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงไม่สามารถแก้ไขได้"
                };
            }

            var sql = `
                UPDATE orders 
                SET o_priority_id = $1, 
                    o_updated_at = CURRENT_TIMESTAMP 
                WHERE o_id = $2 
                RETURNING o_id, o_priority_id, o_updated_at;
            `;

            var rows = await conn.query(sql, [priorityId, orderId]);

            if (rows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบข้อมูลใบสั่งซ่อมที่ต้องการแก้ไข"
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            if (conn) {
                await conn.query("ROLLBACK");
            }
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    updateStatusOrder: async (orderId, statusId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            var checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            var member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงไม่สามารถเปลี่ยนสถานะได้"
                };
            }

            var sql = `
                UPDATE orders 
                SET o_order_status_id = $1, 
                    o_updated_at = CURRENT_TIMESTAMP 
                WHERE o_id = $2 
                RETURNING o_id, o_order_status_id, o_updated_at;
            `;

            var rows = await conn.query(sql, [statusId, orderId]);

            if (rows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบข้อมูลใบสั่งซ่อมที่ต้องการแก้ไข"
                };
            }

            var logSql = `
                INSERT INTO repair_log (rl_order_id, rl_order_status_id, rl_updated_by_account_id, rl_created_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP);
            `;
            await conn.query(logSql, [orderId, statusId, accountId]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            if (conn) {
                await conn.query("ROLLBACK");
            }
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    updateSymptomOrder: async (orderId, symptom, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            var checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            var member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงไม่สามารถแก้ไขได้"
                };
            }

            var sql = `
                UPDATE orders 
                SET o_symptom = $1, 
                    o_updated_at = CURRENT_TIMESTAMP 
                WHERE o_id = $2 
                RETURNING o_id, o_symptom, o_updated_at;
            `;

            var rows = await conn.query(sql, [symptom, orderId]);

            if (rows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบข้อมูลใบสั่งซ่อมที่ต้องการแก้ไข"
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            if (conn) {
                await conn.query("ROLLBACK");
            }
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getImages: async (orderId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    oi_id, 
                    oi_order_id, 
                    oi_image_url, 
                    oi_created_at
                FROM order_image
                WHERE oi_order_id = $1
                ORDER BY oi_id ASC;
            `;

            var rows = await conn.query(sql, [orderId]);

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

    addImage: async (orderId, imageUrl, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            var checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            var member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงไม่แนบรูปภาพได้"
                };
            }

            var sql = `
                INSERT INTO order_image (oi_order_id, oi_image_url, oi_created_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                RETURNING oi_id, oi_order_id, oi_image_url, oi_created_at;
            `;

            var rows = await conn.query(sql, [orderId, imageUrl]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: ""
            };

        } catch (error) {
            if (conn) {
                await conn.query("ROLLBACK");
            }
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    deleteImage: async (imageId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const imageSql = `
                SELECT oi_order_id, oi_image_url
                FROM order_image
                WHERE oi_id = $1;
            `;
            const image = await conn.query(imageSql, [imageId]);

            if (image.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบรูปภาพที่ต้องการลบ"
                };
            }

            const orderId = image.rows[0].oi_order_id;

            const checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            const member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงไม่สามารถลบรูปได้"
                };
            }

            await conn.query("DELETE FROM order_image WHERE oi_id = $1;", [imageId]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: {
                    image_url: image.rows[0].oi_image_url
                },
                errorMessage: ""
            };

        } catch (error) {
            if (conn) {
                await conn.query("ROLLBACK");
            }
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getOrderTechnician: async (orderId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    ot.ot_id,
                    ot.ot_assigned_at,
                    acc.acc_id,
                    acc.acc_username,
                    emp.emp_id,
                    t.t_name,
                    emp.emp_first_name,
                    emp.emp_last_name,
                    emp.emp_phone,
                    ar.ar_id,
                    ar.ar_name
                FROM order_technician ot
                INNER JOIN account acc ON ot.ot_account_id = acc.acc_id
                INNER JOIN account_role ar ON acc.acc_role_id = ar.ar_id
                INNER JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                INNER JOIN title t ON emp.emp_title_id = t.t_id
                WHERE ot.ot_order_id = $1
                ORDER BY ot.ot_id ASC;
            `;

            var rows = await conn.query(sql, [orderId]);

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

            var checkSql = `
                SELECT ot_id 
                FROM order_technician 
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            var exist = await conn.query(checkSql, [orderId, accountId]);

            if (exist.rows.length > 0) {
                result = {
                    isError: true,
                    data: null,
                    errorMessage: "คุณได้รับงานซ่อมนี้ไปแล้ว"
                };
            } else {
                var sql = `
                    INSERT INTO order_technician (ot_order_id, ot_account_id, ot_assigned_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    RETURNING ot_id, ot_order_id, ot_account_id, ot_assigned_at;
                `;

                var rows = await conn.query(sql, [orderId, accountId]);

                result = {
                    isError: false,
                    data: rows.rows[0],
                    errorMessage: ""
                };
            }

        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    cancelAcceptOrder: async (orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            const member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงไม่สามารถยกเลิกได้"
                };
            }

            const otId = member.rows[0].ot_id;

            const subTaskSql = `
                SELECT stt_id
                FROM sub_task_technician
                WHERE stt_order_technician_id = $1
                LIMIT 1;
            `;
            const subTask = await conn.query(subTaskSql, [otId]);

            if (subTask.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่สามารถยกเลิกรับงานได้ เนื่องจากมีงานซ่อมย่อยที่รับผิดชอบอยู่"
                };
            }

            await conn.query("DELETE FROM order_technician WHERE ot_id = $1;", [otId]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: null,
                errorMessage: ""
            };

        } catch (error) {
            if (conn) {
                await conn.query("ROLLBACK");
            }
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getOrderHistoryByVehicleId: async (vehicleId) => {
        let conn;

        if (!vehicleId) {
            return {
                isError: true,
                data: [],
                errorMessage: "ไม่พบรถยนต์ที่ระบุ"
            };
        }

        try {
            conn = await pool.connect();

            const sql = `
                SELECT
                    o.o_id,
                    o.o_symptom,
                    os.os_name,
                    o.o_created_at
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                WHERE o.o_vehicle_id = $1
                ORDER BY o.o_created_at DESC;
            `;

            const rows = await conn.query(sql, [vehicleId]);

            return {
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
        }
    }
};
