"""Wire protocol for the Ulanzi D200.

See docs/PROTOCOL.md for the reverse-engineered details.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

MAGIC = b"\x7c\x7c"
CHUNK = 1024
REPORT_ID = 0x00

# Host -> device operations (all sent with cmd=0x00).
PROTO_PAGE = 0x01       # upload a page package (ZIP)
PROTO_DEVICE_INFO = 0x03
PROTO_CLOCK = 0x06      # "1|MM|SS|HH:MM:SS|0|24H|"
PROTO_BRIGHTNESS = 0x0A
PROTO_FONT = 0x0B
PROTO_SLEEP = 0x1A

# Device -> host commands.
CMD_KEY_EVENT = 0x00
CMD_BATTERY = 0x01
CMD_DEVICE_INFO = 0x03

# DeviceInput.kind
INPUT_KEY = 1
INPUT_KNOB = 2


@dataclass(frozen=True)
class Frame:
    cmd: int
    proto: int
    payload: bytes


def encode_frame(cmd: int, proto: int, payload: bytes = b"") -> bytes:
    """Build a frame padded to the next 1024-byte boundary."""
    frame = MAGIC + bytes((cmd & 0xFF, proto & 0xFF)) + struct.pack("<I", len(payload)) + payload
    return frame + b"\x00" * (-len(frame) % CHUNK)


def split_chunks(stream: bytes, report_id: int = REPORT_ID) -> list[bytes]:
    """Split a padded frame stream into 1025-byte HID output reports."""
    if len(stream) % CHUNK:
        raise ValueError("stream must be padded to a 1024-byte boundary")
    return [bytes((report_id,)) + stream[i:i + CHUNK] for i in range(0, len(stream), CHUNK)]


def decode_report(data: bytes) -> Frame | None:
    """Parse one 1024-byte input report. Returns None if it is not a frame."""
    if len(data) < 8 or data[:2] != MAGIC:
        return None
    length = struct.unpack("<I", data[4:8])[0]
    if length > len(data) - 8:
        return None
    return Frame(data[2], data[3], data[8:8 + length])
