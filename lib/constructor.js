/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

const puppeteer = require('puppeteer');
const _ = require('lodash');
const { getBaseUrl, extractToken, tokenizeUrl } = require('./url.js');
const is = require('./is.js');
const v_config = require('./version-config.json');

const PUPPETEER_OPTIONS = {
    headless: true,
    defaultViewport: null,
    args: [ '--disable-gpu', '--ignore-certificate-errors' ]
};

// For singleton pattern
let instance = null;

// OpenCart admin
class Cartmin {
    /**
     * @constructs Cartmin
     * 
     * @param {Object} config - configuration object for an OpenCart-based website.
     * @param {string} config.baseUrl - base URL of the website. If this parameter is not a base URL, it will be converted to such.
     * @param {Object} config.credentials - admin credentials.
     * @param {string} config.credentials.username
     * @param {string} config.credentials.password
     * @param {Object} config.fileManagerOptions - options for an interaction with a file manager.
     * @param {string} config.fileManagerOptions.successMsg - message of a browser dialog when file upload is successful.
     * @param {Object} [config.productPageOptions] - options for the interaction with a product page.
     * @param {boolean} [config.productPageOptions.overwriteDescription=false] - set this to true to overwrite an old description if it exists.
     * @param {boolean} [config.productPageOptions.autoDeleteDescription=false] - set this to true to delete an old description when a new one does not exist.
     * @param {boolean} [config.productPageOptions.overwriteMainImage=false] - set this to true to overwrite an old main image if it exists.
     * @param {boolean} [config.productPageOptions.autoDeleteMainImage=false] - set this to true to delete an old main image when a new one does not exist.
     * @param {boolean} [config.productPageOptions.overwriteSecondaryImages=false] - set this to true to overwrite old secondary images if they exist.
     * @param {boolean} [config.productPageOptions.autoDeleteSecondaryImages=false] - set this to true to delete old secondary images when new ones do not exist.
     * @param {string} [config.placeholderImage] - URL of the placeholder image.
     * @param {string} [version] - OpenCart version supported by Cartmin (see version-config.json).
     * @returns {Cartmin}
     */
    constructor(config, version = '1.5') {
        if (instance) return instance;

        is.invalidType('config', 'object', config);
        is.invalidType('config.baseUrl', 'string', config.baseUrl);
        is.invalidType('config.credentials', 'object', config.credentials);
        is.invalidType('config.credentials.username', 'string', config.credentials.username);
        is.invalidType('config.credentials.password', 'string', config.credentials.password);
        is.invalidType('config.fileManagerOptions', 'object', config.fileManagerOptions);
        is.invalidType('config.fileManagerOptions.successMsg', 'string', config.fileManagerOptions.successMsg);
        is.invalidType('config.productPageOptions', 'object', config.productPageOptions, true);
        is.invalidType('config.productPageOptions.overwriteDescription', 'boolean', config.productPageOptions?.overwriteDescription, true);
        is.invalidType('config.productPageOptions.autoDeleteDescription', 'boolean', config.productPageOptions?.autoDeleteDescription, true);
        is.invalidType('config.productPageOptions.overwriteMainImage', 'boolean', config.productPageOptions?.overwriteMainImage, true);
        is.invalidType('config.productPageOptions.autoDeleteMainImage', 'boolean', config.productPageOptions?.autoDeleteMainImage, true);
        is.invalidType('config.productPageOptions.overwriteSecondaryImages', 'boolean', config.productPageOptions?.overwriteSecondaryImages, true);
        is.invalidType('config.productPageOptions.autoDeleteSecondaryImages', 'boolean', config.productPageOptions?.autoDeleteSecondaryImages, true);
        is.invalidType('config.placeholderImage', 'string', config.placeholderImage, true);
        is.invalidType('version', 'string', version);

        if (!Object.keys(v_config).includes(version)) {
            throw new Error(`OpenCart version ${version} is not supported`);
        }

        this.version = version;
        this.config = {
            productPageOptions: {
                overwriteDescription: false,
                autoDeleteDescription: false,
                overwriteMainImage: false,
                autoDeleteMainImage: false,
                overwriteSecondaryImages: false,
                autoDeleteSecondaryImages: false
            },
            placeholderImage: '',
        };

        this.browser = null; // Current puppeteer Browser
        this.page = null; // Current puppeteer Page
        this.token = ''; // Admin session token

        this.fileManagerFrame = null; // Puppeteer Frame of a file manager
        this.blockRepetitiveXhr = false; // Block allowed POST XHR by a file manager if it was submitted the last time.
        this.lastXhrPostData = null; // Data of the last POST XHR by a file manager
        this.allowedXhrPostData = null; // Among POST XHR by a file manager, only those with such data are allowed
        this.curDirFiles = null; // List of current directory file names
        this.curDirPath = '';
        
        _.merge(this.config, config, v_config[version]);

        // Validate base URL
        this.config.baseUrl = getBaseUrl(this.config.baseUrl);

        // Compose URLs to important pages. After logging in as admin some of these URLs will be tokenized.
        this.config.urls = {};
        this.config.urls.admin = new URL('admin/', this.config.baseUrl).toString();
        for (const [pageName, pagePath] of Object.entries(this.config.paths)) {
            this.config.urls[pageName] = new URL(pagePath, this.config.urls.admin).toString();
        }

        // Shortcuts for object values of config
        for (const [key, value] of Object.entries(this.config)) {
            if (is.object(value) && key !== 'config') this[key] = value;
        }

        instance = this;

        return this;
    }

