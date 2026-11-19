/* Bicycle Tracker BD \u2014 fixed option lists (names only, no claims).
 * Common route names are quick-pick buttons that fill the route field;
 * the user can type any route. The app stores the user's own records. */
'use strict';

const BIKE_TYPES = ['road', 'mtb', 'hybrid', 'city'];
const SERVICE_TYPES = ['chain-lube', 'brake-pads', 'tyre-tube', 'gear-tune', 'full-service', 'other'];
const COMMON_ROUTES = [
  'Dhanmondi Lake loop',
  'Hatirjheel loop',
  'Uttara\u2013Airport road',
  'Campus loop',
  'Riverside road',
];

if (typeof module !== 'undefined') {
  module.exports = { BIKE_TYPES, SERVICE_TYPES, COMMON_ROUTES };
}

/* Browser global: app.js reads DATA.* (classic scripts share scope). */
var DATA = { BIKE_TYPES, SERVICE_TYPES, COMMON_ROUTES };
