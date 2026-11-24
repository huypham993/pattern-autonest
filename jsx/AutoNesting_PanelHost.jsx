//@target illustrator
/*
 * Illustrator True-Shape Auto Nesting - host script of the CEP panel.
 * Defines AN_exportGeometry / AN_applyPlacement / AN_placeLabels and runs nothing by itself:
 * the panel loads dist/AutoNesting_PanelHost.jsx with $.evalFile and calls
 * AN_panelExport / AN_panelApply / AN_panelPlaceLabels through CSInterface.evalScript.
 */
//@include "lib/an_json.jsxinc"
//@include "lib/an_extract.jsxinc"
//@include "lib/an_io.jsxinc"
//@include "lib/an_main.jsxinc"
//@include "lib/an_apply.jsxinc"
//@include "lib/an_panel.jsxinc"
//@include "lib/an_labels.jsxinc"
