/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

const fs = require('fs');
const is = require('./is.js');

/**
 * Open a file manager.
 * 
 * File manager is opened by clicking an (index + 1)-th upload button on a product page (tabName) tab.
 * 
 * @param {string} [tabName='data']
 * @param {number} [index=0]
 * @returns {Promise<void>}
 */
async function openFileManager(tabName = 'data', index = 0) {
    is.invalidType('index', 'number', index);

    if (this.fileManagerFrame) return;

    const uploadBtn = await this.getProductPageUploadBtn(tabName, index);
    await uploadBtn.click();

    const frame = await this.page.waitForSelector(this.fileManagerSelectors.frame);
    this.fileManagerFrame = await frame.contentFrame();
}

/**
 * @returns {Promise<void>}
 */
async function closeFileManager() {
    if (!this.fileManagerFrame) return;

    const closeBtn = await this.page.waitForSelector(this.fileManagerSelectors.closeBtn);
    await closeBtn.click();

    this.fileManagerFrame = null;
}

/**
 * @private
 * @param {string} [path] - directory path (value of "directory" attribute). Top directory is default.
 * @returns {string}
 */
function getDirSelector(path) {
    return path ? `[directory="${path}"]` : `[directory]`;
}

/**
 * @private
 * @returns {Promise<boolean>}
 */
function isClickedPromise(selector) {
    return this.fileManagerFrame.$eval(selector, async main => {
        return await new Promise(resolve => {
            const listener = () => { resolve(true) };
            main.addEventListener('click', listener, { once: true });

            setTimeout(() => {
                main.removeEventListener('click', listener);
                resolve(false);
            }, 50);
        });
    }, selector);
}

/**
 * @param {string} [path=''] - directory path (value of "directory" attribute). Top directory is default.
 * @param {number} clickCount
 * @returns {Promise<void>}
 */
async function clickDir(path = '', clickCount = 1) {
    is.invalidType('path', 'string', path);

    const selector = getDirSelector(path);

    if (!path) {
        await this.fileManagerFrame.click(selector, { count: clickCount });
        return;
    }

    await this.fileManagerFrame.evaluate(selector => {
        const main = document.querySelector(selector);
        const others = main.parentElement.querySelectorAll(`:scope > :not(${selector})`);
        Array.from(others).map(el => el.style.display = 'none');
        main.style.display = 'block';
    }, selector);

    let isClicked;
    do {
        [isClicked] = await Promise.all([
            this.isClickedPromise(selector),
            this.fileManagerFrame.click(selector, { count: clickCount })
        ]);
    } while (!isClicked);
}

/**
 * Close a directory.
 * If it is already open or a leaf of dir tree, then nothing happens.
 * 
 * @param {string} [path=''] - directory path (value of "directory" attribute). Top directory is default.
 * @returns {Promise<void>}
 */
async function closeDir(path = '') {
    is.invalidType('path', 'string', path);

    await this.fileManagerFrame.$eval(getDirSelector(path), el => {
        el.className = el.className.replace('open', 'closed');
    });
}

/**
 * @private
 * @param {string} [path] - directory path (value of "directory" attribute). Top directory is default.
 * @returns {Promise<void>}
 */
function getDirFilesPromise(path, timeout = 30000) {
    /*  XHR slows down navigation by loading files in the right column after each directory click.
        The latter is necessary only for the last click in the sequence, so XHR is blocked until this moment.

        PS. After clicking the last directory OpenCart might additionally send several same requests for its files
        or even requests for files of intermediate directories. So, two same consecutive requests by a file manager
        are not allowed (see fileManagerLastXhrPostData) as well as requests for files of intermediate directories
        (see fileManagerAllowXhrPostData).
    */
    this.allowXhr('directory=' + path.replace('/', '%2F'), true);

    return new Promise(async (resolve, reject) => {
        let timerId;

        const handleResponse = async res => {
            const req = res.request();

            if (req.resourceType() === 'xhr' &&
                req.url().includes(this.paths.fileManagerFiles) &&
                req.method() === 'POST' &&
                req.postData() === this.allowedXhrPostData)
            {
                const str = await res.text();
                if (str === '') return;

                clearTimeout(timerId);
                this.page.off('response', handleResponse);
                this.blockRepXhr(false);
                resolve(JSON.parse(str).map(obj => obj.filename));
            }
        };

        timerId = setTimeout(() => {
            this.page.off('response', handleResponse);
            reject(`Timeout ${timeout} ms is exceeded.`);
        }, timeout);

        this.page.on('response', handleResponse);
    });
}

