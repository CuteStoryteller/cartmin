/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

const is = require('./is.js');

/**
 * @param {string} url
 * @returns {string}
 */
function getBaseUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return `${parsedUrl.protocol}//${parsedUrl.host}`;
    } catch (e) {
        throw new Error(`${url} is not a valid URL`);
    }
}

/**
 * Exctract a token from a URL of any admin page.
 * 
 * @param {string} url
 * @returns {string}
 */
function extractToken(url) {
    is.invalidType('url', 'string', url);

    const tokenStr = url.match(/token=\w*/)[0];
    return tokenStr.replace('token=', '');
}

/**
 * Add a token to an admin page url.
 * 
 * If the URL is already tokenized, then it will be overridden.
 * 
 * @param {string} url
 * @param {string} token
 * @returns {string}
 */
function tokenizeUrl(url, token) {
    is.invalidType('url', 'string', url);
    is.invalidType('token', 'string', token);

    const clearedUrl = url.replace(/&token=\w*$/, '');
    return clearedUrl + '&token=' + token;
}

module.exports = {
    getBaseUrl,
    extractToken,
    tokenizeUrl
};