    /**
     * Launch a browser and open a new page.
     * Only one instance of the browser can be launched.
     * 
     * @param {Object} [options] - puppeteer LaunchOptions.
     * @returns {Promise<void>}
     */
    async launch(options = {}) {
        if (this.browser) return;
        
        this.browser = await puppeteer.launch(Object.assign(PUPPETEER_OPTIONS, options));
        const pages = await this.browser.pages();
        this.page = pages[0];
        this.page.setBypassCSP(true);

        await this.page.setRequestInterception(true);

        this.page.on('request', req => {
            if (req.resourceType() === 'xhr' &&
                req.url().includes(this.paths.fileManagerFiles) &&
                req.method() === 'POST')
            {
                if (req.postData() !== this.allowedXhrPostData) {
                    req.respond({});
                    return;
                }

                const lastPostData = this.lastXhrPostData;
                this.lastXhrPostData = this.allowedXhrPostData;

                if (this.blockRepetitiveXhr && req.postData() === lastPostData) {
                    req.respond({});
                    return;
                }
            }

            if (['image', 'stylesheet'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
    }

    /**
     * Launch a browser and login to an admin page.
     * 
     * @param {string} [pageName='admin'] - page to start with.
     * @param {Object} [options] - puppeteer LaunchOptions.
     * @returns {Promise<void>}
     */
    async start(pageName = 'admin', options) {
        await this.launch(options);
        await this.navTo(pageName, true);
        await this.login();
    }

    /**
     * @private
     * @param {string | null} allowed
     * @param {boolean} [block=true]
     * @returns {void}
     */
    allowXhr(allowed, block = true) {
        this.lastXhrPostData = null;
        this.allowedXhrPostData = allowed;
        this.blockRepetitiveXhr = block;
    }

    /**
     * @private
     * @param {boolean} [block=true]
     * @returns {void}
     */
    blockRepXhr(block = true) {
        this.lastXhrPostData = null;
        this.blockRepetitiveXhr = block;
    }

    /**
     * Close a browser.
     * 
     * @returns {Promise<void>}
     */
    async close() {
        if (!this.browser) return;

        await this.browser.close();

        this.browser = null;
        this.page = null;
        this.token = '';
        this.tokenize();

        this.fileManagerFrame = null;
        this.blockRepetitiveXhr = false;
        this.lastXhrPostData = null;
        this.allowedXhrPostData = null;
        this.curDirFiles = null;
    }

    /**
     * Is the current page a specific one?
     * 
     * @param {string} pageName
     * @returns {boolean}
     */
    isPage(pageName) {
        is.invalidType('pageName', 'string', pageName);

        if (!this.urls[pageName]) {
            throw new Error(`Interaction with a ${pageName} page is not supported by the current version of Cartmin`);
        }

        return this.page.url().startsWith(this.urls[pageName]);
    }

    /**
     * Throw an Error if the current page is not a specific one.
     * 
     * @private
     * @param {string} pageName
     * @returns {void}
     */
    isInvalidPage(pageName) {
        if (!this.isPage(pageName)) {
            throw new Error(`Current page is not a ${pageName} page`);
        }
    }

    /**
     * Is a specific tab of a product page selected?
     * 
     * Current page must be a product one.
     * 
     * @param {string} tabName
     * @returns {Promise<boolean>}
     */
    async isProductPageTab(tabName) {
        is.invalidType('tabName', 'string', tabName);

        this.isInvalidPage('product');
        
        const tabSelector = this.productPageSelectors.tabs[tabName];

        if (!tabSelector) {
            throw new Error(`Interaction with a ${tabName} tab is not supported by the current version of Cartmin`);
        }

        return await this.page.$eval(tabSelector, el => el.className.includes('selected')); //! wait
    }

    /**
     * Tokenize specific URLs of Cartmin.
     * 
     * @private
     * @returns {void}
     */
    tokenize() {
        this.urls.dashboard = tokenizeUrl(this.urls.dashboard, this.token);
        this.urls.catalog = tokenizeUrl(this.urls.catalog, this.token);
    }

    /**
     * Login as admin.
     * 
     * Current page must be an admin one.
     * 
     * @returns {Promise<void>}
     */
    async login() {
        this.isInvalidPage('admin');

        await this.page.evaluate((selectors, credentials) => {
            const username = document.querySelector(selectors.username);
            const password = document.querySelector(selectors.password);
            username.value = credentials.username;
            password.value = credentials.password;
        }, this.loginSelectors, this.credentials);

        const [response] = await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            this.page.click(this.loginSelectors.btn)
        ]);

        if (!response?.ok()) {
            throw new Error(`Cannot navigate to an admin page`);
        }

        this.token = extractToken(response.url());
        this.tokenize();
    }
}

module.exports = Cartmin;