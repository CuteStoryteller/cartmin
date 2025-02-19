/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

const is = require('./is.js');

/**
 * Get (index + 1)-th upload button on a product page (tabName) tab.
 * 
 * @private
 * @param {string} tabName 
 * @param {number} index 
 * @returns {Promise<ElementHandle>} puppeteer ElementHandle of the button.
 */
async function getProductPageUploadBtn(tabName, index) {
    await this.navToProductPageTab(tabName);

    const tabSelectors = this.productPageSelectors[tabName];

    switch (tabName) {
        case 'data':
            return await this.page.$(tabSelectors.uploadBtn);
        case 'image':
            await this.page.waitForFunction((selector, index) => {
                return document.querySelectorAll(selector)?.[index];
            }, {}, tabSelectors.uploadBtns, index);

            const uploadBtns = await this.page.$$(tabSelectors.uploadBtns);
            return uploadBtns[index];
    }
}

/**
 * Fill a product description.
 * 
 * To delete current description use:
 * - with description="" and overrideDescription=true or
 * - deleteProductDescription instead for explicit handling.
 * 
 * @param {string} description
 * @returns {Promise<boolean>} was the description overridden?
 */
async function fillProductDescription(description) {
    is.invalidType('description', 'string', description);

    if (!description) {
        if (this.productPageOptions.autoDeleteDescription) {
            await this.deleteProductDescription();
            return true;
        }
        return false;
    }

    await this.navToProductPageTab('general');

    const { editor, editorTextArea } = this.productPageSelectors.general;
    const editorElement = await this.page.waitForSelector(editor);
    const editorFrame = await editorElement.contentFrame();
    const oldDescription = await editorFrame.$eval(editorTextArea, el => el.textContent);
    const hasDescription = oldDescription.trim();

    if (!this.productPageOptions.overwriteDescription && hasDescription) return false;

    await editorFrame.$eval(editorTextArea, el => el.textContent = '');
    await editorFrame.type(editorTextArea, description);

    return true;
}

/**
 * @returns {Promise<void>}
 */
async function deleteProductDescription() {
    await this.navToProductPageTab('general');

    const { editor, editorTextArea } = this.productPageSelectors.general;
    const editorElement = await this.page.waitForSelector(editor);
    const editorFrame = await editorElement.contentFrame();

    await editorFrame.$eval(editorTextArea, el => el.textContent = '');
}

/**
 * Upload a main product image.
 * 
 * To delete a current main image use
 * - with imgName="" and overrideMainImage=true or
 * - deleteMainProductImage instead for explicit handling.
 * 
 * @param {string} imgName - name.format (just name is not recommended). If this parameter is a path,
 * then it will be converted to name.format.
 * @param {Array<string>} [dirPath] - directory path. Used to nav in a file manager before a file selection.
 * @param {string} this.config.placeholderImage
 * @returns {Promise<boolean>} was the upload successful?
 */
async function uploadMainProductImage(imgName, dirPath) {
    is.invalidType('imgName', 'string', imgName);

    if (!imgName) {
        if (this.productPageOptions.autoDeleteMainImage) {
            await this.deleteMainProductImage();
            return true;
        }
        return false;
    }

    await this.navToProductPageTab('data');

    const mainImageSelector = this.productPageSelectors.data.image;

    const hasMainImage = await this.page.$eval(mainImageSelector,
        (el, placeholder) => el.getAttribute('src') !== placeholder,
        this.config.placeholderImage);

    if (!this.productPageOptions.overwriteMainImage && hasMainImage) return false;

    await this.openFileManager('data', 0);
    if (dirPath) await this.navInFileManager(dirPath);
    return await this.uploadFileToPage(imgName);
}

/**
 * @returns {Promise<void>}
 */
async function deleteMainProductImage() {
    await this.navToProductPageTab('data');

    const dataSelectors = this.productPageSelectors.data;
    const deleteBtn = await this.page.$(dataSelectors.deleteBtn);
    await deleteBtn.click();

    await this.page.waitForFunction((selector, placeholder) => {
        const img = document.querySelector(selector);
        return img.getAttribute('src') === placeholder;
    }, {}, dataSelectors.image, this.config.placeholderImage);
}

