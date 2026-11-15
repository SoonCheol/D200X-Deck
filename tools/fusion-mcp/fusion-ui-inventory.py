# Fusion 360 UI inventory (read-only). Run inside Fusion 360's Scripts and Add-Ins.
# Extracts workspace > tab > panel > dropdown/split-button > command IDs.
# Does not activate workspaces or execute commands and does not modify the UI.
import adsk.core
import datetime
import json
import os
import traceback

def _s(obj, attr, fallback=''):
    try:
        v = getattr(obj, attr)
        return str(v) if v is not None else fallback
    except Exception:
        return fallback

def _controls(controls, placement, out, errors, depth=0):
    if depth > 12:
        errors.append({'path': placement, 'error': 'max dropdown depth'})
        return
    try:
        count = controls.count
    except Exception as exc:
        errors.append({'path': placement, 'error': str(exc)})
        return
    for i in range(count):
        try:
            control = controls.item(i)
            if not control:
                continue
            kind = _s(control, 'objectType')
            node = {'controlId': _s(control, 'id'), 'controlName': _s(control, 'name'),
                    'controlType': kind, 'position': i}
            p = placement + [node]
            if kind == adsk.core.DropDownControl.classType():
                _controls(control.controls, p, out, errors, depth + 1)
            elif kind == adsk.core.SplitButtonControl.classType():
                definitions = []
                try:
                    definitions.append(control.defaultCommandDefinition)
                except Exception:
                    pass
                try:
                    definitions.extend(list(control.additionalDefinitions))
                except Exception:
                    pass
                for definition in definitions:
                    if definition and _s(definition, 'id'):
                        out.append({'commandId': _s(definition, 'id'),
                                    'commandName': _s(definition, 'name'), 'path': p})
            elif kind == adsk.core.CommandControl.classType():
                definition = control.commandDefinition
                if definition and _s(definition, 'id'):
                    out.append({'commandId': _s(definition, 'id'),
                                'commandName': _s(definition, 'name'), 'path': p})
        except Exception as exc:
            errors.append({'path': placement, 'position': i, 'error': str(exc)})

def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        placements = []
        errors = []
        workspaces = []
        for w in ui.workspaces:
            ws = {'id': _s(w, 'id'), 'name': _s(w, 'name')}
            workspaces.append(ws)
            try:
                for tab in w.toolbarTabs:
                    tab_info = {'id': _s(tab, 'id'), 'name': _s(tab, 'name')}
                    for panel in tab.toolbarPanels:
                        panel_info = {'id': _s(panel, 'id'), 'name': _s(panel, 'name')}
                        base = [{'workspace': ws}, {'tab': tab_info}, {'panel': panel_info}]
                        _controls(panel.controls, base, placements, errors)
            except Exception as exc:
                errors.append({'workspace': ws, 'error': str(exc)})
        for toolbar in ui.toolbars:
            base = [{'toolbar': {'id': _s(toolbar, 'id')}}]
            _controls(toolbar.controls, base, placements, errors)
        result = {
            'format': 'deckforge-fusion-ui-placements-v1',
            'fusionVersion': _s(app, 'version', 'unknown'),
            'collectedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'activeWorkspaceId': _s(ui.activeWorkspace, 'id'),
            'workspaces': workspaces,
            'placements': placements,
            'errors': errors
        }
        # Store alongside the user-exported catalog, never overwrite prior captures.
        base = os.path.join(os.path.expanduser('~'), 'Downloads')
        name = 'fusion-ui-placements-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json'
        destination = os.path.join(base, name)
        with open(destination, 'x', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        ui.messageBox('Fusion UI hierarchy captured (read-only).\\n'
                      + 'Workspaces: ' + str(len(workspaces)) + '\\n'
                      + 'Placements: ' + str(len(placements)) + '\\n'
                      + 'Errors: ' + str(len(errors)) + '\\n'
                      + destination)
    except Exception:
        if ui:
            ui.messageBox('Fusion UI capture failed:\\n' + traceback.format_exc())
