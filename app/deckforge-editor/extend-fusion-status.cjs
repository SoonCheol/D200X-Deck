'use strict';
// Extend only the pinned Autodesk MIT add-in's read-only status method.
// Its HTTP server, command execution, dispatch and SDK plugin remain unchanged.
const fs=require('node:fs');
const path=require('node:path');
const OLD="        'activeDocument': doc.name if doc else None,";
const EXT="# DeckForge read-only context extension; called via Autodesk's existing main-thread dispatcher.\ndef _deckforge_status(app):\n    import os\n    ui = app.userInterface\n    def read_id(getter):\n        try:\n            item = getter()\n            value = item if isinstance(item, str) else (item.id if item else None)\n            return value if isinstance(value, str) and len(value) <= 180 else None\n        except Exception:\n            return None\n    return {\n        'schema': 1,\n        'pid': os.getpid(),\n        'workspace': read_id(lambda: ui.activeWorkspace),\n        'tab': read_id(lambda: ui.activeToolbarTab),\n        'command': read_id(lambda: ui.activeCommand),\n    }";
function extend(source){
  if(source.includes('deckforgeState')||source.split(OLD).length!==2)throw Error('unexpected Fusion status source');
  return source.replace(OLD,OLD+"\n        'deckforgeState': _deckforge_status(app),")+'\n'+EXT+'\n';
}
module.exports={extend};
if(require.main===module){
  const [file,original]=process.argv.slice(2);
  if(!file||!original)throw Error('source and backup path required');
  const data=fs.readFileSync(file,'utf8'),extended=extend(data);
  fs.mkdirSync(path.dirname(original),{recursive:true});
  fs.writeFileSync(original,data,{flag:'wx'});
  fs.writeFileSync(file,extended);
}