/**
 * Upload secondary product images.
 * 
 * To delete all secondary image use:
 * - with imgName="" and overrideSecondaryImages=true or
 * - deleteSecondaryProductImages instead for explicit handling.
 * 
 * @param {Array<string>} imgNames - name.format (just name is not recommended). If this parameter is a path,
 * then it will be converted to name.format.
 * @param {Array<string>} [dirPath] - directory path. Used to nav in a file manager before a file selection.
 * @param {string} this.config.placeholderImage
 * @returns {Promise<Array<boolean>>}
 */
async function uploadSecondaryProductImages(imgNames, dirPath) {
    is.invalidType('imgNames', 'array', imgNames);

    if (!imgNames.length) {
        if (this.productPageOptions.autoDeleteSecondaryImages) {
            await this.deleteSecondaryProductImages();
            return true;
        }
        return false;
    }

    await this.navToProductPageTab('image');

    const tabSelector = this.productPageSelectors.image;
    const hasImage = await this.page.$$eval(tabSelector.images,
        (els, placeholder) => Array.from(els).find(img => img.getAttribute('src') !== placeholder),
        this.config.placeholderImage);

    if (!this.productPageOptions.overwriteSecondaryImages && hasImage) return false;
    
    await this.deleteSecondaryProductImages();

    const uploaded = Array(imgNames.length).fill(false);
    const addBtn = await this.page.$(tabSelector.addBtn);
    
    for (let i = 0; i < imgNames.length; i++) {
        is.invalidType(`imgNames[${i}]`, 'string', imgNames[i]);

        await addBtn.click();

        await this.openFileManager('image', i);
        if (dirPath && i === 0) await this.navInFileManager(dirPath);
        uploaded[i] = await this.uploadFileToPage(imgNames[i]);
    }

    return uploaded;
}

/**
 * @returns {Promise<void>}
 */
async function deleteSecondaryProductImages() {
    await this.navToProductPageTab('image');

    const deleteBtnsSelector = this.productPageSelectors.image.deleteBtns;
    let deleteBtn = await this.page.$(deleteBtnsSelector);

    while (deleteBtn) {
        try {
            await Promise.all([
                this.page.waitForFunction(() => true, { polling: 'mutation' }),
                deleteBtn.click()
            ]);
        } catch (e) {
            if (e.message !== 'Node is either not clickable or not an Element') {
                throw e;
            }
        }

        deleteBtn = await this.page.$(deleteBtnsSelector);
    }
}

/**
 * Save changes made to a product page and nav to the catalog page.
 * 
 * @returns {Promise<void>}
 */
async function saveProductPageChanges() {
    this.isInvalidPage('product');
    
    const saveBtn = await this.page.$(this.productPageSelectors.saveBtn);

    const [response] = await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        saveBtn.click()
    ]);

    if (!response?.ok()) {
        throw new Error(`Cannot nav to the catalog page after saving changes`);
    }
}

/**
 * Fill a product page with description and images.
 * 
 * @param {string} id - product ID.
 * @param {string} description - new product description.
 * @param {Array<string>} imagePaths - new product images. The first successfully uploaded one will be used as the main. 
 * @param {Array<string>} [dirPath] - directory path. If not present, all product images will be uploaded in the top directory.
 */
async function fillProductPage(id, description, imagePaths, dirPath) {
    await this.navToProductPage(id);
    
    await this.fillProductDescription(description);
    
    await this.openFileManager();
    await this.navInFileManager(dirPath);
    const uploaded = await this.uploadFilesToFileManager(imagePaths);
    
    await this.closeFileManager();
    
    await this.uploadMainProductImage(uploaded?.[0] || '');
    uploaded.shift();
    await this.uploadSecondaryProductImages(uploaded);

    await this.saveProductPageChanges();
}

module.exports = function (Cartmin) {
    Object.assign(Cartmin.prototype, {
        fillProductDescription,
        deleteProductDescription,
        uploadMainProductImage,
        deleteMainProductImage,
        uploadSecondaryProductImages,
        deleteSecondaryProductImages,
        saveProductPageChanges,
        fillProductPage,
        //private
        getProductPageUploadBtn
    });
};