const pool = require("../libs/db_pool.js");

module.exports = {
    getInvoiceByOrderId: async (orderId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const invoiceSql = `
                SELECT
                    i.i_id AS id,
                    i.i_order_id AS order_id,
                    i.i_parts_total::FLOAT AS parts_total,
                    i.i_labor_total::FLOAT AS labor_total,
                    i.i_total::FLOAT AS total,
                    i.i_payment_method_id AS payment_method_id,
                    pm.pm_name AS payment_method,
                    i.i_payment_status_id AS payment_status_id,
                    ps.ps_name AS payment_status,
                    i.i_created_at AS created_at,
                    i.i_image_url AS image_url,
                    CONCAT(COALESCE(t.t_name, ''), c.cus_first_name, ' ', c.cus_last_name) AS customer_name,
                    c.cus_phone AS customer_phone,
                    v.v_license_plate AS license_plate,
                    CONCAT(vb.vb_name, ' ', vm.vm_name) AS vehicle_name
                FROM invoice i
                LEFT JOIN payment_method pm ON i.i_payment_method_id = pm.pm_id
                INNER JOIN payment_status ps ON i.i_payment_status_id = ps.ps_id
                INNER JOIN orders o ON i.i_order_id = o.o_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                LEFT JOIN title t ON c.cus_title_id = t.t_id
                WHERE i.i_order_id = $1 AND i.i_cancelled_at IS NULL;
            `;
            const invoiceRes = await conn.query(invoiceSql, [orderId]);

            if (invoiceRes.rows.length === 0) {
                result = {
                    isError: false,
                    data: null,
                    errorMessage: "",
                };
            } else {
                const invoice = invoiceRes.rows[0];

                const lineRes = await conn.query(
                    `
                        SELECT
                            il_type AS type,
                            il_sub_task_id AS sub_task_id,
                            il_part_id AS part_id,
                            il_name AS name,
                            il_brand AS brand,
                            il_unit AS unit,
                            il_quantity AS quantity,
                            il_unit_price::FLOAT AS unit_price,
                            il_total::FLOAT AS total
                        FROM invoice_line
                        WHERE il_invoice_id = $1
                        ORDER BY il_id ASC;
                    `,
                    [invoice.id]
                );

                invoice.lines = lineRes.rows;

                result = {
                    isError: false,
                    data: invoice,
                    errorMessage: "",
                };
            }
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

    createInvoice: async (orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const memberRes = await conn.query(
                `
                    SELECT ot_id
                    FROM order_technician
                    WHERE ot_order_id = $1 AND ot_account_id = $2;
                `,
                [orderId, accountId]
            );

            if (memberRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงออกบิลไม่ได้",
                };
            }

            const existRes = await conn.query(
                "SELECT i_id FROM invoice WHERE i_order_id = $1 AND i_cancelled_at IS NULL;",
                [orderId]
            );

            if (existRes.rows.length > 0) {
                await conn.query("ROLLBACK");
                result = {
                    isError: true,
                    data: null,
                    errorMessage: "Order นี้มีบิลอยู่แล้ว",
                };
            } else {
                const laborRes = await conn.query(
                    `
                        SELECT COALESCE(SUM(st_labor_cost), 0.00)::FLOAT AS labor_total
                        FROM sub_task
                        WHERE st_order_id = $1 AND st_sub_task_status_id = 3;
                    `,
                    [orderId]
                );
                const laborTotal = laborRes.rows[0].labor_total;

                const partsRes = await conn.query(
                    `
                        SELECT COALESCE(SUM(rpi.rpi_quantity * rpi.rpi_price), 0.00)::FLOAT AS parts_total
                        FROM request_part_item rpi
                        INNER JOIN request_part rp ON rpi.rpi_request_part_id = rp.rp_id
                        INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
                        WHERE st.st_order_id = $1
                            AND st.st_sub_task_status_id = 3
                            AND rp.rp_req_part_status_id = 2;
                    `,
                    [orderId]
                );
                const partsTotal = partsRes.rows[0].parts_total;

                const total = laborTotal + partsTotal;

                const invoiceRes = await conn.query(
                    `
                        INSERT INTO invoice (
                            i_order_id,
                            i_parts_total,
                            i_labor_total,
                            i_total,
                            i_payment_method_id,
                            i_payment_status_id,
                            i_created_by_account_id
                        ) VALUES ($1, $2, $3, $4, NULL, 1, $5)
                        RETURNING i_id;
                    `,
                    [orderId, partsTotal, laborTotal, total, accountId]
                );
                const invoiceId = invoiceRes.rows[0].i_id;

                await conn.query(
                    `
                        INSERT INTO invoice_line (
                            il_invoice_id,
                            il_type,
                            il_sub_task_id,
                            il_name,
                            il_quantity,
                            il_unit_price,
                            il_total
                        )
                        SELECT $1, 'labor', st_id, st_name, 1, st_labor_cost, st_labor_cost
                        FROM sub_task
                        WHERE st_order_id = $2 AND st_sub_task_status_id = 3;
                    `,
                    [invoiceId, orderId]
                );

                await conn.query(
                    `
                        INSERT INTO invoice_line (
                            il_invoice_id,
                            il_type,
                            il_sub_task_id,
                            il_part_id,
                            il_name,
                            il_brand,
                            il_unit,
                            il_quantity,
                            il_unit_price,
                            il_total
                        )
                        SELECT
                            $1,
                            'part',
                            st.st_id,
                            p.part_id,
                            p.part_name,
                            pb.pb_name,
                            p.unit,
                            rpi.rpi_quantity,
                            rpi.rpi_price,
                            (rpi.rpi_quantity * rpi.rpi_price)
                        FROM request_part_item rpi
                        INNER JOIN request_part rp ON rpi.rpi_request_part_id = rp.rp_id
                        INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
                        INNER JOIN part p ON rpi.rpi_part_id = p.part_id
                        LEFT JOIN part_brand pb ON p.part_brand_id = pb.pb_id
                        WHERE st.st_order_id = $2
                            AND st.st_sub_task_status_id = 3
                            AND rp.rp_req_part_status_id = 2;
                    `,
                    [invoiceId, orderId]
                );

                await conn.query("COMMIT");

                result = {
                    isError: false,
                    data: {
                        invoice_id: invoiceId,
                    },
                    errorMessage: "",
                };
            }
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

    cancelInvoice: async (invoiceId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const invoiceRes = await conn.query(
                "SELECT i_order_id FROM invoice WHERE i_id = $1;",
                [invoiceId]
            );

            if (invoiceRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบิลที่ต้องการยกเลิก",
                };
            }

            const memberRes = await conn.query(
                `
                    SELECT ot_id
                    FROM order_technician
                    WHERE ot_order_id = $1 AND ot_account_id = $2;
                `,
                [invoiceRes.rows[0].i_order_id, accountId]
            );

            if (memberRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงยกเลิกบิลไม่ได้",
                };
            }

            const res = await conn.query(
                `
                    UPDATE invoice
                    SET i_cancelled_at = CURRENT_TIMESTAMP
                    WHERE i_id = $1 AND i_cancelled_at IS NULL
                    RETURNING i_id;
                `,
                [invoiceId]
            );

            if (res.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบิลที่ต้องการยกเลิก",
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
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

    setImage: async (invoiceId, imageUrl, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const invoiceRes = await conn.query(
                "SELECT i_order_id, i_image_url FROM invoice WHERE i_id = $1;",
                [invoiceId]
            );

            if (invoiceRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบิลที่ระบุ",
                };
            }

            const memberRes = await conn.query(
                `
                    SELECT ot_id
                    FROM order_technician
                    WHERE ot_order_id = $1 AND ot_account_id = $2;
                `,
                [invoiceRes.rows[0].i_order_id, accountId]
            );

            if (memberRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงแนบรูปไม่ได้",
                };
            }

            const oldUrl = invoiceRes.rows[0].i_image_url;

            await conn.query(
                "UPDATE invoice SET i_image_url = $1 WHERE i_id = $2;",
                [imageUrl, invoiceId]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: {
                    image_url: imageUrl,
                    old_image_url: oldUrl,
                },
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

    clearImage: async (invoiceId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const invoiceRes = await conn.query(
                "SELECT i_order_id, i_image_url FROM invoice WHERE i_id = $1;",
                [invoiceId]
            );

            if (invoiceRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบิลที่ระบุ",
                };
            }

            const memberRes = await conn.query(
                `
                    SELECT ot_id
                    FROM order_technician
                    WHERE ot_order_id = $1 AND ot_account_id = $2;
                `,
                [invoiceRes.rows[0].i_order_id, accountId]
            );

            if (memberRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงลบรูปไม่ได้",
                };
            }

            const oldUrl = invoiceRes.rows[0].i_image_url;

            if (oldUrl === null) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบรูปที่ต้องการลบ",
                };
            }

            await conn.query(
                "UPDATE invoice SET i_image_url = NULL WHERE i_id = $1;",
                [invoiceId]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: {
                    image_url: oldUrl,
                },
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

    updatePaymentMethod: async (invoiceId, methodId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const invoiceRes = await conn.query(
                "SELECT i_order_id FROM invoice WHERE i_id = $1;",
                [invoiceId]
            );

            if (invoiceRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบิลที่ระบุ",
                };
            }

            const memberRes = await conn.query(
                `
                    SELECT ot_id
                    FROM order_technician
                    WHERE ot_order_id = $1 AND ot_account_id = $2;
                `,
                [invoiceRes.rows[0].i_order_id, accountId]
            );

            if (memberRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงเปลี่ยนวิธีชำระเงินไม่ได้",
                };
            }

            await conn.query(
                "UPDATE invoice SET i_payment_method_id = $1 WHERE i_id = $2;",
                [methodId, invoiceId]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
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

    updatePaymentStatus: async (invoiceId, statusId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const invoiceRes = await conn.query(
                "SELECT i_order_id FROM invoice WHERE i_id = $1;",
                [invoiceId]
            );

            if (invoiceRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบิลที่ระบุ",
                };
            }

            const memberRes = await conn.query(
                `
                    SELECT ot_id
                    FROM order_technician
                    WHERE ot_order_id = $1 AND ot_account_id = $2;
                `,
                [invoiceRes.rows[0].i_order_id, accountId]
            );

            if (memberRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้ จึงเปลี่ยนสถานะการชำระไม่ได้",
                };
            }

            await conn.query(
                `
                    UPDATE invoice
                    SET i_payment_status_id = $1,
                            i_paid_at = CASE WHEN $1 = 2 THEN CURRENT_TIMESTAMP ELSE NULL END
                    WHERE i_id = $2;
                `,
                [statusId, invoiceId]
            );

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
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
