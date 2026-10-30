// mediakey — posts macOS media key events (play/pause, track skip, volume, mute).
//
// AppleScript cannot press media keys: they are NX_SYSDEFINED events, so we
// synthesise them here and ship the binary next to the app like hidseize.
//
// The sequence matches Ulanzi Studio's `MediaKeysBridge` exactly:
//   1. post a Command key-up to prime the HID event queue,
//   2. post the NX_SYSDEFINED key-down,
//   3. post the key-up immediately (no sleep: waiting makes macOS treat the
//      volume/mute key as held and repeat it).
//
// usage: mediakey playpause|next|prev|volumeup|volumedown|mute

#import <Cocoa/Cocoa.h>

enum {
  NX_KEYTYPE_SOUND_UP = 0,
  NX_KEYTYPE_SOUND_DOWN = 1,
  NX_KEYTYPE_MUTE = 7,
  NX_KEYTYPE_PLAY = 16,
  NX_KEYTYPE_NEXT = 17,
  NX_KEYTYPE_PREVIOUS = 18,
};

static int keyCodeFor(const char *name) {
  if (!strcmp(name, "volumeup")) return NX_KEYTYPE_SOUND_UP;
  if (!strcmp(name, "volumedown")) return NX_KEYTYPE_SOUND_DOWN;
  if (!strcmp(name, "mute")) return NX_KEYTYPE_MUTE;
  if (!strcmp(name, "playpause")) return NX_KEYTYPE_PLAY;
  if (!strcmp(name, "next")) return NX_KEYTYPE_NEXT;
  if (!strcmp(name, "prev")) return NX_KEYTYPE_PREVIOUS;
  return -1;
}

static void initEventQueue(void) {
  CGEventSourceRef source = CGEventSourceCreate((CGEventSourceStateID)-1);
  CGEventRef event = CGEventCreateKeyboardEvent(source, 0x37, false);
  CGEventPost(kCGHIDEventTap, event);
  CFRelease(event);
  CFRelease(source);
}

static void postKey(int key, int down) {
  int flags = down ? 0xa00 : 0xb00;
  NSEvent *event = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                                     location:NSZeroPoint
                                modifierFlags:flags
                                    timestamp:0
                                 windowNumber:0
                                      context:nil
                                      subtype:8
                                        data1:(key << 16) | flags
                                        data2:-1];
  CGEventPost(kCGHIDEventTap, [event CGEvent]);
}

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: mediakey playpause|next|prev|volumeup|volumedown|mute\n");
      return 2;
    }
    int key = keyCodeFor(argv[1]);
    if (key < 0) {
      fprintf(stderr, "unknown media key: %s\n", argv[1]);
      return 2;
    }
    initEventQueue();
    postKey(key, 1);
    postKey(key, 0);
  }
  return 0;
}
