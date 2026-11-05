// hotkey — posts a keyboard shortcut as a HID-level event.
//
// AppleScript/System Events events are ignored by apps that watch HID state
// (screen capture tools, Shottr, etc.). Posting from
// kCGEventSourceStateHIDSystemState looks like a real keyboard to them.
//
// usage: hotkey <virtual-keycode> [cmd] [shift] [alt] [ctrl]
//        hotkey text <utf8 text> [enter]
//
// `text` posts Unicode strings, so emoji and accents do not depend on the
// keyboard layout the way System Events `keystroke` does.

#import <Cocoa/Cocoa.h>

static void post_key(CGEventSourceRef source, CGKeyCode code, NSString *chunk) {
  for (int i = 0; i < 2; i++) {
    CGEventRef event = CGEventCreateKeyboardEvent(source, code, i == 0);
    CGEventSetFlags(event, 0);
    if (chunk) {
      UniChar units[64];
      NSUInteger n = MIN([chunk length], (NSUInteger)64);
      [chunk getCharacters:units range:NSMakeRange(0, n)];
      CGEventKeyboardSetUnicodeString(event, n, units);
    }
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
    usleep(5000);
  }
}

static int type_text(const char *utf8, int enter) {
  CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  if (!source) {
    fprintf(stderr, "could not create event source\n");
    return 3;
  }
  NSString *text = [NSString stringWithUTF8String:utf8];
  if (!text) {
    fprintf(stderr, "text is not valid UTF-8\n");
    CFRelease(source);
    return 2;
  }
  // Chunks end on a character boundary so a surrogate pair or an emoji
  // sequence is never split across two events.
  __block NSMutableString *chunk = [NSMutableString string];
  [text enumerateSubstringsInRange:NSMakeRange(0, [text length])
                           options:NSStringEnumerationByComposedCharacterSequences
                        usingBlock:^(NSString *piece, NSRange r, NSRange er, BOOL *stop) {
    if ([chunk length] + [piece length] > 32) {
      post_key(source, 0, chunk);
      [chunk setString:@""];
    }
    [chunk appendString:piece];
  }];
  if ([chunk length]) post_key(source, 0, chunk);
  if (enter) post_key(source, 36, nil);
  CFRelease(source);
  return 0;
}

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc >= 3 && !strcmp(argv[1], "text")) {
      return type_text(argv[2], argc > 3 && !strcmp(argv[3], "enter"));
    }
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
