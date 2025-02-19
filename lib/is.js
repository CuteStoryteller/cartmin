/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

/**
 * Is this value defined?
 * 
 * @param {any} val 
 * @returns {boolean}
 */
function defined(val) {
    return val != undefined;
}

/**
 * Is this value a string?
 * 
 * @param {any} val
 * @returns {boolean}
 */
function string(val) {
    return typeof val === 'string';
}

/**
 * Is this value a number?
 * 
 * @param {any} val
 * @returns {boolean}
 */
function number(val) {
    return typeof val === 'number';
}

/**
 * Is this value an object?
 * 
 * @param {any} val
 * @returns {boolean}
 */
function object(val) {
    return typeof val === 'object' && val !== null;
}

/**
 * Is this value a boolean?
 * 
 * @param {any} val
 * @returns {boolean}
 */
function boolean(val) {
    return typeof val === 'boolean';
}

/**
 * Is this value an array?
 * 
 * @param {any} val
 * @returns {boolean}
 */
function array(val) {
    return Array.isArray(val);
}

/**
 * Is this value a function?
 * 
 * @param {any} val
 * @returns {boolean}
 */
function fn(val) {
    return typeof val == 'function';
}

/**
 * Get the function that checks this type.
 * 
 * @param {string} typeName 
 * @returns {function}
 * @private
 */
function typeChecker(typeName) {
    switch (typeName) {
        case 'string':
            return string;
        case 'number':
            return number;
        case 'object':
            return object;
        case 'boolean':
            return boolean;
        case 'array':
            return array;
        case 'fn':
        case 'function':
            return fn;
    }

    throw new Error(`Type ${typeName} does not exist`);
}

/**
 * Create an Error with a message relating to an invalid type.
 * 
 * @param {string} valName
 * @param {string} typeName
 * @param {any} val
 * @returns {Error}
 */
function invalidTypeError(valName, typeName, val) {
    return new Error(`Expected type ${typeName} for ${valName} but received ${val} of type ${val === null ? null : typeof val}`);
}

/**
 * Does this value have an invalid type? If true, then throw an Error.
 * 
 * @param {string} valName
 * @param {string} typeName
 * @param {any} val
 * @param {boolean} [isOptional=false] - is val an optional argument?
 * @returns {void}
 */
function invalidType(valName, typeName, val, isOptional = false) {
    if (isOptional && !defined(val)) return;

    if (!typeChecker(typeName)(val)) {
        throw invalidTypeError(valName, typeName, val);
    }
}

/**
 * Is this array of selected elements empty?
 * 
 * @param {Array<any>} elements
 * @param {string} selector
 * @returns {void}
 */
function emptySelection(elements, selector) {
    if (elements.length === 0) {
        throw new Error(`Selector ${selector} do not match any element`);
    }
}

module.exports = {
    defined,
    string,
    number,
    object,
    boolean,
    array,
    fn,
    invalidTypeError,
    invalidType,
    emptySelection
};