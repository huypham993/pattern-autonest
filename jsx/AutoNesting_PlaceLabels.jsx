//@target illustrator
/*
 * Illustrator True-Shape Auto Nesting - Place Labels - DEVELOPMENT ENTRY POINT.
 * Users run dist/AutoNesting_PlaceLabels_Standalone.jsx (built by tools/build/build_jsx.js),
 * or the "Place labels" button of the panel (which also sets the label height, position and grouping).
 * Defaults here: 0.5 mm gap, size kept, bottom left, no grouping.
 */
//@include "lib/an_json.jsxinc"
//@include "lib/an_extract.jsxinc"
//@include "lib/an_io.jsxinc"
//@include "lib/an_labels.jsxinc"

if (typeof AN_NO_MAIN === "undefined") {
    (function () {
        var msg = AN_labelsMessage(AN_placeLabels({ gapMm: 0.5, heightMm: "", corner: "bottom_left", group: false }));
        if (msg) { alert("Illustrator Auto Nesting - Place labels\n\n" + msg); }
    }());
}
