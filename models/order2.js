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

    getAllOrders: async (filters = {}) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            // conditions: ใช้เก็บข้อความเงื่อนไข SQL เช่น ['o.o_priority_id = $1', 'o.o_order_status_id = $2']
            // params: ใช้เก็บค่าข้อมูลจริงที่ส่งไปแทนที่ $1, $2 เพื่อความปลอดภัย (ป้องกัน SQL Injection)
            // หมายเหตุ: .push(...) คือคำสั่งของ JavaScript ในการ "เพิ่มข้อมูลเข้าไปต่อท้ายใน Array"
            let conditions = [];
            let params = [];

            // 1. กรองตามระดับความสำคัญ (ถ้ามีส่ง priority_id มา)
            if (filters.priority_id) {
                // .push(): เพิ่มค่าตัวเลข priority_id เข้าไปเก็บไว้ใน Array params
                params.push(filters.priority_id);
                // $${params.length} คือการใส่เลขลำดับอัตโนมัติ เช่น ตัวแรก params.length = 1 จะได้เป็น $1
                // .push(): เพิ่มข้อความเงื่อนไข SQL เข้าไปเก็บไว้ใน Array conditions
                conditions.push(`o.o_priority_id = $${params.length}`);
            }

            // 2. กรองตามสถานะงานซ่อม (ถ้ามีส่ง status_id มา)
            if (filters.status_id) {
                // .push(): เพิ่มค่าตัวเลข status_id เข้าไปเก็บไว้ใน Array params
                params.push(filters.status_id);
                // ตัวถัดไป params.length = 2 จะได้เป็น $2 โดยไม่ต้องพิมพ์เลขเอง
                // .push(): เพิ่มข้อความเงื่อนไข SQL เข้าไปเก็บไว้ใน Array conditions
                conditions.push(`o.o_order_status_id = $${params.length}`);
            }

            // 3. กรองตามสถานะช่างรับงาน (1 = ยังไม่มีช่างรับ, 2 = มีช่างรับแล้ว, 3 = งานที่ฉันกดรับ)
            if (filters.tech_filter == 1) {
                // NOT EXISTS: เป็นคำสั่ง SQL เช็คว่า "ต้องไม่มี" ข้อมูลในตาราง order_technician (คือยังไม่มีช่างรับงานนี้)
                conditions.push(`NOT EXISTS (SELECT 1 FROM order_technician WHERE ot_order_id = o.o_id)`);
            } else if (filters.tech_filter == 2) {
                // EXISTS: เป็นคำสั่ง SQL เช็คว่า "ต้องมี" ข้อมูลในตาราง order_technician อย่างน้อย 1 คน (มีช่างรับงานแล้ว)
                conditions.push(`EXISTS (SELECT 1 FROM order_technician WHERE ot_order_id = o.o_id)`);
            } else if (filters.tech_filter == 3 && filters.user_id) {
                // EXISTS: เช็คว่าในตาราง order_technician มี account_id ตรงกับฉัน (งานที่ฉันกดรับ)
                params.push(filters.user_id);
                conditions.push(`EXISTS (SELECT 1 FROM order_technician WHERE ot_order_id = o.o_id AND ot_account_id = $${params.length})`);
            }

            // นำเงื่อนไขทั้งหมดใน Array มารวมเป็นข้อความเดียวกันด้วยคำสั่ง .join(" AND ")
            // หมายเหตุ: .join("...") คือคำสั่งของ JavaScript ในการ "เอาสมาชิกทุกตัวใน Array มาร้อยต่อกันเป็น String เดียว โดยคั่นด้วยคำที่กำหนด"
            // ตัวอย่าง: ถ้า conditions = ['o.o_priority_id = $1', 'o.o_order_status_id = $2']
            // ผลลัพธ์ของ conditions.join(" AND ") จะได้เป็น: 'o.o_priority_id = $1 AND o.o_order_status_id = $2'
            // แต่ถ้าผู้ใช้ไม่ได้เลือกตัวกรองอะไรเลย conditions จะว่าง whereClause ก็จะว่างเปล่า "" (ส่งผลให้ดึงข้อมูลทั้งหมด Get All)
            let whereClause = "";
            if (conditions.length > 0) {
                whereClause = "WHERE " + conditions.join(" AND ");
            }

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
                    v.v_year,
                    vb.vb_name AS brand_name,
                    vm.vm_name AS model_name,
                    c.cus_id,
                    c.cus_first_name,
                    c.cus_last_name,
                    c.cus_phone
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                INNER JOIN priority p ON o.o_priority_id = p.p_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                ${whereClause}
                ORDER BY o.o_created_at DESC;
            `;

            const orderRes = await conn.query(sql, params);
            const orders = orderRes.rows;

            for (let order of orders) {
                const techRes = await conn.query(`
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
                `, [order.o_id]);

                const imgRes = await conn.query(`
                    SELECT oi_image_url 
                    FROM order_image 
                    WHERE oi_order_id = $1;
                `, [order.o_id]);

                order.technicians = techRes.rows;
                order.technician_count = techRes.rows.length;
                order.images = imgRes.rows.map(r => r.oi_image_url);

                // ตรวจสอบว่าผู้ใช้ที่กำลังดูอยู่นี้ (user_id) ได้กดรับงานนี้ไปแล้วหรือไม่
                // เพื่อส่งค่า true/false ไปให้หน้าบ้าน (Flutter) นำไปแสดงสีปุ่มได้เลย
                order.is_accepted_by_me = false;
                if (filters.user_id) {
                    for (let t of techRes.rows) {
                        if (t.account_id == filters.user_id) {
                            order.is_accepted_by_me = true; // ฉันรับงานนี้แล้ว
                            break;
                        }
                    }
                }
            }

            result = {
                isError: false,
                data: orders,
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

    getOrderById: async (orderId, userId = null) => {
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
                    v.v_year,
                    vb.vb_name AS brand_name,
                    vm.vm_name AS model_name,
                    c.cus_id,
                    c.cus_first_name,
                    c.cus_last_name,
                    c.cus_phone
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                INNER JOIN priority p ON o.o_priority_id = p.p_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                WHERE o.o_id = $1;
            `;

            const orderRes = await conn.query(sql, [orderId]);
            const order = orderRes.rows[0];

            const techRes = await conn.query(`
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
            `, [orderId]);

            const imgRes = await conn.query(`
                SELECT oi_image_url 
                FROM order_image 
                WHERE oi_order_id = $1;
            `, [orderId]);

            order.technicians = techRes.rows;
            order.technician_count = techRes.rows.length;
            order.images = imgRes.rows.map(r => r.oi_image_url);

            // ตรวจสอบว่า user_id นี้กดรับงานไปแล้วหรือไม่
            order.is_accepted_by_me = false;
            if (userId) {
                for (let t of techRes.rows) {
                    if (t.account_id == userId) {
                        order.is_accepted_by_me = true;
                        break;
                    }
                }
            }

            result = {
                isError: false,
                data: order,
                errorMessage: ""
            };

        } catch (error) {
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
                    o.o_created_at
                FROM orders o
                INNER JOIN order_status os ON o.o_order_status_id = os.os_id
                WHERE o.o_vehicle_id = $1
                ORDER BY o.o_created_at DESC;
            `;

            const orderRes = await conn.query(sql, [vehicleId]);
            const orders = orderRes.rows;

            for (let order of orders) {
                const techRes = await conn.query(`
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
                `, [order.o_id]);

                const imgRes = await conn.query(`
                    SELECT oi_image_url 
                    FROM order_image 
                    WHERE oi_order_id = $1;
                `, [order.o_id]);

                order.technicians = techRes.rows;
                order.images = imgRes.rows.map(r => r.oi_image_url);
            }

            result = {
                isError: false,
                data: orders,
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
