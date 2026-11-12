# Windows-only input bridge. Invoked with separate argv, never through a shell.
# Uses Win32 keyboard input, not the clipboard. Elevated target windows may reject input.
param(
  [Parameter(Mandatory=$true)][ValidateSet('hotkey','text')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$PayloadBase64,
  [switch]$Enter
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DeckWinInput {
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Explicit, Size=40)]
    public struct INPUT {
        [FieldOffset(0)] public uint type;
        [FieldOffset(8)] public KEYBDINPUT ki;
    }
    [DllImport("user32.dll", SetLastError=true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")]
    private static extern short VkKeyScanW(char c);

    const uint KEYUP = 0x0002, UNICODE = 0x0004, SCANCODE = 0x0008;
    static INPUT Key(ushort vk, ushort scan, uint flags) {
        return new INPUT { type = 1, ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags } };
    }
    static void Send(List<INPUT> events) {
        if (events.Count == 0) return;
        var data = events.ToArray();
        uint done = SendInput((uint)data.Length, data, Marshal.SizeOf(typeof(INPUT)));
        if (done != data.Length) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "SendInput failed");
    }
    public static void Hotkey(string value) {
        var parts = value.ToLowerInvariant().Split('+');
        if (parts.Length == 0) throw new ArgumentException("Empty hotkey");
        var mods = new List<ushort>();
        var name = parts[parts.Length - 1].Trim();
        var map = new Dictionary<string, ushort> {
            {"enter",13},{"return",13},{"tab",9},{"space",32},{"escape",27},{"esc",27},
            {"backspace",8},{"delete",46},{"left",37},{"up",38},{"right",39},{"down",40},
            {"home",36},{"end",35},{"pageup",33},{"pagedown",34},{"insert",45},
            {"numpadplus",107},{"numpadminus",109},{"numpadmultiply",106},
            {"numpaddivide",111},{"numpaddecimal",110}
        };
        for (int i=0;i<parts.Length-1;i++) {
            switch(parts[i].Trim()) {
              case "ctrl": case "control": mods.Add(0x11); break;
              case "shift": mods.Add(0x10); break;
              case "alt": case "option": mods.Add(0x12); break;
              case "win": case "meta": case "cmd": case "command": mods.Add(0x5B); break;
              default: throw new ArgumentException("Unknown modifier: " + parts[i]);
            }
        }
        ushort vk;
        if (!map.TryGetValue(name, out vk)) {
            if (name.Length == 1 && name[0] >= 'a' && name[0] <= 'z') vk = (ushort)Char.ToUpperInvariant(name[0]);
            else if (name.Length == 1 && name[0] >= '0' && name[0] <= '9') vk = (ushort)name[0];
            else if (name.Length > 1 && name[0] == 'f' && int.TryParse(name.Substring(1), out int fn) && fn >= 1 && fn <= 24) vk = (ushort)(0x70 + fn - 1);
            else if (name.StartsWith("numpad") && int.TryParse(name.Substring(6), out int digit) && digit >= 0 && digit <= 9) vk = (ushort)(0x60 + digit);
            else if (name.Length == 1) {
                short mapped = VkKeyScanW(name[0]);
                if (mapped == -1) throw new ArgumentException("Unsupported key: " + name);
                vk = (ushort)(mapped & 0xff);
                if ((mapped & 0x0100) != 0 && !mods.Contains(0x10)) mods.Add(0x10);
            } else throw new ArgumentException("Unsupported key: " + name);
        }
        var down = new List<INPUT>();
        foreach(var m in mods) down.Add(Key(m, 0, 0));
        down.Add(Key(vk, 0, 0));
        down.Add(Key(vk, 0, KEYUP));
        for (int i=mods.Count-1;i>=0;i--) down.Add(Key(mods[i], 0, KEYUP));
        Send(down);
    }
    public static void Text(string value, bool enter) {
        // Unicode units are sent as KEYEVENTF_UNICODE, no clipboard modification.
        var events = new List<INPUT>();
        foreach(char ch in value) {
            events.Add(Key(0, ch, UNICODE));
            events.Add(Key(0, ch, UNICODE | KEYUP));
        }
        if (enter) { events.Add(Key(13, 0, 0)); events.Add(Key(13, 0, KEYUP)); }
        Send(events);
    }
}
'@
$value = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))
if ($Mode -eq 'hotkey') { [DeckWinInput]::Hotkey($value) }
else { [DeckWinInput]::Text($value, [bool]$Enter) }
