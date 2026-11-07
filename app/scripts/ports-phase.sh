#!/bin/sh
# usage: ports-phase.sh NAME SECONDS  -> writes # <time> NAME_START / NAME_END markers
L="$HOME/Library/Logs/Ulanzi Deck Open/port-monitor.log"
mark() { printf '# %s %s\n' "$(date '+%F %T')" "$1" >> "$L"; }
mark "$1_START"; sleep "$2"; mark "$1_END"
