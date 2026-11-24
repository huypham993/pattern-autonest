//@target illustrator
/*
 * Illustrator True-Shape Auto Nesting - DEVELOPMENT ENTRY POINT.
 *
 * DO NOT distribute or run this file on its own: it pulls in jsx/lib/*.jsxinc
 * through //@include, which fails with "Error 48: File or folder does not
 * exist" whenever the lib folder is not next to it (for example when only
 * this file is downloaded, or when it is run from inside a zip archive).
 *
 * Users run the single-file build instead:
 *     dist/Illustrator_AutoNesting_Standalone.jsx
 * produced and verified by:  node tools/build/build_jsx.js
 */
//@include "lib/an_json.jsxinc"
//@include "lib/an_extract.jsxinc"
//@include "lib/an_io.jsxinc"
//@include "lib/an_main.jsxinc"

if (typeof AN_NO_MAIN === "undefined") {
    AN_main();
}
