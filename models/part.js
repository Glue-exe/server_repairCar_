const pool = require('../libs/db_pool');

module.exports = {
    getPart: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    part_id,
                    part_id AS id,
                    part_name,
                    part_name AS name,
                    part_price,
                    part_price AS price,
                    part_brand,
                    part_brand AS brand,
                    part_url
                FROM part
                ORDER BY part_id ASC
            `;

            var rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    addPart: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            var sql = `
                INSERT INTO part
                    (part_name, part_price, part_brand, part_url)
                VALUES
                    ($1, $2, $3, $4)
                RETURNING part_id, part_id AS id
            `;

            var rows = await conn.query(sql, [
                data.part_name || data.name, 
                data.part_price || data.price, 
                data.part_brand || data.brand,
                data.part_url || null
            ]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "เพิ่มข้อมูลอะไหล่สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');
            
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    editPart: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            var sql = `
                UPDATE part
                SET
                    part_name = $1,
                    part_price = $2,
                    part_brand = $3
                WHERE part_id = $4
            `;

            var rows = await conn.query(sql, [
                data.part_name || data.name, 
                data.part_price || data.price, 
                data.part_brand || data.brand, 
                data.part_id || data.id
            ]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "แก้ไขข้อมูลอะไหล่สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');

            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    deletePart: async (part_id) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            var sql = `DELETE FROM part WHERE part_id = $1`;

            await conn.query(sql, [part_id]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "ลบข้อมูลอะไหล่สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');

            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },
}