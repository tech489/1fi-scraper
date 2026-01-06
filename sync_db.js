
import { db, users, orders } from "@1fi-finance/database";
import { sql, eq, or, like } from "drizzle-orm";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const normalizePhone = (phone) => {
    if (!phone) return null;
    let str = String(phone).trim();
    const digits = str.replace(/\D/g, "");
    if (digits.length > 10) return digits.slice(-10);
    if (digits.length === 10) return digits;
    return null;
};

async function main() {
    console.log("Starting DB Sync...");

    let firstTableData = [];
    let secondTableData = [];

    try {
        if (fs.existsSync("first_table_data.json")) {
            const raw = fs.readFileSync("first_table_data.json", "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed.rows) firstTableData = parsed.rows;
        }

        if (fs.existsSync("second_table_data.json")) {
            const raw = fs.readFileSync("second_table_data.json", "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed.rows) secondTableData = parsed.rows;
        }
    } catch (e) {
        console.error("Error reading JSON files:", e.message);
        return;
    }

    const updates = new Map(); // Phone -> Status

    const findPhone = (val) => normalizePhone(val);

    // Table 1 (Array of Arrays)
    for (const row of firstTableData) {
        if (Array.isArray(row)) {
            for (const cell of row) {
                const ph = findPhone(cell);
                if (ph) {
                    updates.set(ph, "loan_initiated");
                    break;
                }
            }
        }
    }

    // Table 2 (Array of Objects) - Higher Priority
    for (const row of secondTableData) {
        if (typeof row === 'object') {
            const values = Object.values(row);
            for (const val of values) {
                const ph = findPhone(val);
                if (ph) {
                    updates.set(ph, "loan_confirmed");
                    break;
                }
            }
        }
    }

    console.log(`Found ${updates.size} phone numbers to process.`);

    for (const [phone, targetStatus] of updates.entries()) {
        try {
            // Find user by phone (handle optional +91)
            // We use 'like' to match keys ending in the 10 digits
            const matchedUsers = await db.select()
                .from(users)
                .where(sql`${users.phone} LIKE ${'%' + phone}`)
                .limit(1);

            if (matchedUsers.length === 0) {
                console.log(`[SKIP] No user found for phone: ${phone}`);
                continue;
            }

            const user = matchedUsers[0];
            console.log(`[MATCH] User: ${user.name || user.id} (${phone})`);

            // Find their active order(s)
            // We update ANY order that isn't already 'completed' or 'cancelled'? 
            // Or just the most recent? 
            // "update the status in orders table... if the record matches"
            // I'll update the most recent open order to be safe.

            const userOrders = await db.select()
                .from(orders)
                .where(eq(orders.userId, user.id))
                .orderBy(sql`${orders.id} DESC`) // Newest first
                .limit(1);

            if (userOrders.length === 0) {
                console.log(`[SKIP] No orders found for user: ${user.id}`);
                continue;
            }

            const order = userOrders[0];

            if (order.status === targetStatus) {
                console.log(`[OK] Order ${order.orderNumber} already ${targetStatus}`);
                continue;
            }

            // Update Status
            await db.update(orders)
                .set({ status: targetStatus })
                .where(eq(orders.id, order.id));

            console.log(`[UPDATE] Order ${order.orderNumber}: ${order.status} -> ${targetStatus}`);

        } catch (err) {
            console.error(`[ERROR] Processing ${phone}:`, err.message);
        }
    }

    console.log("Sync complete.");
    process.exit(0);
}

main().catch(console.error);
