"use strict";
const names = new Set(require("../translations/intentional-names.json"));
const isIntentionalName = text => names.has(text) || /^\d+(?:\.\d+)?%?$/.test(text) || /^\d+:\d+$/.test(text);
module.exports = { isIntentionalName };
