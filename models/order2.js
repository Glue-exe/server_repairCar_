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
                    ) AS images
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
    }
};
