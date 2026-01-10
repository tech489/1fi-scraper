import puppeteer from 'puppeteer';
import "dotenv/config";
import { db, users, orders } from "@1fi-finance/database";
import { sql, eq } from "drizzle-orm";
import fs from 'fs';

// ==================== DB SYNC UTILITIES ====================

const normalizePhone = (phone) => {
    if (!phone) return null;
    let str = String(phone).trim();
    const digits = str.replace(/\D/g, "");
    if (digits.length > 10) return digits.slice(-10);
    if (digits.length === 10) return digits;
    return null;
};

async function syncToDatabase(firstTableData, secondTableData) {
    console.log("\n========== Starting DB Sync ==========");

    const updates = new Map(); // Phone -> Status

    // Table 1 (Array of Arrays) - loan_initiated
    const firstRows = firstTableData.rows || [];
    for (const row of firstRows) {
        if (Array.isArray(row)) {
            for (const cell of row) {
                const ph = normalizePhone(cell);
                if (ph) {
                    updates.set(ph, "loan_initiated");
                    break;
                }
            }
        }
    }

    // Table 2 (Array of Objects) - loan_confirmed (Higher Priority)
    const secondRows = secondTableData.rows || [];
    for (const row of secondRows) {
        if (typeof row === 'object') {
            const values = Object.values(row);
            for (const val of values) {
                const ph = normalizePhone(val);
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

            // Find their most recent order
            const userOrders = await db.select()
                .from(orders)
                .where(eq(orders.userId, user.id))
                .orderBy(sql`${orders.id} DESC`)
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

    console.log("========== Sync Complete ==========\n");
}

// ==================== MAIN SCRAPER ====================

async function main() {
    console.log('Launching browser...');

    // 1. Launch browser (headless for server/cron)
    const browser = await puppeteer.launch({
        headless: process.env.HEADLESS !== 'false',
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        // 2. Navigate to signup page
        console.log('Navigating to VoltMoney partner signup...');
        await page.goto('https://voltmoney.in/partner/signup', {
            waitUntil: 'networkidle2'
        });

        // 3. Enter mobile number using XPath
        console.log('Entering mobile number...');
        const mobileInput = await page.waitForSelector('#mobile');
        await mobileInput.type(process.env.VOLT_MOBILE || '9953972289');

        const loginUsingPassword = await page.waitForSelector('.button-module__x0Fa7W__buttonOutlineTransparentLarge');
        await loginUsingPassword.click();

        // Wait for password field to appear after clicking
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. Enter password
        console.log('Entering password...');
        const passwordInput = await page.waitForSelector('#password', { visible: true, timeout: 10000 });
        await passwordInput.type(process.env.VOLT_PASSWORD || 'Sagar2003@');

        // 5. Click login button
        console.log('Clicking login button...');
        const loginButton = await page.waitForSelector(
            '.button-module__x0Fa7W__buttonPrimaryLarge'
        );
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { }),
            loginButton.click()
        ]);

        // 6. Optional: Close Banner/Ad if it appears
        console.log('Checking for banners...');
        try {
            const closeAdSelector = 'div[class*="BannerModal-module"] button, div[class*="BannerModal-module"] [class*="closeButton"]';
            const closeAd = await page.waitForSelector(closeAdSelector, { visible: true, timeout: 5000 });
            if (closeAd) {
                console.log('Banner found, closing...');
                await closeAd.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (e) {
            console.log('No banner appeared (or selector changed). Continuing...');
        }

        // 7. Click navigation element (usually "Leads" or similar)
        console.log('Clicking navigation element...');
        const navElement = await page.waitForSelector(
            '.partner_dash-module__4U8UXq__nav > div:nth-child(2) > a:nth-child(1)'
        );
        await navElement.click();

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 8. Scrape first table info
        console.log('Scraping first table...');
        const firstTableData = await page.evaluate(() => {
            const tableContainer = document.evaluate(
                '/html/body/div[2]/div[3]/div/div/div/div[2]/div/div/div[1]/div/div/div/div/div',
                document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue;

            if (!tableContainer) return { error: 'First table container not found', rows: [] };

            // Get all text content and structure
            const rows = tableContainer.querySelectorAll('tr');
            const data = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                const rowData = [];
                cells.forEach(cell => rowData.push(cell.textContent.trim()));
                if (rowData.length > 0) data.push(rowData);
            });

            return { rows: data, rawText: tableContainer.innerText };
        });
        console.log('First table data:', JSON.stringify(firstTableData, null, 2));

        // 9. Click on the second navigation element
        console.log('Clicking second navigation element...');
        const secondNavElement = await page.waitForSelector(
            '.partner_dash-module__4U8UXq__nav > div:nth-child(4) > a:nth-child(1)'
        );
        await secondNavElement.click();

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 10. Scrape second table info
        console.log('Scraping second table...');
        const secondTableData = await page.evaluate(() => {
            const table = document.evaluate(
                '/html/body/div[2]/div[3]/div/div/div/div[2]/div/div/div[1]/div/div/div/div/div/div/table',
                document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue;

            if (!table) return { error: 'Second table not found', rows: [] };

            // Get headers
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => headers.push(th.textContent.trim()));

            // Get rows
            const rows = [];
            table.querySelectorAll('tbody tr').forEach(row => {
                const rowData = {};
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                    rowData[headers[index] || `col_${index}`] = cell.textContent.trim();
                });
                if (Object.keys(rowData).length > 0) rows.push(rowData);
            });

            return { headers, rows, rawHTML: table.outerHTML };
        });
        console.log('Second table data:', JSON.stringify(secondTableData, null, 2));

        // Save scraped data to files (for debugging/backup)
        fs.writeFileSync('first_table_data.json', JSON.stringify(firstTableData, null, 2));
        fs.writeFileSync('second_table_data.json', JSON.stringify(secondTableData, null, 2));
        console.log('Data saved to first_table_data.json and second_table_data.json');

        // Directly sync to database (no subprocess needed)
        await syncToDatabase(firstTableData, secondTableData);

        console.log('Automation completed successfully!');

    } catch (error) {
        console.error('Error during automation:', error.message);
    }

    // Close browser
    await browser.close();
}

main().catch(console.error);
