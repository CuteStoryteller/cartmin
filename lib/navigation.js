/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

const is = require('./is.js');

/**
 * nav to a page supported by Cartmin.
 * When navigating to the current page, nothing happens.
 * 
 * Do not use if pageName is "product". Use "navToProductPage" instead.
 * 
 * @param {string} pageName
 * @returns {Promise<void>}
 */
async function navTo(pageName) {
    if (pageName === 'product') {
        throw new Error('"navTo" cannot be used for a navigation to product pages. Use "navToProductPage" instead');
    }
    
    if (this.isPage(pageName)) return;
    
    await this.page.goto(this.urls[pageName], { waitUntil: 'domcontentloaded' });
}

/**
 * Puppeteer page function for "extractProductPageUrl".
 * 
 * @private
 * @param {string} id - product ID.
 * @param {Object} selectors - catalog selectors. 
 * @param {string} selectors.tableRows - rows of the catalog table.
 * @param {string} selectors.modelCell - cell of the table with the model info (ID).
 * @param {string} selectors.linkCell - cell of the table with a link to a product page.
 * @returns {string | null}
 */
function extractProductPageUrlFromDOM(id, selectors) {
    const tableRows = document.querySelectorAll(selectors.tableRows);

    for (const row of tableRows) {
        const modelCell = row.querySelector(selectors.modelCell);

        if (modelCell?.textContent.trim() === id) {
            const linkCell = row.querySelector(selectors.linkCell);
            const aTag = linkCell.querySelector('a');
            return aTag ? aTag.getAttribute('href') : null;
        }
    }
}

/**
 * Exctract a product page URL from the catalog.
 * 
 * @private
 * @param {string} id - product ID.
 * @returns {Promise<string>}
 */
async function extractProductPageUrl(id) {
    is.invalidType('id', 'string', id);

    this.isInvalidPage('catalog');

    await this.page.$eval(this.catalogSelectors.inputModel, (input, id) => {
        input.value = id;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }, id);
    
    await this.page.waitForFunction(extractProductPageUrlFromDOM, {}, id, this.catalogSelectors);
    return await this.page.evaluate(extractProductPageUrlFromDOM, id, this.catalogSelectors);
}

/**
 * nav to a product page by a product ID.
 * 
 * @param {string} id - product ID.
 * @returns {Promise<void>}
 */
async function navToProductPage(id) {
    await this.navTo('catalog');
    const productPageUrl = await this.extractProductPageUrl(id);
    await this.page.goto(productPageUrl, { waitUntil: 'domcontentloaded' });
}

/**
 * nav to a tab of a product page.
 * When navigating to the current tab, nothing happens.
 * 
 * Current page must be a product one.
 * 
 * @param {string} tabName - product page tab name.
 * @returns {Promise<void>}
 */
async function navToProductPageTab(tabName) {
    if (await this.isProductPageTab(tabName)) return;

    const tabBtn = await this.page.$(this.productPageSelectors.tabs[tabName]);

    await Promise.all([
        this.page.waitForFunction(() => true, { polling: 'mutation' }),
        tabBtn.click()
    ]);
}

module.exports = function (Cartmin) {
    Object.assign(Cartmin.prototype, {
        navTo,
        navToProductPage,
        navToProductPageTab,
        // private
        extractProductPageUrl
    });
};