/**
 * Navigate to a directory.
 * 
 * @param {string} path - directory path (value of "directory" attribute). Set this to "" to nav to the top dir.
 * @returns {Promise<void>}
 */
async function navInFileManager(path) {
    is.invalidType('path', 'string', path);

    if (!this.fileManagerFrame) {
        throw new Error('file manager is closed');
    }
    if (this.curDirPath === path) return;

    this.allowXhr(null);
    
    await this.destroyNav(path);

    const paths = [];
    while (path !== this.curDirPath) {
        paths.unshift(path);
        path = path.substring(0, path.lastIndexOf('/'));
    }
    paths.unshift(this.curDirPath);
    const lastDirPath = paths.pop();

    for (const path of paths) {
        await this.fileManagerFrame.waitForSelector(getDirSelector(path));
        await this.clickDir(path, 2);
        this.curDirPath = path;
    }

    await this.fileManagerFrame.waitForSelector(getDirSelector(lastDirPath));

    const clickCount = lastDirPath === "" ? 2 : 1;
    [this.curDirFiles] = await Promise.all([
        this.getDirFilesPromise(lastDirPath),
        this.clickDir(lastDirPath, clickCount)
    ]);
    this.curDirPath = lastDirPath;
}

/**
 * Close a sequence of currently opened directories.
 * 
 * @param {string} [path=''] - path to the directory for the next navigation. If provided, 
 * @returns {Promise<void>}
 */
async function destroyNav(path = '') {
    is.invalidType('path', 'string', path);
    
    do {
        if (this.curDirPath.includes(path)) break;
        path = path.substring(0, path.lastIndexOf('/'));
    } while (path);

    await this.fileManagerFrame.waitForSelector(getDirSelector(this.curDirPath), { visible: true });
    
    while (this.curDirPath !== path) {
        await this.closeDir(this.curDirPath);
        this.curDirPath = this.curDirPath.substring(0, this.curDirPath.lastIndexOf('/'));
    }

    await this.closeDir(path);
    this.curDirPath = path;
}

/**
 * Promise to close a browser dialog that pops up on a file upload.
 * 
 * @private
 * @returns {Promise<boolean>} indicator of success
 */
function closeBrowserDialogPromise(timeout = 30000) {
    return new Promise((resolve, reject) => {
        let timerId;

        const acceptDialog = async (dialog) => {
            clearTimeout(timerId);
            await dialog.accept();
            resolve(dialog.message().includes(this.fileManagerOptions.successMsg));
        };

        timerId = setTimeout(() => {
            this.page.off('dialog', acceptDialog);
            reject(`Timeout ${timeout} ms is exceeded.`);
        }, timeout);

        this.page.once('dialog', acceptDialog);
    });
}

/**
 * @param {Array<string>} paths
 * @returns {Promise<Array<string>>} paths of successfully uploaded files
 */
async function uploadFilesToFileManager(paths) {
    is.invalidType('paths', 'array', paths);

    if (!this.fileManagerFrame) {
        throw new Error('file manager is closed');
    }
    
    const uploadBtn = await this.fileManagerFrame.waitForSelector(this.fileManagerSelectors.uploadBtn);

    const uploaded = [];
    
    for (const path of paths) {
        if (!is.string(path) || !fs.existsSync(path)) continue;
        
        const [fileChooser] = await Promise.all([
            this.page.waitForFileChooser(),
            uploadBtn.click()
        ]);

        const [isUploaded] = await Promise.all([
            this.closeBrowserDialogPromise(),
            fileChooser.accept([path])
        ]);

        if (isUploaded) uploaded.push(path);
    }

    return uploaded;
}

