"""hidapi transport for the Ulanzi D200.

Uses ctypes so it works without building a Python extension.  A libhidapi
shared library is looked up in the usual Homebrew/system locations, and as a
fallback inside the Ulanzi Studio bundle (macOS).
"""
from __future__ import annotations

import ctypes as C
import ctypes.util
import os
import platform
import sys
from pathlib import Path

from .protocol import CHUNK, encode_frame, split_chunks, decode_report, Frame

VID = 0x2207
PID = 0x0019
CONTROL_INTERFACE = 0

_CANDIDATES = [
    "/opt/homebrew/lib/libhidapi.dylib",
    "/usr/local/lib/libhidapi.dylib",
    "/opt/homebrew/lib/libhidapi-hidraw.dylib",
    "/usr/local/lib/libhidapi-hidraw.dylib",
    "/Applications/Ulanzi Studio.app/Contents/Frameworks/libhidapi.0.dylib",
    "/usr/lib/libhidapi-hidraw.so.0",
    "/usr/lib/x86_64-linux-gnu/libhidapi-hidraw.so.0",
]


class _Info(C.Structure):
    pass


_Info._fields_ = [
    ("path", C.c_char_p),
    ("vendor_id", C.c_ushort),
    ("product_id", C.c_ushort),
    ("serial_number", C.c_wchar_p),
    ("release_number", C.c_ushort),
    ("manufacturer_string", C.c_wchar_p),
    ("product_string", C.c_wchar_p),
    ("usage_page", C.c_ushort),
    ("usage", C.c_ushort),
    ("interface_number", C.c_int),
    ("next", C.POINTER(_Info)),
]


def _load() -> C.CDLL:
    found = ctypes.util.find_library("hidapi")
    paths = ([found] if found else []) + _CANDIDATES
    for p in paths:
        if p and os.path.exists(p):
            try:
                lib = C.CDLL(p)
                lib.hid_enumerate.restype = C.POINTER(_Info)
                lib.hid_enumerate.argtypes = [C.c_ushort, C.c_ushort]
                lib.hid_open_path.restype = C.c_void_p
                lib.hid_open_path.argtypes = [C.c_char_p]
                lib.hid_write.argtypes = [C.c_void_p, C.c_char_p, C.c_size_t]
                lib.hid_read_timeout.argtypes = [C.c_void_p, C.c_char_p, C.c_size_t, C.c_int]
                lib.hid_close.argtypes = [C.c_void_p]
                lib.hid_init()
                return lib
            except OSError:
                continue
    raise RuntimeError(
        "libhidapi not found. Install it (brew install hidapi) or keep Ulanzi Studio installed."
    )


class Deck:
    """A D200 control channel."""

    def __init__(self, interface: int = CONTROL_INTERFACE, vid: int = VID, pid: int = PID):
        self._hid = _load()
        path = None
        p = self._hid.hid_enumerate(vid, pid)
        while p:
            info = p.contents
            if info.interface_number == interface:
                path = info.path
                break
            p = info.next
        if not path:
            raise RuntimeError(f"no D200 interface {interface} found (vid={vid:#06x} pid={pid:#06x})")
        self._dev = self._hid.hid_open_path(path)
        if not self._dev:
            raise RuntimeError("hid_open_path failed (is Ulanzi Studio still running?)")

    def send_frame(self, cmd: int, proto: int, payload: bytes = b"") -> None:
        for report in split_chunks(encode_frame(cmd, proto, payload)):
            n = self._hid.hid_write(self._dev, report, len(report))
            if n < 0:
                raise RuntimeError(f"hid_write failed ({n})")

    def read_frame(self, timeout_ms: int = 1000) -> Frame | None:
        buf = C.create_string_buffer(CHUNK)
        n = self._hid.hid_read_timeout(self._dev, buf, CHUNK, timeout_ms)
        if n <= 0:
            return None
        return decode_report(buf.raw[:n])

    def close(self) -> None:
        if self._dev:
            self._hid.hid_close(self._dev)
            self._dev = None

    def __enter__(self) -> "Deck":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
