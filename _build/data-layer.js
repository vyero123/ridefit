/* Ride Fit data layer — THE ONE SEAM between the app and its vehicle data.  ES5 ONLY.
 *
 * The app never touches raw records; it calls RideFitData.load(cb) and receives the
 * brand -> model -> config tree it always worked with.  Records come from vehicles.json
 * (schema v1: { schemaVersion, generatedAt, vehicles: [ {id, identity, exterior, interior,
 * capacity, provenance} ] }).
 *
 * Two transports, chosen by MODE:
 *   'inline'   — build.py inlines vehicles.json as window.RIDEFIT_VEHICLES (offline, today).
 *   'endpoint' — XHR GET of ENDPOINT (same JSON document served over HTTP, later).
 * Switching is the single line marked SEAM below plus the endpoint URL. Nothing else changes.
 */
var RideFitData = (function () {
  'use strict';

  var MODE = 'inline';                 /* SEAM: 'inline' | 'endpoint' */
  var ENDPOINT = 'vehicles.json';      /* used only when MODE === 'endpoint' */
  var SCHEMA = 2;

  /* grouped record -> flat config the renderer/fit logic consume (keys unchanged from before) */
  function toFlat(r) {
    var c = {}, g, k, groups = ['exterior', 'interior', 'capacity'];
    c.id = r.id;
    c.brand = r.identity.brand; c.model = r.identity.model; c.name = r.identity.config;
    for (k in r.identity) { if (r.identity.hasOwnProperty(k) && k !== 'config') { c[k] = r.identity[k]; } }
    for (g = 0; g < groups.length; g++) {
      if (r[groups[g]]) { for (k in r[groups[g]]) { if (r[groups[g]].hasOwnProperty(k)) { c[k] = r[groups[g]][k]; } } }
    }
    if (r.equipment) { c.equipment = r.equipment; }   /* banked, not surfaced in any UI yet */
    if (r.safety) { c.safety = r.safety; }
    if (r.market) { c.market = r.market; }
    if (r.provenance) {
      if (r.provenance.source) { c.src = r.provenance.source; }
      if (r.provenance.roomSource) { c.roomSrc = r.provenance.roomSource; }
      if (r.provenance.approx) { c.approx = r.provenance.approx; }
      if (r.provenance.asOf) { c.asOf = r.provenance.asOf; }
    }
    return c;
  }

  /* flat configs -> { brands: [ { name, models: [ { name, configs: [...] } ] } ] } in first-seen order */
  function toTree(recs) {
    var brands = [], bIdx = {}, i, c, b, m;
    for (i = 0; i < recs.length; i++) {
      c = toFlat(recs[i]);
      if (bIdx[c.brand] === undefined) { bIdx[c.brand] = brands.length; brands.push({ name: c.brand, models: [], _m: {} }); }
      b = brands[bIdx[c.brand]];
      if (b._m[c.model] === undefined) { b._m[c.model] = b.models.length; b.models.push({ name: c.model, configs: [] }); }
      m = b.models[b._m[c.model]];
      m.configs.push(c);
    }
    for (i = 0; i < brands.length; i++) { delete brands[i]._m; }
    return { brands: brands };
  }

  function validate(doc) {
    if (!doc || !doc.vehicles || !doc.vehicles.length) { return 'no vehicles in document'; }
    if (doc.schemaVersion !== SCHEMA) { return 'unsupported schemaVersion ' + doc.schemaVersion; }
    return null;
  }

  function load(cb) {
    var doc, err;
    if (MODE === 'inline') {
      doc = (typeof window !== 'undefined' && window.RIDEFIT_VEHICLES) ? window.RIDEFIT_VEHICLES :
            (typeof RIDEFIT_VEHICLES !== 'undefined' ? RIDEFIT_VEHICLES : null);
      err = validate(doc);
      cb(err, err ? null : toTree(doc.vehicles), doc);
      return;
    }
    try {
      var x = new XMLHttpRequest();
      x.open('GET', ENDPOINT, true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4) { return; }
        if (x.status < 200 || x.status >= 300) { cb('HTTP ' + x.status, null, null); return; }
        try { doc = JSON.parse(x.responseText); } catch (e) { cb('bad JSON', null, null); return; }
        err = validate(doc);
        cb(err, err ? null : toTree(doc.vehicles), doc);
      };
      x.send(null);
    } catch (e2) { cb(String(e2), null, null); }
  }

  return { load: load, toFlat: toFlat, toTree: toTree, MODE: MODE, SCHEMA: SCHEMA };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = RideFitData; }