/**
 * Puppeteer page function for "getFileIndexInFileManager" to get (index + 1) of a file.
 * 
 * (+1) to return a truthy value if the file is found.
 * 
 * @private
 * @param {string} listSelector
 * @param {string} fileName - name.format (just name is not recommended).
 * @returns {number}
*/
function getFileIndexInFileManagerDOM(listSelector, fileName) {
    const list = document.querySelectorAll(listSelector);

    for (let i = 0; i < list.length; i++) {
        const text = list[i].textContent.trim();

        if (text.startsWith(fileName)) return i + 1;
    }

    return 0;
}

/**
 * Get index of a file.
 * 
 * @private
 * @param {string} fileName - name.format (just name is not recommended). If this parameter is a path, then it will be converted
 * to name.format.
 * @returns {Promise<number>}
 */
async function getFileIndexInFileManager(fileName) {
    // Extract name.format or name, if fileName is a path
    const clearedFileName = fileName.match(/(([^\\/\.]+)\.)?([^\\/\.]+)$/)?.[0];
    
    if (!clearedFileName || !this.curDirFiles.find(name => name.startsWith(clearedFileName))) return -1;

    await this.fileManagerFrame.waitForFunction(getFileIndexInFileManagerDOM,
        {}, this.fileManagerSelectors.list, clearedFileName);

    return await this.fileManagerFrame.evaluate(getFileIndexInFileManagerDOM,
        this.fileManagerSelectors.list, clearedFileName) - 1;
}

/**
 * Find a file in a file manager and prepare for the interaction with it.
 * 
 * @private
 * @param {string} fileName - name.format (just name is not recommended). If this parameter is a path, then it will be converted
 * to name.format.
 * @returns {ElementHandle | null} puppeteer ElementHandle of the file.
 */
async function getFileFromFileManager(fileName) {
    is.invalidType('fileName', 'string', fileName);

    if (!this.fileManagerFrame) {
        throw new Error('file manager is closed');
    }

    const index = await this.getFileIndexInFileManager(fileName);

    if (index === -1) return null;
    
    await this.fileManagerFrame.evaluate((selector, index) => {
        const file = document.querySelectorAll(selector)[index];
        file.scrollIntoView({ behavior: 'instant', block: 'center' });
    }, this.fileManagerSelectors.list, index);
    
    const list = await this.fileManagerFrame.$$(this.fileManagerSelectors.list);
    return list[index];
}

/**
 * @param {string} fileName - name.format (just name is not recommended). If this parameter is a path, then it will be converted
 * to name.format.
 * @returns {Promise<boolean>} was the file selected?
 */
async function selectFileInFileManager(fileName) {
    const file = await this.getFileFromFileManager(fileName);

    if (file) await file.click();

    return !!file;
}

/**
 * @param {string} fileName - name.format (just name is not recommended). If this parameter is a path, then it will be converted
 * to name.format.
 * @returns {Promise<boolean>} was the file uploaded?
 */
async function uploadFileToPage(fileName) {
    const file = await this.getFileFromFileManager(fileName);

    if (file) {
        /*  The second click causes a file manager to close.
            This action destroys the context of execution before puppeteer procedure is finished,
            so try/catch are necessary here.
        */
        try {
            await file.click({ clickCount: 2 });
        } catch (e) {}
    
        this.fileManagerFrame = null;
    }

    return !!file;
}

module.exports = function (Cartmin) {
    Object.assign(Cartmin.prototype, {
        openFileManager,
        closeFileManager,
        clickDir,
        closeDir,
        navInFileManager,
        destroyNav,
        uploadFilesToFileManager,
        selectFileInFileManager,
        uploadFileToPage,
        //private
        isClickedPromise,
        getDirFilesPromise,
        closeBrowserDialogPromise,
        getFileIndexInFileManager,
        getFileFromFileManager,
    });
};