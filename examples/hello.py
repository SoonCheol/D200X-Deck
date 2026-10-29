"""Send a numbered test page to the D200 and print input frames."""
from __future__ import annotations

import json
import sys
import time

from ulanzi_deck import protocol as P
from ulanzi_deck.page import DEFAULT_FONT, Key, build_page, render_icon
from ulanzi_deck.transport import Deck


def clock_payload() -> bytes:
    now = time.localtime()
    return f"1|{now.tm_min}|{now.tm_sec}|{time.strftime('%H:%M:%S')}|0|24H|".encode()


def main() -> None:
    keys = {}
    for row in range(3):
        for col in range(5):
            n = row * 5 + col + 1
            hue = int(255 * (n - 1) / 14)
            keys[(col, row)] = Key(
                icon=render_icon(str(n), border=(80 + hue // 3, 180 - hue // 4, 255 - hue // 3))
            )

    page = build_page(keys)
    with Deck() as deck:
        deck.send_frame(0, P.PROTO_DEVICE_INFO)
        deck.send_frame(0, P.PROTO_FONT, json.dumps(DEFAULT_FONT).encode())
        deck.send_frame(0, P.PROTO_BRIGHTNESS, b"85")
        deck.send_frame(0, P.PROTO_SLEEP, b"0")
        deck.send_frame(0, P.PROTO_PAGE, page)
        deck.send_frame(0, P.PROTO_CLOCK, clock_payload())
        print(f"sent page ({len(page)} bytes). Press keys / knobs; Ctrl-C to stop.", flush=True)

        last_clock = time.time()
        while True:
            frame = deck.read_frame(1000)
            if frame:
                print(
                    f"cmd={frame.cmd:#04x} proto={frame.proto:#04x} "
                    f"len={len(frame.payload)} {frame.payload[:24].hex()}",
                    flush=True,
                )
            if time.time() - last_clock >= 5:
                deck.send_frame(0, P.PROTO_CLOCK, clock_payload())
                last_clock = time.time()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
