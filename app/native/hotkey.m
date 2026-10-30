// hotkey — posts a keyboard shortcut as a HID-level event.
//
// AppleScript/System Events events are ignored by apps that watch HID state
// (screen capture tools, Shottr, etc.). Posting from
// kCGEventSourceStateHIDSystemState looks like a real keyboard to them.
//
// usage: hotkey <virtual-keycode> [cmd] [shift] [alt] [ctrl]

#import <Cocoa/Cocoa.h>

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: hotkey <keycode> [cmd] [shift] [alt] [ctrl]\n");
      return 2;
    }
    CGKeyCode code = (CGKeyCode)atoi(argv[1]);
    CGEventFlags flags = 0;
    for (int i = 2; i < argc; i++) {
      if (!strcmp(argv[i], "cmd")) flags |= kCGEventFlagMaskCommand;
      else if (!strcmp(argv[i], "shift")) flags |= kCGEventFlagMaskShift;
      else if (!strcmp(argv[i], "alt")) flags |= kCGEventFlagMaskAlternate;
      else if (!strcmp(argv[i], "ctrl")) flags |= kCGEventFlagMaskControl;
    }

    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    if (!source) {
      fprintf(stderr, "could not create event source\n");
      return 3;
    }

    CGEventRef down = CGEventCreateKeyboardEvent(source, code, true);
    CGEventSetFlags(down, flags);
    CGEventPost(kCGHIDEventTap, down);
    usleep(15000);

    CGEventRef up = CGEventCreateKeyboardEvent(source, code, false);
    CGEventSetFlags(up, flags);
    CGEventPost(kCGHIDEventTap, up);

    CFRelease(down);
    CFRelease(up);
    CFRelease(source);
  }
  return 0;
}
