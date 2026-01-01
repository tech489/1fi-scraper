import puppeteer from 'puppeteer';

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
        const mobileInput = await page.waitForSelector('::-p-xpath(//*[@id="mobile"])');
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
        await loginButton.click();

        const closeAd = await page.waitForSelector('#main_container_body > div > div.BannerModal-module__oBbfxG__overlay > div > div.BannerModal-module__oBbfxG__closeButton');
        await closeAd.click();

        // 7. Click navigation element
        console.log('Clicking navigation element...');
        const navElement = await page.waitForSelector(
            '::-p-xpath(/html/body/div[2]/div[3]/div/aside/nav/div[2])'
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

            if (!tableContainer) return { error: 'First table container not found' };

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
            '::-p-xpath(/html/body/div[2]/div[3]/div/aside/nav/div[4]/a)'
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

            if (!table) return { error: 'Second table not found' };

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

        // Save scraped data to files
        const fs = await import('fs');
        fs.writeFileSync('first_table_data.json', JSON.stringify(firstTableData, null, 2));
        fs.writeFileSync('second_table_data.json', JSON.stringify(secondTableData, null, 2));
        console.log('Data saved to first_table_data.json and second_table_data.json');

        console.log('Automation completed successfully!');

    } catch (error) {
        console.error('Error during automation:', error.message);
    }

    // Keep browser open for observation
    // Uncomment the line below to close browser automatically
    await browser.close();
}

main().catch(console.error);
