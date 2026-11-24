//@target illustrator
/*
 * Illustrator Auto Nesting - SMOKE TEST, development entry point.
 * Users run the single-file build: dist/AutoNesting_SmokeTest_Standalone.jsx
 * (produced and verified by: node tools/build/build_jsx.js)
 */
//@include "lib/an_json.jsxinc"
//@include "lib/an_extract.jsxinc"
//@include "lib/an_io.jsxinc"
//@include "lib/an_main.jsxinc"
//@include "lib/an_smoke.jsxinc"

if (typeof AN_NO_MAIN === "undefined") {
    AN_smokeMain();
}
