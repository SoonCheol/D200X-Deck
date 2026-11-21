# Fusion command catalog analysis

## Inputs and method

- Reference XML: 80 files (read locally; originals are not embedded in outputs)
- MCP catalog: 3151 unique IDs
- Fusion API: 18144 placements, 499 errors, 1385 unique placed IDs
- Output omits original XML text and tooltip prose; names are existing API names or exact Korean resource translations.
- Runtime executability is unknown. `defaultVisible` is a catalog display choice, not proof a command can execute.

## Rebuild

Keep the private XML copies in `tools/fusion-mcp/reference/` and the MCP catalog at the project root. Run:

`python tools/fusion-mcp/build-fusion-command-catalog.py --api-placements <fusion-ui-placements.json> --replace`

Only the three derived artifacts are suitable for this repository; do not commit the reference XML or raw API capture.

## Counts

- XML CommandDefinition entries: 1212; unique IDs: 1164; repeated occurrences: 48
- XML definition IDs also in MCP catalog: 1160; XML-only definition IDs: 4; MCP-only IDs: 1991
- Static XML placement IDs: 2045; also in API placements: 1037; XML-only placements: 1008; API-only placements: 348
- XML placement IDs absent from MCP catalog: 115 (retained, hidden by default)
- Final commands: 3266; distinct paths: 24405
- direct_toolbar: 1368
- toolbar_dropdown: 131
- menu_only: 892
- debug_only: 2
- unplaced: 873
- Korean translation conflicts (multiple distinct exact translations for one ID): 0

- Commands with no confirmed name: 120

## Coverage and limitations

- Repeated command IDs have one command record with multiple paths. Duplicate paths are removed by source and ordered ID chain.
- Static XML declares possible placements; the API capture records runtime placements. Neither proves present executability.
- `unplaced` commands remain in JSON but are hidden from the default list. A debug-only path is hidden; internal-only status is not asserted without evidence.
- API errors: 499; XML does not identify the failed runtime control at those positions reliably.
- API error type `2 : InternalValidationError : control`: 498
- API error type `3 : No product type is associated to this workspace object yet. Please get workspace object by UserInterface::workspacesByProductType().`: 1
- Unresolved XML entity references / parse issues: 12. Shared DTD fragments outside the 80-file input were omitted; affected paths may be incomplete.

## XML issues

- Animation\UI\AnimationUI\Resources\Toolbar\TabToolbars.xml: 1 external entity reference(s) omitted
- Electron\UI\Resources\Toolbar\TabToolbars.xml: 3 external entity reference(s) omitted
- Fusion\UI\FusionUI\Resources\Toolbar\TabToolbars.xml: 2 external entity reference(s) omitted
- NeuCAM\UI\NeuCAMUI\Resources\Toolbar\TabToolbars.xml: 1 external entity reference(s) omitted
- Simulation\Extensions\FluidDynamics\UI\Resources\Toolbar\TabToolbars.xml: 2 external entity reference(s) omitted
- Simulation\Extensions\InjectionMolding\UI\Resources\Toolbar\TabToolbars.xml: 2 external entity reference(s) omitted
- Simulation\Extensions\LinearStaticStress\UI\Resources\Toolbar\GenerativeFluidsToolbar\TabToolbars.xml: 3 external entity reference(s) omitted
- Simulation\Extensions\LinearStaticStress\UI\Resources\Toolbar\GenerativeToolbar\TabToolbars.xml: 3 external entity reference(s) omitted
- Simulation\Extensions\LinearStaticStress\UI\Resources\Toolbar\SimulationToolbar\TabToolbars.xml: 2 external entity reference(s) omitted
- Simulation\Extensions\Template\UI\Resources\Toolbar\TabToolbars.xml: 2 external entity reference(s) omitted
- Simulation\UI\SimDesignVariationsUI\Resources\Toolbar\EditModelWMToolbar\TabToolbars.xml: 2 external entity reference(s) omitted
- Simulation\UI\SimDesignVariationsUI\Resources\Toolbar\SimplifyWMToolbar\TabToolbars.xml: 2 external entity reference(s) omitted
