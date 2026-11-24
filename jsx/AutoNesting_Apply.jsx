//@target illustrator
/*
 * Illustrator True-Shape Auto Nesting - Apply Placement - DEVELOPMENT ENTRY POINT.
 * Users run dist/AutoNesting_Apply_Standalone.jsx (built by tools/build/build_jsx.js),
 * or the "Ap dung" button of the panel.
 */
//@include "lib/an_json.jsxinc"
//@include "lib/an_extract.jsxinc"
//@include "lib/an_io.jsxinc"
//@include "lib/an_apply.jsxinc"

if (typeof AN_NO_MAIN === "undefined") {
    AN_applyMain();
}
