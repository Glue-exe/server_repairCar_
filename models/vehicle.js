const pool = require("../libs/db_pool.js");

module.exports = {
    getBrands: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const rows = await conn.query(
                "SELECT vb_id, vb_name FROM vehicle_brand;"
            );

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    addBrand: async (data) => {
        let conn;
        let result;

        const brandName = data.vb_name ? String(data.vb_name).trim() : "";

        if (brandName === "") {
            return {
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุชื่อยี่ห้อรถยนต์",
            };
        }

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const dupRows = await conn.query(
                "SELECT vb_id FROM vehicle_brand WHERE vb_name = $1;",
                [brandName]
            );

            if (dupRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "มียี่ห้อนี้อยู่แล้ว",
                };
            }

            const rows = await conn.query(
                "INSERT INTO vehicle_brand (vb_name) VALUES ($1) RETURNING vb_id, vb_name;",
                [brandName]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: "",
            };
        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    updateBrand: async (data) => {
        let conn;
        let result;

        const brandId = Number(data.vb_id);
        const brandName = data.vb_name ? String(data.vb_name).trim() : "";

        if (!Number.isInteger(brandId) || brandId <= 0) {
            return {
                isError: true,
                data: null,
                errorMessage: "ไม่พบรหัสยี่ห้อรถยนต์ที่ระบุ",
            };
        }

        if (brandName === "") {
            return {
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุชื่อยี่ห้อรถยนต์",
            };
        }

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const dupRows = await conn.query(
                "SELECT vb_id FROM vehicle_brand WHERE vb_name = $1 AND vb_id <> $2;",
                [brandName, brandId]
            );

            if (dupRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "มียี่ห้อนี้อยู่แล้ว",
                };
            }

            const rows = await conn.query(
                "UPDATE vehicle_brand SET vb_name = $1 WHERE vb_id = $2 RETURNING vb_id, vb_name;",
                [brandName, brandId]
            );

            if (rows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบยี่ห้อรถยนต์ที่ระบุ",
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: "",
            };
        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    deleteBrand: async (brandId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const modelRows = await conn.query(
                "SELECT vm_id FROM vehicle_model WHERE vm_brand_id = $1 LIMIT 1;",
                [brandId]
            );

            if (modelRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ลบไม่ได้ เพราะยี่ห้อนี้ถูกใช้อยู่ในข้อมูลรุ่นรถ",
                };
            }

            const deleted = await conn.query(
                "DELETE FROM vehicle_brand WHERE vb_id = $1 RETURNING vb_id;",
                [brandId]
            );

            if (deleted.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบยี่ห้อรถยนต์ที่ระบุ",
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: deleted.rows[0].vb_id,
                errorMessage: "",
            };
        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    getModels: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const rows = await conn.query(
                `
                    SELECT
                        vm.vm_id,
                        vm.vm_name,
                        vm.vm_brand_id,
                        vb.vb_name
                    FROM vehicle_model vm
                    INNER JOIN vehicle_brand vb ON vb.vb_id = vm.vm_brand_id
                    ORDER BY vb.vb_name ASC, vm.vm_name ASC;
                `
            );

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    addModel: async (data) => {
        let conn;
        let result;

        const brandId = Number(data.vm_brand_id);
        const modelName = data.vm_name ? String(data.vm_name).trim() : "";

        if (!Number.isInteger(brandId) || brandId <= 0) {
            return {
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุยี่ห้อรถยนต์",
            };
        }

        if (modelName === "") {
            return {
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุชื่อรุ่นรถยนต์",
            };
        }

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const brandRows = await conn.query(
                "SELECT vb_id FROM vehicle_brand WHERE vb_id = $1;",
                [brandId]
            );

            if (brandRows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบยี่ห้อรถยนต์ที่ระบุ",
                };
            }

            const dupRows = await conn.query(
                "SELECT vm_id FROM vehicle_model WHERE vm_brand_id = $1 AND vm_name = $2;",
                [brandId, modelName]
            );

            if (dupRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "มียี่ห้อและชื่อรุ่นนี้อยู่แล้ว",
                };
            }

            const rows = await conn.query(
                "INSERT INTO vehicle_model (vm_brand_id, vm_name) VALUES ($1, $2) RETURNING vm_id, vm_brand_id, vm_name;",
                [brandId, modelName]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: "",
            };
        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    updateModel: async (data) => {
        let conn;
        let result;

        const modelId = Number(data.vm_id);
        const brandId = Number(data.vm_brand_id);
        const modelName = data.vm_name ? String(data.vm_name).trim() : "";

        if (!Number.isInteger(modelId) || modelId <= 0) {
            return {
                isError: true,
                data: null,
                errorMessage: "ไม่พบรหัสรุ่นรถยนต์ที่ระบุ",
            };
        }

        if (!Number.isInteger(brandId) || brandId <= 0) {
            return {
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุยี่ห้อรถยนต์",
            };
        }

        if (modelName === "") {
            return {
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุชื่อรุ่นรถยนต์",
            };
        }

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const brandRows = await conn.query(
                "SELECT vb_id FROM vehicle_brand WHERE vb_id = $1;",
                [brandId]
            );

            if (brandRows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบยี่ห้อรถยนต์ที่ระบุ",
                };
            }

            const dupRows = await conn.query(
                "SELECT vm_id FROM vehicle_model WHERE vm_brand_id = $1 AND vm_name = $2 AND vm_id <> $3;",
                [brandId, modelName, modelId]
            );

            if (dupRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "มียี่ห้อและชื่อรุ่นนี้อยู่แล้ว",
                };
            }

            const rows = await conn.query(
                `
                    UPDATE vehicle_model
                    SET vm_name = $1, vm_brand_id = $2
                    WHERE vm_id = $3
                    RETURNING vm_id, vm_brand_id, vm_name;
                `,
                [modelName, brandId, modelId]
            );

            if (rows.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบรุ่นรถยนต์ที่ระบุ",
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: rows.rows[0],
                errorMessage: "",
            };
        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    deleteModel: async (modelId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const vehicleRows = await conn.query(
                "SELECT v_id FROM vehicle WHERE v_vehicle_model_id = $1 LIMIT 1;",
                [modelId]
            );

            if (vehicleRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ลบไม่ได้ เพราะรุ่นนี้ถูกใช้อยู่ในข้อมูลรถของลูกค้า",
                };
            }

            const compatRows = await conn.query(
                "SELECT vpc_id FROM vehicle_part_compatibility WHERE vpc_vehicle_model_id = $1 LIMIT 1;",
                [modelId]
            );

            if (compatRows.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ลบไม่ได้ เพราะรุ่นนี้ยังมีข้อมูลความเข้ากันได้กับอะไหล่",
                };
            }

            const deleted = await conn.query(
                "DELETE FROM vehicle_model WHERE vm_id = $1 RETURNING vm_id;",
                [modelId]
            );

            if (deleted.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบรุ่นรถยนต์ที่ระบุ",
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: deleted.rows[0].vm_id,
                errorMessage: "",
            };
        } catch (error) {
            if (conn) await conn.query("ROLLBACK");
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },
};
