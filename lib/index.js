/**
 * Copyright (c) 2025 CuteStoryteller
 * All Rights Reserved. MIT License
 */

'use strict';

const Cartmin = require('./constructor.js');
require('./navigation.js')(Cartmin);
require('./file-manager.js')(Cartmin);
require('./product.js')(Cartmin);

module.exports = Cartmin;