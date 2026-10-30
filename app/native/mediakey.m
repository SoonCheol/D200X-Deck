// mediakey — posts macOS media key events (play/pause, track skip, volume).
//
// AppleScript cannot press media keys: they are NX_SYSDEFINED events, so we
// synthesise them here and ship the binary next to the app like hidseize.
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

static void postKey(int key, int down) {
  int flags = down ? 0xa00 : 0xb00;
  NSEvent *event = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                                     location:NSMakePoint(0, 0)
                                modifierFlags:flags
                                    timestamp:0
                                 windowNumber:0
                                      context:nil
                                      subtype:8
                                        data1:(key << 16) | ((down ? 0xa : 0xb) << 8)
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
    postKey(key, 1);
    usleep(12000);
    postKey(key, 0);
  }
  return 0;
}
